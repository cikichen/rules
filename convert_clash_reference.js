/*!
参考策略结构版 Clash/Mihomo 订阅转换脚本

说明：
- 输出仍然是 Clash / Mihomo 配置，不是 Loon 配置
- 仅参考了另一套配置里的“策略组组织思路”
- 保留 convert_auto.js 里已经验证过的地区识别、国家分组、自定义规则等核心逻辑
- 额外补充了更完整的常用服务组与 rule-providers

支持的传入参数：
- loadbalance: 启用地区组负载均衡（默认 false，false 为 url-test）
- landing: 启用落地节点分组（默认 false）
- ipv6: 启用 IPv6 支持（默认 false）
- full: 输出完整配置（默认 false）
- keepalive: 启用 tcp-keep-alive（默认 false）
- fakeip: DNS 使用 FakeIP 模式（默认 false）
- quic: 允许 QUIC 流量（默认 false）
- threshold: 国家节点数量小于该值时不显示分组（默认 0）
*/

const NODE_SUFFIX = "节点";
const PRIMARY_COUNTRIES = ["香港", "日本", "新加坡", "美国", "台湾", "韩国"];
const COUNTRY_GROUP_DISPLAY_NAMES = {
    "新加坡": "狮城"
};
const LANDING_NODE_REGEX = /家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地/i;

function parseBool(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
    }
    return false;
}

function parseNumber(value, defaultValue = 0) {
    if (value === null || typeof value === "undefined") {
        return defaultValue;
    }
    const num = parseInt(value, 10);
    return Number.isNaN(num) ? defaultValue : num;
}

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

    flags.countryThreshold = parseNumber(args.threshold, 0);
    return flags;
}

const rawArgs = typeof $arguments !== "undefined" ? $arguments : {};
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

function getCountryGroupDisplayName(country) {
    return COUNTRY_GROUP_DISPLAY_NAMES[country] || country;
}

function buildCountryGroupItems(countryInfo, minCount, countryOrder) {
    const countMap = new Map(countryInfo.map(item => [item.country, item.count]));
    return countryOrder
        .filter(country => (countMap.get(country) || 0) >= minCount)
        .map(country => ({
            country,
            groupName: `${getCountryGroupDisplayName(country)}${NODE_SUFFIX}`
        }));
}

const PROXY_GROUPS = {
    SELECT: "节点选择",
    AUTO: "自动选择",
    BEST: "全球优选",
    BALANCE: "负载均衡",
    MANUAL: "全球手动",
    FALLBACK: "故障转移",
    DIRECT: "全球直连",
    LANDING: "落地节点",
    LOW_COST: "低倍率节点",
    OTHER: "其他地区"
};

const DEFAULT_GROUP_ICON = "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Global.png";
const AI_UNSUPPORTED_GROUPS = {
    "OpenAI": ["香港节点"],
    "Claude": ["香港节点"],
    "Gemini": ["香港节点"],
    "人工智能": ["香港节点"]
};

const buildList = (...elements) => elements.flat().filter(Boolean);

function buildBaseLists({ landing, lowCost, countryGroupNames, regionGroupNames, hasOtherNodes }) {
    const dynamicGroups = buildList(
        countryGroupNames,
        regionGroupNames,
        hasOtherNodes && PROXY_GROUPS.OTHER,
        lowCost && PROXY_GROUPS.LOW_COST
    );

    const defaultSelector = buildList(
        PROXY_GROUPS.MANUAL,
        PROXY_GROUPS.AUTO,
        PROXY_GROUPS.BEST,
        PROXY_GROUPS.BALANCE,
        PROXY_GROUPS.FALLBACK,
        landing && PROXY_GROUPS.LANDING,
        dynamicGroups,
        "DIRECT"
    );

    const defaultProxies = buildList(
        PROXY_GROUPS.SELECT,
        PROXY_GROUPS.AUTO,
        PROXY_GROUPS.BEST,
        PROXY_GROUPS.BALANCE,
        dynamicGroups,
        PROXY_GROUPS.MANUAL,
        PROXY_GROUPS.DIRECT
    );

    const defaultProxiesDirect = buildList(
        PROXY_GROUPS.DIRECT,
        dynamicGroups,
        PROXY_GROUPS.AUTO,
        PROXY_GROUPS.BEST,
        PROXY_GROUPS.BALANCE,
        PROXY_GROUPS.SELECT,
        PROXY_GROUPS.MANUAL
    );

    const defaultFallback = buildList(
        landing && PROXY_GROUPS.LANDING,
        dynamicGroups,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    return { defaultProxies, defaultProxiesDirect, defaultSelector, defaultFallback };
}

function wrapRaw(url) {
    return `https://github.ithome.me/${url}`;
}

function createProvider(url, path, format = "yaml") {
    return {
        type: "http",
        behavior: "classical",
        format,
        interval: 86400,
        url,
        path
    };
}

const ruleProviders = {
    BanAD: createProvider(
        "https://testingcf.jsdelivr.net/gh/ACL4SSR/ACL4SSR@master/Clash/BanAD.list",
        "./ruleset/BanAD.list",
        "text"
    ),
    BanProgramAD: createProvider(
        "https://testingcf.jsdelivr.net/gh/ACL4SSR/ACL4SSR@master/Clash/BanProgramAD.list",
        "./ruleset/BanProgramAD.list",
        "text"
    ),
    DirectList: createProvider(
        wrapRaw("https://raw.githubusercontent.com/cikichen/rules/refs/heads/main/clash/direct.list"),
        "./ruleset/DirectList.list",
        "text"
    ),
    Custom: createProvider(
        wrapRaw("https://raw.githubusercontent.com/cikichen/rules/refs/heads/main/clash/custom.list"),
        "./ruleset/Custom.list",
        "text"
    ),
    TikTok: createProvider(
        "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/TikTok.list",
        "./ruleset/TikTok.list",
        "text"
    ),
    SteamFix: createProvider(
        "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/SteamFix.list",
        "./ruleset/SteamFix.list",
        "text"
    ),
    GoogleFCM: createProvider(
        "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/FirebaseCloudMessaging.list",
        "./ruleset/FirebaseCloudMessaging.list",
        "text"
    ),
    OpenAI: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OpenAI/OpenAI.yaml"),
        "./ruleset/OpenAI.yaml"
    ),
    Claude: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Claude/Claude.yaml"),
        "./ruleset/Claude.yaml"
    ),
    Gemini: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Gemini/Gemini.yaml"),
        "./ruleset/Gemini.yaml"
    ),
    YouTubeMusic: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/YouTubeMusic/YouTubeMusic.yaml"),
        "./ruleset/YouTubeMusic.yaml"
    ),
    Apple: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Apple/Apple.yaml"),
        "./ruleset/Apple.yaml"
    ),
    ChinaMedia: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/ChinaMedia/ChinaMedia.yaml"),
        "./ruleset/ChinaMedia.yaml"
    ),
    GlobalMedia: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/GlobalMedia/GlobalMedia.yaml"),
        "./ruleset/GlobalMedia.yaml"
    ),
    Twitter: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Twitter/Twitter.yaml"),
        "./ruleset/Twitter.yaml"
    ),
    Discord: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Discord/Discord.yaml"),
        "./ruleset/Discord.yaml"
    ),
    GitHub: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/GitHub/GitHub.yaml"),
        "./ruleset/GitHub.yaml"
    ),
    Google: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Google/Google.yaml"),
        "./ruleset/Google.yaml"
    ),
    Telegram: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Telegram/Telegram.yaml"),
        "./ruleset/Telegram.yaml"
    ),
    Netflix: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Netflix/Netflix.yaml"),
        "./ruleset/Netflix.yaml"
    ),
    YouTube: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/YouTube/YouTube.yaml"),
        "./ruleset/YouTube.yaml"
    ),
    Microsoft: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Microsoft/Microsoft.yaml"),
        "./ruleset/Microsoft.yaml"
    ),
    OneDrive: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OneDrive/OneDrive.yaml"),
        "./ruleset/OneDrive.yaml"
    ),
    Spotify: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Spotify/Spotify.yaml"),
        "./ruleset/Spotify.yaml"
    ),
    Bahamut: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Bahamut/Bahamut.yaml"),
        "./ruleset/Bahamut.yaml"
    ),
    BiliBili: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/BiliBili/BiliBili.yaml"),
        "./ruleset/BiliBili.yaml"
    ),
    PikPak: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/PikPak/PikPak.yaml"),
        "./ruleset/PikPak.yaml"
    ),
    Steam: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Steam/Steam.yaml"),
        "./ruleset/Steam.yaml"
    ),
    Epic: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Epic/Epic.yaml"),
        "./ruleset/Epic.yaml"
    ),
    PrivateTracker: createProvider(
        wrapRaw("https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/PrivateTracker/PrivateTracker.yaml"),
        "./ruleset/PrivateTracker.yaml"
    )
};

const baseRules = [
    `GEOSITE,PRIVATE,${PROXY_GROUPS.DIRECT}`,
    `GEOIP,PRIVATE,${PROXY_GROUPS.DIRECT}`,
    `RULE-SET,DirectList,${PROXY_GROUPS.DIRECT}`,
    `GEOSITE,CN,${PROXY_GROUPS.DIRECT}`,
    `GEOIP,CN,${PROXY_GROUPS.DIRECT}`,
    `RULE-SET,BanAD,广告拦截`,
    `RULE-SET,BanProgramAD,应用净化`,
    "RULE-SET,Custom,自定义组",
    "RULE-SET,OpenAI,OpenAI",
    "RULE-SET,Claude,Claude",
    "RULE-SET,Gemini,Gemini",
    "GEOSITE,CATEGORY-AI-!CN,人工智能",
    `RULE-SET,TikTok,TikTok`,
    `RULE-SET,SteamFix,${PROXY_GROUPS.DIRECT}`,
    `RULE-SET,GoogleFCM,${PROXY_GROUPS.DIRECT}`,
    `DOMAIN,services.googleapis.cn,${PROXY_GROUPS.SELECT}`,
    `GEOSITE,GOOGLE-PLAY@CN,${PROXY_GROUPS.DIRECT}`,
    `GEOSITE,MICROSOFT@CN,${PROXY_GROUPS.DIRECT}`,
    "RULE-SET,Apple,苹果服务",
    "RULE-SET,ChinaMedia,国内媒体",
    "RULE-SET,GlobalMedia,国外媒体",
    "RULE-SET,Twitter,推特X",
    "RULE-SET,Discord,Discord",
    "RULE-SET,GitHub,GitHub",
    "RULE-SET,Google,谷歌服务",
    "RULE-SET,Telegram,电报消息",
    "RULE-SET,YouTubeMusic,YouTube Music",
    "RULE-SET,YouTube,油管视频",
    "RULE-SET,Netflix,奈飞视频",
    "RULE-SET,Microsoft,微软服务",
    "RULE-SET,OneDrive,OneDrive",
    "RULE-SET,Spotify,Spotify",
    "RULE-SET,Bahamut,Bahamut",
    "RULE-SET,BiliBili,哔哩哔哩",
    "RULE-SET,PikPak,PikPak",
    "RULE-SET,Steam,游戏平台",
    "RULE-SET,Epic,Epic游戏",
    "RULE-SET,PrivateTracker,PT站点",
    "GEOSITE,GFW,漏网之鱼",
    "GEOIP,NETFLIX,奈飞视频,no-resolve",
    "GEOIP,TELEGRAM,电报消息,no-resolve",
    "MATCH,漏网之鱼"
];

function buildRules({ quicEnabled }) {
    const ruleList = [...baseRules];
    if (!quicEnabled) {
        ruleList.unshift("AND,((DST-PORT,443),(NETWORK,UDP)),REJECT");
    }
    return ruleList;
}

const snifferConfig = {
    sniff: {
        TLS: { ports: [443, 8443] },
        HTTP: { ports: [80, 8080, 8880] },
        QUIC: { ports: [443, 8443] }
    },
    "override-destination": false,
    enable: true,
    "force-dns-mapping": true,
    "skip-domain": [
        "Mijia Cloud",
        "dlg.io.mi.com",
        "+.push.apple.com"
    ]
};

function buildDnsConfig({ mode, fakeIpFilter }) {
    const config = {
        enable: true,
        ipv6: ipv6Enabled,
        "prefer-h3": true,
        "enhanced-mode": mode,
        "default-nameserver": ["119.29.29.29", "223.5.5.5"],
        nameserver: ["system", "223.5.5.5", "119.29.29.29", "180.184.1.1"],
        fallback: [
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
    geoip: "https://gcore.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat",
    geosite: "https://gcore.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
    mmdb: "https://gcore.jsdelivr.net/gh/Loyalsoldier/geoip@release/Country.mmdb",
    asn: "https://gcore.jsdelivr.net/gh/Loyalsoldier/geoip@release/GeoLite2-ASN.mmdb"
};

const REGION_GROUP_DEFAULT_MIN = 2;
const REGION_GROUP_MIN_OVERRIDES = {
    "东南亚节点": 1,
    "土耳其节点": 1
};

const REGION_META = {
    "欧洲节点": {
        icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/European_Union.png",
        countries: [
            "英国", "德国", "法国", "荷兰", "意大利", "西班牙", "葡萄牙", "瑞典", "挪威", "芬兰",
            "丹麦", "瑞士", "奥地利", "爱尔兰", "比利时", "波兰", "捷克", "乌克兰", "俄罗斯"
        ]
    },
    "东南亚节点": {
        icon: "https://gcore.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/categorytravel.png",
        countries: ["新加坡", "马来西亚", "泰国", "越南", "菲律宾", "印度尼西亚"]
    },
    "土耳其节点": {
        icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/tr.svg",
        countries: ["土耳其"]
    }
};

const countriesMeta = {
    "香港": { pattern: "香港|港|HK|hk|Hong Kong|HongKong|hongkong|🇭🇰", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/hk.svg" },
    "澳门": { pattern: "澳门|MO|Macau|🇲🇴", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/mo.svg" },
    "台湾": { pattern: "台|新北|彰化|TW|Taiwan|🇹🇼", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/tw.svg" },
    "新加坡": { pattern: "新加坡|坡|狮城|SG|Singapore|🇸🇬", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/sg.svg" },
    "日本": { pattern: "日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan|🇯🇵", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/jp.svg" },
    "韩国": { pattern: "KR|Korea|KOR|首尔|韩|韓|🇰🇷", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/kr.svg" },
    "美国": { pattern: "美国|美|US|United States|🇺🇸", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/us.svg" },
    "加拿大": { pattern: "加拿大|Canada|CA|🇨🇦", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ca.svg" },
    "英国": { pattern: "英国|United Kingdom|UK|伦敦|London|🇬🇧", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/gb.svg" },
    "澳大利亚": { pattern: "澳洲|澳大利亚|AU|Australia|🇦🇺", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/au.svg" },
    "德国": { pattern: "德国|德|DE|Germany|🇩🇪", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/de.svg" },
    "法国": { pattern: "法国|法|FR|France|🇫🇷", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/fr.svg" },
    "俄罗斯": { pattern: "俄罗斯|俄|RU|Russia|🇷🇺", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ru.svg" },
    "泰国": { pattern: "泰国|泰|TH|Thailand|🇹🇭", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/th.svg" },
    "印度": { pattern: "印度|IN|India|🇮🇳", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/in.svg" },
    "马来西亚": { pattern: "马来西亚|马来|MY|Malaysia|🇲🇾", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/my.svg" },
    "越南": { pattern: "越南|VN|Vietnam|🇻🇳", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/vn.svg" },
    "菲律宾": { pattern: "菲律宾|PH|Philippines|🇵🇭", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ph.svg" },
    "印度尼西亚": { pattern: "印度尼西亚|印尼|ID|Indonesia|🇮🇩", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/id.svg" },
    "土耳其": { pattern: "土耳其|TR|Turkey|🇹🇷", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/tr.svg" },
    "荷兰": { pattern: "荷兰|NL|Netherlands|🇳🇱", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/nl.svg" },
    "意大利": { pattern: "意大利|IT|Italy|🇮🇹", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/it.svg" },
    "西班牙": { pattern: "西班牙|ES|Spain|España|🇪🇸", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/es.svg" },
    "葡萄牙": { pattern: "葡萄牙|PT|Portugal|🇵🇹", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/pt.svg" },
    "瑞典": { pattern: "瑞典|SE|Sweden|🇸🇪", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/se.svg" },
    "挪威": { pattern: "挪威|NO|Norway|🇳🇴", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/no.svg" },
    "芬兰": { pattern: "芬兰|FI|Finland|🇫🇮", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/fi.svg" },
    "丹麦": { pattern: "丹麦|DK|Denmark|🇩🇰", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/dk.svg" },
    "瑞士": { pattern: "瑞士|CH|Switzerland|🇨🇭", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ch.svg" },
    "奥地利": { pattern: "奥地利|AT|Austria|🇦🇹", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/at.svg" },
    "爱尔兰": { pattern: "爱尔兰|IE|Ireland|🇮🇪", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ie.svg" },
    "比利时": { pattern: "比利时|BE|Belgium|🇧🇪", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/be.svg" },
    "波兰": { pattern: "波兰|PL|Poland|🇵🇱", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/pl.svg" },
    "捷克": { pattern: "捷克|CZ|Czech|Czechia|🇨🇿", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/cz.svg" },
    "乌克兰": { pattern: "乌克兰|UA|Ukraine|🇺🇦", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ua.svg" },
    "以色列": { pattern: "以色列|IL|Israel|🇮🇱", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/il.svg" },
    "阿联酋": { pattern: "阿联酋|AE|UAE|United Arab Emirates|🇦🇪", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ae.svg" },
    "沙特": { pattern: "沙特|SA|Saudi|Saudi Arabia|🇸🇦", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/sa.svg" },
    "墨西哥": { pattern: "墨西哥|MX|Mexico|🇲🇽", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/mx.svg" },
    "巴西": { pattern: "巴西|BR|Brazil|Brasil|🇧🇷", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/br.svg" },
    "阿根廷": { pattern: "阿根廷|AR|Argentina|🇦🇷", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/ar.svg" },
    "智利": { pattern: "智利|CL|Chile|🇨🇱", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/cl.svg" },
    "南非": { pattern: "南非|ZA|South Africa|🇿🇦", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/za.svg" },
    "新西兰": { pattern: "新西兰|NZ|New Zealand|🇳🇿", icon: "https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/flags/1x1/nz.svg" }
};

function normalizeCountryPattern(pattern) {
    const raw = pattern.replace(/^\(\?i\)/, "");
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

function findFirstMatch(regex, text) {
    const flags = regex.flags.replace("g", "");
    const re = new RegExp(regex.source, flags);
    const match = re.exec(text);
    if (!match) return null;
    return { index: match.index, length: match[0].length };
}

function parseCountries(config) {
    const proxies = config.proxies || [];
    const proxyCountryMap = Object.create(null);
    const countryCounts = Object.create(null);
    const compiledRegex = {};

    for (const [country, meta] of Object.entries(countriesMeta)) {
        compiledRegex[country] = new RegExp(normalizeCountryPattern(meta.pattern));
    }

    for (const proxy of proxies) {
        const name = proxy.name || "";
        if (LANDING_NODE_REGEX.test(name)) continue;

        let bestCountry = null;
        let bestIndex = Infinity;
        let bestLength = -1;

        for (const [country, regex] of Object.entries(compiledRegex)) {
            const match = findFirstMatch(regex, name);
            if (!match) continue;
            if (match.index < bestIndex || (match.index === bestIndex && match.length > bestLength)) {
                bestCountry = country;
                bestIndex = match.index;
                bestLength = match.length;
            }
        }

        if (bestCountry) {
            countryCounts[bestCountry] = (countryCounts[bestCountry] || 0) + 1;
            proxyCountryMap[name] = bestCountry;
        }
    }

    const result = [];
    for (const [country, count] of Object.entries(countryCounts)) {
        result.push({ country, count });
    }

    return { countryInfo: result, proxyCountryMap };
}

function buildCountryProxyGroups({ countryGroupItems, landing, loadBalance }) {
    const groups = [];
    const baseExcludeFilter = "0\\.[0-5]|低倍率|省流|大流量|实验性";
    const landingExcludeFilter = "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地";
    const groupType = loadBalance ? "load-balance" : "url-test";

    for (const item of countryGroupItems) {
        const { country, groupName } = item;
        const meta = countriesMeta[country];
        if (!meta) continue;

        const groupConfig = {
            name: groupName,
            icon: meta.icon || DEFAULT_GROUP_ICON,
            "include-all": true,
            filter: normalizeCountryPattern(meta.pattern),
            "exclude-filter": landing ? `${landingExcludeFilter}|${baseExcludeFilter}` : baseExcludeFilter,
            type: groupType
        };

        if (!loadBalance) {
            Object.assign(groupConfig, {
                url: "https://cp.cloudflare.com/generate_204",
                interval: 60,
                tolerance: 20,
                lazy: false
            });
        }

        groups.push(groupConfig);
    }

    return groups;
}

function buildRegionProxyGroups({ detectedCountries, loadBalance, landing }) {
    const groups = [];
    const baseExcludeFilter = "0\\.[0-5]|低倍率|省流|大流量|实验性";
    const landingExcludeFilter = "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地";
    const groupType = loadBalance ? "load-balance" : "url-test";

    for (const [name, meta] of Object.entries(REGION_META)) {
        const groupMin = REGION_GROUP_MIN_OVERRIDES[name] || REGION_GROUP_DEFAULT_MIN;
        const regionCountries = meta.countries.filter(country => detectedCountries.includes(country));
        if (regionCountries.length < groupMin) continue;

        const filters = regionCountries
            .map(country => countriesMeta[country])
            .filter(Boolean)
            .map(item => normalizeCountryPattern(item.pattern));

        if (filters.length === 0) continue;

        const groupConfig = {
            name,
            icon: meta.icon,
            type: groupType,
            "include-all": true,
            filter: filters.join("|"),
            "exclude-filter": landing ? `${landingExcludeFilter}|${baseExcludeFilter}` : baseExcludeFilter
        };

        if (!loadBalance) {
            Object.assign(groupConfig, {
                url: "https://cp.cloudflare.com/generate_204",
                interval: 60,
                tolerance: 20,
                lazy: false
            });
        }

        groups.push(groupConfig);
    }

    return groups;
}

function getRegionCountriesFromGroups(regionGroups) {
    const selected = new Set();
    for (const group of regionGroups) {
        const meta = REGION_META[group.name];
        if (!meta || !Array.isArray(meta.countries)) continue;
        for (const country of meta.countries) {
            selected.add(country);
        }
    }
    return selected;
}

function buildOtherProxyNames({ proxies, proxyCountryMap, includedCountries }) {
    return Array.from(new Set(
        (proxies || [])
            .map(proxy => proxy.name)
            .filter(name => {
                if (!name) return false;
                const matchedCountry = proxyCountryMap[name];
                return !matchedCountry || !includedCountries.has(matchedCountry);
            })
    ));
}

function createLatencyGroup(name, icon, type, proxies, extras = {}) {
    const group = {
        name,
        icon,
        type,
        proxies
    };

    if (type !== "load-balance") {
        Object.assign(group, {
            url: "https://cp.cloudflare.com/generate_204",
            interval: 60,
            tolerance: 20,
            lazy: false
        });
    }

    return Object.assign(group, extras);
}

function buildProxyGroups({
    landing,
    loadBalance,
    countries,
    countryProxyGroups,
    regionProxyGroups,
    countryGroupNames,
    hasOtherNodes,
    unrecognizedProxies,
    lowCost,
    defaultProxies,
    defaultProxiesDirect,
    defaultSelector,
    defaultFallback
}) {
    const hasTW = countries.includes("台湾");
    const hasHK = countries.includes("香港");
    const hasTR = countries.includes("土耳其");
    const frontProxySelector = landing
        ? defaultSelector.filter(name => name !== PROXY_GROUPS.LANDING && name !== PROXY_GROUPS.FALLBACK)
        : [];

    const availableGroupNames = new Set([
        ...countryGroupNames,
        ...regionProxyGroups.map(group => group.name),
        hasOtherNodes ? PROXY_GROUPS.OTHER : null
    ].filter(Boolean));

    const pickRegion = name => availableGroupNames.has(name) ? name : null;
    const pickRegions = (...names) => names.map(pickRegion).filter(Boolean);
    const aiGroupCandidates = Array.from(availableGroupNames);
    const buildAiGroupProxies = groupName => {
        const exclusions = AI_UNSUPPORTED_GROUPS[groupName] || [];
        const allowedGroups = aiGroupCandidates.filter(name => !exclusions.includes(name));
        return buildList(
            PROXY_GROUPS.SELECT,
            PROXY_GROUPS.AUTO,
            PROXY_GROUPS.BEST,
            allowedGroups,
            PROXY_GROUPS.MANUAL
        );
    };

    const manualGroupProxies = buildList(
        "DIRECT",
        regionProxyGroups.map(group => group.name),
        countryGroupNames,
        hasOtherNodes && PROXY_GROUPS.OTHER
    );
    const fullProxies = defaultProxies;
    const otherGroupType = loadBalance ? "load-balance" : "url-test";

    return [
        {
            name: PROXY_GROUPS.SELECT,
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Rocket.png",
            type: "select",
            proxies: defaultSelector
        },
        {
            name: PROXY_GROUPS.MANUAL,
            icon: "https://gcore.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/select.png",
            "include-all": true,
            type: "select",
            proxies: manualGroupProxies
        },
        {
            name: PROXY_GROUPS.AUTO,
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Auto.png",
            type: "url-test",
            "include-all": true,
            url: "https://cp.cloudflare.com/generate_204",
            interval: 60,
            tolerance: 20,
            lazy: false
        },
        {
            name: PROXY_GROUPS.BEST,
            icon: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/Roundrobin.png",
            type: "url-test",
            "include-all": true,
            url: "https://cp.cloudflare.com/generate_204",
            interval: 180,
            tolerance: 15,
            lazy: false
        },
        {
            name: PROXY_GROUPS.BALANCE,
            icon: "https://github.com/shindgewongxj/WHATSINStash/raw/main/icon/loadbalance.png",
            type: "load-balance",
            "include-all": true,
            url: "https://cp.cloudflare.com/generate_204"
        },
        landing ? {
            name: "前置代理",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Area.png",
            type: "select",
            "include-all": true,
            "exclude-filter": "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地",
            proxies: frontProxySelector
        } : null,
        landing ? {
            name: PROXY_GROUPS.LANDING,
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Airport.png",
            type: "select",
            "include-all": true,
            filter: "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地"
        } : null,
        {
            name: PROXY_GROUPS.FALLBACK,
            icon: "https://gcore.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/fallback.png",
            type: "fallback",
            url: "https://cp.cloudflare.com/generate_204",
            proxies: defaultFallback,
            interval: 180,
            tolerance: 20,
            lazy: false
        },
        {
            name: PROXY_GROUPS.DIRECT,
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Direct.png",
            type: "select",
            proxies: ["DIRECT", PROXY_GROUPS.SELECT]
        },
        {
            name: "广告拦截",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/AdBlack.png",
            type: "select",
            proxies: ["REJECT", "REJECT-DROP", PROXY_GROUPS.DIRECT]
        },
        {
            name: "应用净化",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Hijacking.png",
            type: "select",
            proxies: ["REJECT", "DIRECT"]
        },
        {
            name: "全球拦截",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/AdBlack.png",
            type: "select",
            proxies: ["REJECT", "DIRECT"]
        },
        {
            name: "TikTok",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/TikTok.png",
            type: "select",
            proxies: defaultProxies
        },
        {
            name: "自定义组",
            icon: DEFAULT_GROUP_ICON,
            type: "select",
            proxies: defaultProxiesDirect
        },
        {
            name: "OpenAI",
            icon: "https://gcore.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/openai.png",
            type: "select",
            proxies: buildAiGroupProxies("OpenAI")
        },
        {
            name: "Claude",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/AI.png",
            type: "select",
            proxies: buildAiGroupProxies("Claude")
        },
        {
            name: "Gemini",
            icon: "https://gcore.jsdelivr.net/gh/lobehub/lobe-icons@refs/heads/master/packages/static-png/light/gemini-color.png",
            type: "select",
            proxies: buildAiGroupProxies("Gemini")
        },
        {
            name: "人工智能",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/AI.png",
            type: "select",
            proxies: buildAiGroupProxies("人工智能")
        },
        {
            name: "GitHub",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/GitHub.png",
            type: "select",
            proxies: buildList(fullProxies, "DIRECT")
        },
        {
            name: "OneDrive",
            icon: "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/icons/Onedrive.png",
            type: "select",
            proxies: defaultProxies
        },
        {
            name: "微软服务",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Microsoft.png",
            type: "select",
            proxies: buildList("DIRECT", fullProxies)
        },
        {
            name: "苹果服务",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Apple.png",
            type: "select",
            proxies: buildList("DIRECT", PROXY_GROUPS.SELECT, pickRegions("美国节点", "香港节点", "日本节点"), PROXY_GROUPS.MANUAL)
        },
        {
            name: "电报消息",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Telegram.png",
            type: "select",
            proxies: fullProxies
        },
        {
            name: "YouTube Music",
            icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure@refs/heads/master/IconSet/Color/YouTube_Music.png",
            type: "select",
            proxies: fullProxies
        },
        {
            name: "油管视频",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/YouTube.png",
            type: "select",
            proxies: fullProxies
        },
        {
            name: "谷歌服务",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Google_Search.png",
            type: "select",
            proxies: fullProxies
        },
        {
            name: "奈飞视频",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Netflix.png",
            type: "select",
            proxies: fullProxies
        },
        {
            name: "Spotify",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Spotify.png",
            type: "select",
            proxies: defaultProxies
        },
        {
            name: "Bahamut",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Bahamut.png",
            type: "select",
            proxies: hasTW
                ? buildList(pickRegions("台湾节点"), PROXY_GROUPS.SELECT, PROXY_GROUPS.MANUAL, PROXY_GROUPS.DIRECT)
                : defaultProxies
        },
        {
            name: "哔哩哔哩",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/bilibili.png",
            type: "select",
            proxies: (hasTW && hasHK)
                ? buildList(PROXY_GROUPS.DIRECT, pickRegions("台湾节点", "香港节点"))
                : defaultProxiesDirect
        },
        {
            name: "PikPak",
            icon: "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/icons/PikPak.png",
            type: "select",
            proxies: defaultProxies
        },
        {
            name: "国外媒体",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/ForeignMedia.png",
            type: "select",
            proxies: fullProxies
        },
        {
            name: "国内媒体",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/DomesticMedia.png",
            type: "select",
            proxies: buildList("DIRECT", pickRegions("香港节点", "台湾节点"), PROXY_GROUPS.DIRECT)
        },
        {
            name: "推特X",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Twitter.png",
            type: "select",
            proxies: fullProxies
        },
        {
            name: "Discord",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Discord.png",
            type: "select",
            proxies: fullProxies
        },
        {
            name: "Epic游戏",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Epic_Games.png",
            type: "select",
            proxies: buildList("DIRECT", hasTR && pickRegion("土耳其节点"), fullProxies)
        },
        {
            name: "游戏平台",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Game.png",
            type: "select",
            proxies: buildList("DIRECT", fullProxies)
        },
        {
            name: "PT站点",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Download.png",
            type: "select",
            proxies: ["DIRECT", PROXY_GROUPS.SELECT, PROXY_GROUPS.MANUAL]
        },
        {
            name: "漏网之鱼",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Final.png",
            type: "select",
            proxies: defaultProxies
        },
        lowCost ? {
            name: PROXY_GROUPS.LOW_COST,
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Lab.png",
            type: "url-test",
            url: "https://cp.cloudflare.com/generate_204",
            "include-all": true,
            filter: "(?i)0\.[0-5]|低倍率|省流|大流量|实验性",
            interval: 60,
            tolerance: 20,
            lazy: false
        } : null,
        ...regionProxyGroups,
        ...countryProxyGroups,
        (unrecognizedProxies && unrecognizedProxies.length > 0) ? createLatencyGroup(
            PROXY_GROUPS.OTHER,
            DEFAULT_GROUP_ICON,
            otherGroupType,
            unrecognizedProxies
        ) : null
    ].filter(Boolean);
}

function main(config) {
    const resultConfig = { proxies: config.proxies };
    const { countryInfo, proxyCountryMap } = parseCountries(resultConfig);
    const lowCost = hasLowCost(resultConfig);
    const countryGroupItems = buildCountryGroupItems(countryInfo, countryThreshold, PRIMARY_COUNTRIES);
    const countryGroupNames = countryGroupItems.map(item => item.groupName);
    const countries = countryGroupItems.map(item => item.country);

    const countryProxyGroups = buildCountryProxyGroups({ countryGroupItems, landing, loadBalance });
    const detectedCountries = countryInfo.map(item => item.country);
    const regionProxyGroups = buildRegionProxyGroups({ detectedCountries, loadBalance, landing });
    const regionGroupNames = regionProxyGroups.map(group => group.name);
    const regionCountries = getRegionCountriesFromGroups(regionProxyGroups);
    const includedCountries = new Set([...countries, ...regionCountries]);
    const unrecognizedProxies = buildOtherProxyNames({
        proxies: resultConfig.proxies,
        proxyCountryMap,
        includedCountries
    });
    const hasOtherNodes = unrecognizedProxies.length > 0;

    const {
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        defaultFallback
    } = buildBaseLists({
        landing,
        lowCost,
        countryGroupNames,
        regionGroupNames,
        hasOtherNodes
    });

    const proxyGroups = buildProxyGroups({
        landing,
        loadBalance,
        countries,
        countryProxyGroups,
        regionProxyGroups,
        countryGroupNames,
        hasOtherNodes,
        unrecognizedProxies,
        lowCost,
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        defaultFallback
    });

    const finalRules = buildRules({ quicEnabled });

    if (fullConfig) {
        Object.assign(resultConfig, {
            "mixed-port": 7890,
            "redir-port": 7892,
            "tproxy-port": 7893,
            "routing-mark": 7894,
            "allow-lan": true,
            ipv6: ipv6Enabled,
            mode: "rule",
            "unified-delay": true,
            "tcp-concurrent": true,
            "find-process-mode": "off",
            "log-level": "info",
            "geodata-loader": "standard",
            "external-controller": ":9999",
            "disable-keep-alive": !keepAliveEnabled,
            profile: {
                "store-selected": true
            }
        });
    }

    Object.assign(resultConfig, {
        "proxy-groups": proxyGroups,
        "rule-providers": ruleProviders,
        rules: finalRules,
        sniffer: snifferConfig,
        dns: fakeIPEnabled ? dnsConfigFakeIp : dnsConfig,
        "geodata-mode": true,
        "geox-url": geoxURL
    });

    return resultConfig;
}
