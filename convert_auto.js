/*!
powerfullz 的 Substore 订阅转换脚本
https://github.com/powerfullz/override-rules

支持的传入参数：
- loadbalance: 启用负载均衡（url-test/load-balance，默认 false）
- landing: 启用落地节点功能（如机场家宽/星链/落地分组，默认 false）
- ipv6: 启用 IPv6 支持（默认 false）
- full: 输出完整配置（适合纯内核启动，默认 false）
- keepalive: 启用 tcp-keep-alive（默认 false）
- fakeip: DNS 使用 FakeIP 模式（默认 false，false 为 RedirHost）
- quic: 允许 QUIC 流量（UDP 443，默认 false）
- threshold: 国家节点数量小于该值时不显示分组 (默认 0)
*/

const NODE_SUFFIX = "节点";

function parseBool(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
    }
    return false;
}

function parseNumber(value, defaultValue = 0) {
    if (value === null || typeof value === 'undefined') {
        return defaultValue;
    }
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
}

/**
 * 解析传入的脚本参数，并将其转换为内部使用的功能开关（feature flags）。
 * @param {object} args - 传入的原始参数对象，如 $arguments。
 * @returns {object} - 包含所有功能开关状态的对象。
 *
 * 该函数通过一个 `spec` 对象定义了外部参数名（如 `loadbalance`）到内部变量名（如 `loadBalance`）的映射关系。
 * 它会遍历 `spec` 中的每一项，对 `args` 对象中对应的参数值调用 `parseBool` 函数进行布尔化处理，
 * 并将结果存入返回的对象中。
 */
function buildFeatureFlags(args) {
    const spec = {
        loadbalance: "loadBalance",
        landing: "landing",
        ipv6: "ipv6Enabled",
        full: "fullConfig",
        keepalive: "keepAliveEnabled",
        fakeip: "fakeIPEnabled",
        quic: "quicEnabled"
    };

    const flags = Object.entries(spec).reduce((acc, [sourceKey, targetKey]) => {
        acc[targetKey] = parseBool(args[sourceKey]) || false;
        return acc;
    }, {});

    // 单独处理数字参数
    flags.countryThreshold = parseNumber(args.threshold, 0);

    return flags;
}

const rawArgs = typeof $arguments !== 'undefined' ? $arguments : {};
const {
    loadBalance,
    landing,
    ipv6Enabled,
    fullConfig,
    keepAliveEnabled,
    fakeIPEnabled,
    quicEnabled,
    countryThreshold
} = buildFeatureFlags(rawArgs);

function getCountryGroupNames(countryInfo, minCount) {
    return countryInfo
        .filter(item => item.count >= minCount)
        .map(item => item.country + NODE_SUFFIX);
}

function stripNodeSuffix(groupNames) {
    const suffixPattern = new RegExp(`${NODE_SUFFIX}$`);
    return groupNames.map(name => name.replace(suffixPattern, ""));
}

const PROXY_GROUPS = {
    SELECT: "节点选择",
    AUTO: "自动选择",
    MANUAL: "手动切换",
    FALLBACK: "故障转移",
    DIRECT: "全球直连",
    LANDING: "落地节点",
    LOW_COST: "低倍率节点",
};
const DEFAULT_GROUP_ICON = "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Global.png";
const AI_UNSUPPORTED_GROUPS = {
    "OpenAI": ["香港节点"],
    "Claude": ["香港节点"],
    "Gemini": ["香港节点"],
    "人工智能": ["香港节点"]
};

// 辅助函数，用于根据条件构建数组，自动过滤掉无效值（如 false, null）
const buildList = (...elements) => elements.flat().filter(Boolean);
function buildBaseLists({ landing, lowCost, countryGroupNames, regionGroupNames }) {
    // 使用辅助函数和常量，以声明方式构建各个代理列表

    // “选择节点”组的候选列表
    const defaultSelector = buildList(
        PROXY_GROUPS.AUTO,
        PROXY_GROUPS.FALLBACK,
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        regionGroupNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    // 默认的代理列表，用于大多数策略组
    const defaultProxies = buildList(
        PROXY_GROUPS.SELECT,
        PROXY_GROUPS.AUTO,
        countryGroupNames,
        regionGroupNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.MANUAL,
        PROXY_GROUPS.DIRECT
    );

    // “直连”优先的代理列表
    const defaultProxiesDirect = buildList(
        PROXY_GROUPS.DIRECT,
        countryGroupNames,
        regionGroupNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.AUTO,
        PROXY_GROUPS.SELECT,
        PROXY_GROUPS.MANUAL
    );

    // “故障转移”组的代理列表
    const defaultFallback = buildList(
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        regionGroupNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    return { defaultProxies, defaultProxiesDirect, defaultSelector, defaultFallback };
}

const ruleProviders = {
    "TikTok": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/TikTok.list",
        "path": "./ruleset/TikTok.list"
    },
    "SteamFix": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/SteamFix.list",
        "path": "./ruleset/SteamFix.list"
    },
    "GoogleFCM": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/FirebaseCloudMessaging.list",
        "path": "./ruleset/FirebaseCloudMessaging.list"
    },
    "BanAD": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://testingcf.jsdelivr.net/gh/ACL4SSR/ACL4SSR@master/Clash/BanAD.list",
        "path": "./ruleset/BanAD.list"
    },
    "BanProgramAD": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://testingcf.jsdelivr.net/gh/ACL4SSR/ACL4SSR@master/Clash/BanProgramAD.list",
        "path": "./ruleset/BanProgramAD.list"
    },
    
    "OpenAI": {
        "type": "http",
        "behavior": "classical",
        "format": "yaml",
        "interval": 86400,
        "url": "https://github.ithome.me/https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OpenAI/OpenAI.yaml",
        "path": "./ruleset/OpenAI.yaml"
    },
    "Claude": {
        "type": "http",
        "behavior": "classical",
        "format": "yaml",
        "interval": 86400,
        "url": "https://github.ithome.me/https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Claude/Claude.yaml",
        "path": "./ruleset/Claude.yaml"
    },
    "Gemini": {
        "type": "http",
        "behavior": "classical",
        "format": "yaml",
        "interval": 86400,
        "url": "https://github.ithome.me/https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Gemini/Gemini.yaml",
        "path": "./ruleset/Gemini.yaml"
    },
    
}

const baseRules = [
    `GEOSITE,PRIVATE,${PROXY_GROUPS.DIRECT}`,
    `GEOIP,PRIVATE,${PROXY_GROUPS.DIRECT}`,
    `RULE-SET,BanAD,广告拦截`,
    `RULE-SET,BanProgramAD,应用净化`,
    `RULE-SET,TikTok,TikTok`,
    `RULE-SET,SteamFix,${PROXY_GROUPS.DIRECT}`,
    `RULE-SET,GoogleFCM,${PROXY_GROUPS.DIRECT}`,
    `DOMAIN,services.googleapis.cn,${PROXY_GROUPS.SELECT}`,
    "RULE-SET,OpenAI,OpenAI",
    "RULE-SET,Claude,Claude",
    "RULE-SET,Gemini,Gemini",
    "GEOSITE,CATEGORY-AI-!CN,人工智能",
    `GEOSITE,GOOGLE-PLAY@CN,${PROXY_GROUPS.DIRECT}`,
    `GEOSITE,MICROSOFT@CN,${PROXY_GROUPS.DIRECT}`,
    "GEOSITE,GITHUB,GitHub",
    "GEOSITE,ONEDRIVE,OneDrive",
    "GEOSITE,MICROSOFT,微软服务",
    "GEOSITE,TELEGRAM,电报消息",
    "GEOSITE,YOUTUBE,油管视频",
    "GEOSITE,GOOGLE,谷歌服务",
    "GEOSITE,NETFLIX,奈飞视频",
    "GEOSITE,SPOTIFY,Spotify",
    "GEOSITE,BAHAMUT,Bahamut",
    "GEOSITE,BILIBILI,哔哩哔哩",
    "GEOSITE,PIKPAK,PikPak",
    "GEOSITE,GFW,漏网之鱼",
    `GEOSITE,CN,${PROXY_GROUPS.DIRECT}`,
    "GEOIP,NETFLIX,奈飞视频,no-resolve",
    "GEOIP,TELEGRAM,电报消息,no-resolve",
    `GEOIP,CN,${PROXY_GROUPS.DIRECT}`,
    `MATCH,漏网之鱼`
];

function buildRules({ quicEnabled }) {
    const ruleList = [...baseRules];
    if (!quicEnabled) {
        // 屏蔽 QUIC 流量，避免网络环境 UDP 速度不佳时影响体验
        ruleList.unshift("AND,((DST-PORT,443),(NETWORK,UDP)),REJECT");
    }
    return ruleList;
}

const snifferConfig = {
    "sniff": {
        "TLS": {
            "ports": [443, 8443],
        },
        "HTTP": {
            "ports": [80, 8080, 8880],
        },
        "QUIC": {
            "ports": [443, 8443],
        }
    },
    "override-destination": false,
    "enable": true,
    "force-dns-mapping": true,
    "skip-domain": [
        "Mijia Cloud",
        "dlg.io.mi.com",
        "+.push.apple.com"
    ]
};

function buildDnsConfig({ mode, fakeIpFilter }) {
    const config = {
        "enable": true,
        "ipv6": ipv6Enabled,
        "prefer-h3": true,
        "enhanced-mode": mode,
        "default-nameserver": [
            "119.29.29.29",
            "223.5.5.5"
        ],
        "nameserver": [
            "system",
            "223.5.5.5",
            "119.29.29.29",
            "180.184.1.1"
        ],
        "fallback": [
            "quic://dns0.eu",
            "https://dns.cloudflare.com/dns-query",
            "https://dns.sb/dns-query",
            "tcp://208.67.222.222",
            "tcp://8.26.56.2"
        ],
        "proxy-server-nameserver": [
            "https://dns.alidns.com/dns-query",
            "tls://dot.pub"
        ]
    };

    if (fakeIpFilter) {
        config["fake-ip-filter"] = fakeIpFilter;
    }

    return config;
}

const dnsConfig = buildDnsConfig({ mode: "redir-host" });
const dnsConfigFakeIp = buildDnsConfig({
    mode: "fake-ip",
    fakeIpFilter: [
        "geosite:private",
        "geosite:connectivity-check",
        "geosite:cn",
        "Mijia Cloud",
        "dlg.io.mi.com",
        "localhost.ptlogin2.qq.com",
        "*.icloud.com",
        "*.stun.*.*",
        "*.stun.*.*.*"
    ]
});

const geoxURL = {
    "geoip": "https://gcore.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat",
    "geosite": "https://gcore.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
    "mmdb": "https://gcore.jsdelivr.net/gh/Loyalsoldier/geoip@release/Country.mmdb",
    "asn": "https://gcore.jsdelivr.net/gh/Loyalsoldier/geoip@release/GeoLite2-ASN.mmdb"
};

const REGION_GROUP_MIN = 2;

const REGION_META = {
    "欧洲节点": {
        icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/European_Union.png",
        countries: [
            "英国",
            "德国",
            "法国",
            "荷兰",
            "意大利",
            "西班牙",
            "葡萄牙",
            "瑞典",
            "挪威",
            "芬兰",
            "丹麦",
            "瑞士",
            "奥地利",
            "爱尔兰",
            "比利时",
            "波兰",
            "捷克",
            "乌克兰",
            "俄罗斯"
        ]
    },
    "东南亚节点": {
        icon: "https://gcore.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/categorytravel.png",
        countries: [
            "新加坡",
            "马来西亚",
            "泰国",
            "越南",
            "菲律宾",
            "印度尼西亚"
        ]
    }
};

// 地区元数据
const countriesMeta = {
    "香港": {
        pattern: "香港|港|HK|hk|Hong Kong|HongKong|hongkong|🇭🇰",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/hk.svg"
    },
    "澳门": {
        pattern: "澳门|MO|Macau|🇲🇴",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/mo.svg"
    },
    "台湾": {
        pattern: "台|新北|彰化|TW|Taiwan|🇹🇼",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/tw.svg"
    },
    "新加坡": {
        pattern: "新加坡|坡|狮城|SG|Singapore|🇸🇬",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/sg.svg"
    },
    "日本": {
        pattern: "日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan|🇯🇵",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/jp.svg"
    },
    "韩国": {
        pattern: "KR|Korea|KOR|首尔|韩|韓|🇰🇷",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/kr.svg"
    },
    "美国": {
        pattern: "美国|美|US|United States|🇺🇸",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/us.svg"
    },
    "加拿大": {
        pattern: "加拿大|Canada|CA|🇨🇦",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ca.svg"
    },
    "英国": {
        pattern: "英国|United Kingdom|UK|伦敦|London|🇬🇧",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/gb.svg"
    },
    "澳大利亚": {
        pattern: "澳洲|澳大利亚|AU|Australia|🇦🇺",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/au.svg"
    },
    "德国": {
        pattern: "德国|德|DE|Germany|🇩🇪",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/de.svg"
    },
    "法国": {
        pattern: "法国|法|FR|France|🇫🇷",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/fr.svg"
    },
    "俄罗斯": {
        pattern: "俄罗斯|俄|RU|Russia|🇷🇺",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ru.svg"
    },
    "泰国": {
        pattern: "泰国|泰|TH|Thailand|🇹🇭",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/th.svg"
    },
    "印度": {
        pattern: "印度|IN|India|🇮🇳",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/in.svg"
    },
    "马来西亚": {
        pattern: "马来西亚|马来|MY|Malaysia|🇲🇾",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/my.svg"
    },
    "越南": {
        pattern: "越南|VN|Vietnam|🇻🇳",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/vn.svg"
    },
    "菲律宾": {
        pattern: "菲律宾|PH|Philippines|🇵🇭",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ph.svg"
    },
    "印度尼西亚": {
        pattern: "印度尼西亚|印尼|ID|Indonesia|🇮🇩",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/id.svg"
    },
    "土耳其": {
        pattern: "土耳其|TR|Turkey|🇹🇷",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/tr.svg"
    },
    "荷兰": {
        pattern: "荷兰|NL|Netherlands|🇳🇱",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/nl.svg"
    },
    "意大利": {
        pattern: "意大利|IT|Italy|🇮🇹",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/it.svg"
    },
    "西班牙": {
        pattern: "西班牙|ES|Spain|España|🇪🇸",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/es.svg"
    },
    "葡萄牙": {
        pattern: "葡萄牙|PT|Portugal|🇵🇹",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/pt.svg"
    },
    "瑞典": {
        pattern: "瑞典|SE|Sweden|🇸🇪",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/se.svg"
    },
    "挪威": {
        pattern: "挪威|NO|Norway|🇳🇴",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/no.svg"
    },
    "芬兰": {
        pattern: "芬兰|FI|Finland|🇫🇮",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/fi.svg"
    },
    "丹麦": {
        pattern: "丹麦|DK|Denmark|🇩🇰",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/dk.svg"
    },
    "瑞士": {
        pattern: "瑞士|CH|Switzerland|🇨🇭",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ch.svg"
    },
    "奥地利": {
        pattern: "奥地利|AT|Austria|🇦🇹",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/at.svg"
    },
    "爱尔兰": {
        pattern: "爱尔兰|IE|Ireland|🇮🇪",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ie.svg"
    },
    "比利时": {
        pattern: "比利时|BE|Belgium|🇧🇪",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/be.svg"
    },
    "波兰": {
        pattern: "波兰|PL|Poland|🇵🇱",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/pl.svg"
    },
    "捷克": {
        pattern: "捷克|CZ|Czech|Czechia|🇨🇿",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/cz.svg"
    },
    "乌克兰": {
        pattern: "乌克兰|UA|Ukraine|🇺🇦",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ua.svg"
    },
    "以色列": {
        pattern: "以色列|IL|Israel|🇮🇱",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/il.svg"
    },
    "阿联酋": {
        pattern: "阿联酋|AE|UAE|United Arab Emirates|🇦🇪",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ae.svg"
    },
    "沙特": {
        pattern: "沙特|SA|Saudi|Saudi Arabia|🇸🇦",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/sa.svg"
    },
    "墨西哥": {
        pattern: "墨西哥|MX|Mexico|🇲🇽",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/mx.svg"
    },
    "巴西": {
        pattern: "巴西|BR|Brazil|Brasil|🇧🇷",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/br.svg"
    },
    "阿根廷": {
        pattern: "阿根廷|AR|Argentina|🇦🇷",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ar.svg"
    },
    "智利": {
        pattern: "智利|CL|Chile|🇨🇱",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/cl.svg"
    },
    "南非": {
        pattern: "南非|ZA|South Africa|🇿🇦",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/za.svg"
    },
    "新西兰": {
        pattern: "新西兰|NZ|New Zealand|🇳🇿",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/nz.svg"
    },
};

function normalizeCountryPattern(pattern) {
    const raw = pattern.replace(/^\(\?i\)/, '');
    return raw
        .split("|")
        .map(token => {
            if (!token) return token;
            if (/^[A-Za-z]{2,3}$/.test(token)) {
                return `(?:^|[^A-Za-z])${token}\\d*(?=$|[^A-Za-z])`;
            }
            return token;
        })
        .join("|");
}

function hasLowCost(config) {
    const lowCostRegex = /0\.[0-5]|低倍率|省流|大流量|实验性/i;
    return (config.proxies || []).some(proxy => lowCostRegex.test(proxy.name));
}

function findLastMatch(regex, text) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const re = new RegExp(regex.source, flags);
    let match = null;
    let last = null;
    while ((match = re.exec(text)) !== null) {
        last = match;
    }
    if (!last) return null;
    return { index: last.index, length: last[0].length };
}

function parseCountries(config) {
    const proxies = config.proxies || [];
    const ispRegex = /家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地/i;   // 需要排除的关键字
    const matchedProxyNames = new Set();

    // 用来累计各国节点数
    const countryCounts = Object.create(null);

    // 构建地区正则表达式：区分大小写（避免 node 里的 "de" 误匹配到 "DE" -> 德国）
    const compiledRegex = {};
    for (const [country, meta] of Object.entries(countriesMeta)) {
        compiledRegex[country] = new RegExp(normalizeCountryPattern(meta.pattern));
    }

    // 逐个节点进行匹配与统计
    for (const proxy of proxies) {
        const name = proxy.name || '';

        // 过滤掉不想统计的 ISP 节点
        if (ispRegex.test(name)) continue;

        // 找到最后一个匹配到的地区作为出口地区
        let bestCountry = null;
        let bestIndex = -1;
        let bestLength = -1;
        for (const [country, regex] of Object.entries(compiledRegex)) {
            const match = findLastMatch(regex, name);
            if (!match) continue;
            if (match.index > bestIndex || (match.index === bestIndex && match.length > bestLength)) {
                bestCountry = country;
                bestIndex = match.index;
                bestLength = match.length;
            }
        }
        if (bestCountry) {
            countryCounts[bestCountry] = (countryCounts[bestCountry] || 0) + 1;
            matchedProxyNames.add(name);
        }
    }

    // 将结果对象转成数组形式
    const result = [];
    for (const [country, count] of Object.entries(countryCounts)) {
        result.push({ country, count });
    }

    return { countryInfo: result, matchedProxyNames };
}


function buildCountryProxyGroups({ countries, landing, loadBalance }) {
    const groups = [];
    const baseExcludeFilter = "0\\.[0-5]|低倍率|省流|大流量|实验性";
    const landingExcludeFilter = "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地";
    const groupType = loadBalance ? "load-balance" : "url-test";

    for (const country of countries) {
        const meta = countriesMeta[country];
        if (!meta) continue;

        const icon = meta.icon || DEFAULT_GROUP_ICON;
        const groupConfig = {
            "name": `${country}${NODE_SUFFIX}`,
            "icon": icon,
            "include-all": true,
            "filter": normalizeCountryPattern(meta.pattern),
            "exclude-filter": landing ? `${landingExcludeFilter}|${baseExcludeFilter}` : baseExcludeFilter,
            "type": groupType
        };

        if (!loadBalance) {
            Object.assign(groupConfig, {
                "url": "https://cp.cloudflare.com/generate_204",
                "interval": 60,
                "tolerance": 20,
                "lazy": false
            });
        }

        groups.push(groupConfig);
    }

    return groups;
}

function buildRegionProxyGroups({ countryGroupNames, loadBalance }) {
    const groups = [];
    for (const [name, meta] of Object.entries(REGION_META)) {
        const proxies = meta.countries
            .map(country => `${country}${NODE_SUFFIX}`)
            .filter(groupName => countryGroupNames.includes(groupName));
        if (proxies.length < REGION_GROUP_MIN) continue;
        const groupConfig = {
            "name": name,
            "icon": meta.icon,
            "type": loadBalance ? "load-balance" : "url-test",
            "proxies": proxies
        };
        if (!loadBalance) {
            Object.assign(groupConfig, {
                "url": "https://cp.cloudflare.com/generate_204",
                "interval": 60,
                "tolerance": 20,
                "lazy": false
            });
        }
        groups.push(groupConfig);
    }
    return groups;
}

function buildProxyGroups({
    landing,
    countries,
    countryProxyGroups,
    regionProxyGroups,
    countryGroupNames,
    unrecognizedProxies,
    lowCost,
    defaultProxies,
    defaultProxiesDirect,
    defaultSelector,
    defaultFallback
}) {
    // 查看是否有特定地区的节点
    const hasTW = countries.includes("台湾");
    const hasHK = countries.includes("香港");
    const hasUS = countries.includes("美国");
    // 排除落地节点、选择节点和故障转移以避免死循环
    const frontProxySelector = landing
        ? defaultSelector.filter(name => name !== PROXY_GROUPS.LANDING && name !== PROXY_GROUPS.FALLBACK)
        : [];
    const availableGroupNames = new Set([
        ...countryGroupNames,
        ...regionProxyGroups.map(group => group.name)
    ]);
    const regionAliases = {
        "狮城节点": "新加坡节点"
    };
    const pickRegion = (name) => {
        const resolved = regionAliases[name] || name;
        return availableGroupNames.has(resolved) ? resolved : null;
    };
    const pickRegions = (...names) => names.map(pickRegion).filter(Boolean);
    const aiGroupCandidates = Array.from(availableGroupNames);
    const buildAiGroupProxies = (groupName) => {
        const exclusions = AI_UNSUPPORTED_GROUPS[groupName] || [];
        const allowedGroups = aiGroupCandidates.filter(name => !exclusions.includes(name));
        return buildList(
            PROXY_GROUPS.SELECT,
            PROXY_GROUPS.AUTO,
            allowedGroups,
            PROXY_GROUPS.MANUAL
        );
    };
    const manualGroupProxies = buildList(
        regionProxyGroups.map(group => group.name),
        countryGroupNames
    );
    const fullProxies = defaultProxies;
    return [
        {
            "name": PROXY_GROUPS.SELECT,
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Rocket.png",
            "type": "select",
            "proxies": defaultSelector
        },
        {
            "name": PROXY_GROUPS.MANUAL,
            "icon": "https://gcore.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/select.png",
            "include-all": true,
            "type": "select",
            "proxies": manualGroupProxies
        },
        {
            "name": PROXY_GROUPS.AUTO,
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Auto.png",
            "type": "url-test",
            "include-all": true,
            "url": "https://cp.cloudflare.com/generate_204",
            "interval": 60,
            "tolerance": 20,
            "lazy": false
        },
        (landing) ? {
            "name": "前置代理",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Area.png",
            "type": "select",
            "include-all": true,
            "exclude-filter": "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地",
            "proxies": frontProxySelector
        } : null,
        (landing) ? {
            "name": PROXY_GROUPS.LANDING,
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Airport.png",
            "type": "select",
            "include-all": true,
            "filter": "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地",
        } : null,
        {
            "name": PROXY_GROUPS.FALLBACK,
            "icon": "https://gcore.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/fallback.png",
            "type": "fallback",
            "url": "https://cp.cloudflare.com/generate_204",
            "proxies": defaultFallback,
            "interval": 180,
            "tolerance": 20,
            "lazy": false
        },
        {
            "name": "全球拦截",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/AdBlack.png",
            "type": "select",
            "proxies": [
                "REJECT",
                "DIRECT"
            ]
        },
        {
            "name": "应用净化",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Hijacking.png",
            "type": "select",
            "proxies": [
                "REJECT",
                "DIRECT"
            ]
        },
        {
            "name": "漏网之鱼",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Final.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "OpenAI",
            "icon": "https://gcore.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/openai.png",
            "type": "select",
            "proxies": buildAiGroupProxies("OpenAI")
        },
        {
            "name": "Claude",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/AI.png",
            "type": "select",
            "proxies": buildAiGroupProxies("Claude")
        },
        {
            "name": "Gemini",
            "icon": "https://gcore.jsdelivr.net/gh/lobehub/lobe-icons@refs/heads/master/packages/static-png/light/gemini-color.png",
            "type": "select",
            "proxies": buildAiGroupProxies("Gemini")
        },
        {
            "name": "人工智能",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/AI.png",
            "type": "select",
            "proxies": buildAiGroupProxies("人工智能")
        },
        {
            "name": "油管视频",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/YouTube.png",
            "type": "select",
            "proxies": fullProxies
        },
        {
            "name": "奈飞视频",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Netflix.png",
            "type": "select",
            "proxies": fullProxies
        },
        {
            "name": "国外媒体",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/ForeignMedia.png",
            "type": "select",
            "proxies": fullProxies
        },
        {
            "name": "国内媒体",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/DomesticMedia.png",
            "type": "select",
            "proxies": buildList(
                "DIRECT",
                pickRegions("香港节点", "台湾节点")
            )
        },
        {
            "name": "哔哩哔哩",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/bilibili.png",
            "type": "select",
            "proxies": (hasTW && hasHK)
                ? buildList(PROXY_GROUPS.DIRECT, pickRegions("台湾节点", "香港节点"))
                : defaultProxiesDirect
        },
        {
            "name": "电报消息",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Telegram.png",
            "type": "select",
            "proxies": fullProxies
        },
        {
            "name": "谷歌服务",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Google_Search.png",
            "type": "select",
            "proxies": fullProxies
        },
        {
            "name": "微软服务",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Microsoft.png",
            "type": "select",
            "proxies": buildList(
                "DIRECT",
                fullProxies
            )
        },
        {
            "name": "苹果服务",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Apple.png",
            "type": "select",
            "proxies": buildList(
                "DIRECT",
                fullProxies
            )
        },
        {
            "name": "GitHub",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/GitHub.png",
            "type": "select",
            "proxies": buildList(fullProxies, "DIRECT")
        },
        {
            "name": "推特X",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Twitter.png",
            "type": "select",
            "proxies": fullProxies
        },
        {
            "name": "Discord",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Discord.png",
            "type": "select",
            "proxies": fullProxies
        },
        {
            "name": "Epic游戏",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Epic_Games.png",
            "type": "select",
            "proxies": buildList(
                "DIRECT",
                fullProxies
            )
        },
        {
            "name": "游戏平台",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Game.png",
            "type": "select",
            "proxies": buildList(
                "DIRECT",
                fullProxies
            )
        },
        {
            "name": "PT站点",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Download.png",
            "type": "select",
            "proxies": buildList(
                "DIRECT",
                PROXY_GROUPS.SELECT,
                PROXY_GROUPS.MANUAL
            )
        },
        {
            "name": "静态资源",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Cloudflare.png",
            "type": "select",
            "proxies": defaultProxies,
        },
        {
            "name": "Bahamut",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Bahamut.png",
            "type": "select",
            "proxies": (hasTW)
                ? buildList(pickRegions("台湾节点"), PROXY_GROUPS.SELECT, PROXY_GROUPS.MANUAL, PROXY_GROUPS.DIRECT)
                : defaultProxies
        },
        {
            "name": "TikTok",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/TikTok.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "Spotify",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Spotify.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "OneDrive",
            "icon": "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/icons/Onedrive.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": "PikPak",
            "icon": "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/icons/PikPak.png",
            "type": "select",
            "proxies": defaultProxies
        },
        {
            "name": PROXY_GROUPS.DIRECT,
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Direct.png",
            "type": "select",
            "proxies": [
                "DIRECT", PROXY_GROUPS.SELECT
            ]
        },
        {
            "name": "广告拦截",
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/AdBlack.png",
            "type": "select",
            "proxies": [
                "REJECT", "REJECT-DROP",  PROXY_GROUPS.DIRECT
            ]
        },
        (lowCost) ? {
            "name": PROXY_GROUPS.LOW_COST,
            "icon": "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Lab.png",
            "type": "url-test",
            "url": "https://cp.cloudflare.com/generate_204",
            "include-all": true,
            "filter": "(?i)0\.[0-5]|低倍率|省流|大流量|实验性"
        } : null,
        ...regionProxyGroups,
        ...countryProxyGroups,
        (unrecognizedProxies && unrecognizedProxies.length > 0) ? {
            "name": "其他节点",
            "icon": DEFAULT_GROUP_ICON,
            "type": "select",
            "proxies": unrecognizedProxies
        } : null
    ].filter(Boolean); // 过滤掉 null 值
}

function main(config) {
    const resultConfig = { proxies: config.proxies };
    // 解析地区与低倍率信息
    const { countryInfo, matchedProxyNames } = parseCountries(resultConfig);
    const lowCost = hasLowCost(resultConfig);
    const countryGroupNames = getCountryGroupNames(countryInfo, countryThreshold);
    const countries = stripNodeSuffix(countryGroupNames);

    // 为地区构建对应的 url-test / load-balance 组
    const countryProxyGroups = buildCountryProxyGroups({ countries, landing, loadBalance });
    const regionProxyGroups = buildRegionProxyGroups({ countryGroupNames, loadBalance });
    const regionGroupNames = regionProxyGroups.map(group => group.name);
    const unrecognizedProxies = Array.from(new Set(
        (resultConfig.proxies || [])
            .map(proxy => proxy.name)
            .filter(name => name && !matchedProxyNames.has(name))
    ));

    // 构建基础数组
    const {
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        defaultFallback
    } = buildBaseLists({ landing, lowCost, countryGroupNames, regionGroupNames });

    // 生成代理组
    const proxyGroups = buildProxyGroups({
        landing,
        countries,
        countryProxyGroups,
        regionProxyGroups,
        countryGroupNames,
        unrecognizedProxies,
        lowCost,
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        defaultFallback
    });
    for (const group of proxyGroups) {
        if (group && !group.icon) {
            group.icon = DEFAULT_GROUP_ICON;
        }
    }
    
    const finalRules = buildRules({ quicEnabled });

    if (fullConfig) Object.assign(resultConfig, {
        "mixed-port": 7890,
        "redir-port": 7892,
        "tproxy-port": 7893,
        "routing-mark": 7894,
        "allow-lan": true,
        "ipv6": ipv6Enabled,
        "mode": "rule",
        "unified-delay": true,
        "tcp-concurrent": true,
        "find-process-mode": "off",
        "log-level": "info",
        "geodata-loader": "standard",
        "external-controller": ":9999",
        "disable-keep-alive": !keepAliveEnabled,
        "profile": {
            "store-selected": true,
        }
    });

    Object.assign(resultConfig, {
        "proxy-groups": proxyGroups,
        "rule-providers": ruleProviders,
        "rules": finalRules,
        "sniffer": snifferConfig,
        "dns": fakeIPEnabled ? dnsConfigFakeIp : dnsConfig,
        "geodata-mode": true,
        "geox-url": geoxURL,
    });

    return resultConfig;
}
