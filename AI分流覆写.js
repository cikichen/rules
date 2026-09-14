// 夜煞云(FlClash)覆写脚本:为 ChatGPT / Claude / Gemini 建独立分流组
// 规则与仓库 clash_config_slim.yaml 同源:
//   - RULE-SET 引用 peiyingyao/Rule-for-OCD 清单(全量、每日自动更新)
//   - 内联规则兜底清单缺漏(夜煞云订阅就漏了 chatgpt.com 主域)
// 挂载:夜煞云 → 覆写 → 新建 JavaScript → 粘贴本文件 → 关联到当前订阅
// 增删域名:改 INLINE_DOMAINS;改组名/emoji:改 GROUPS(规则自动跟随)

function main(config) {
  // ===== 策略组定义(emoji 与订阅风格统一;Claude更新 在 Claude 前面) =====
  const GROUPS = {
    chatgpt: "🤖 ChatGPT",
    claudeUpdate: "📥 Claude更新",
    claude: "🟠 Claude",
    gemini: "✨ Gemini"
  };
  const GROUP_ORDER = [GROUPS.chatgpt, GROUPS.claudeUpdate, GROUPS.claude, GROUPS.gemini];

  // ===== 1. 新建策略组(订阅已有同名组则复用,不重复建) =====
  if (!config["proxy-groups"]) {
    config["proxy-groups"] = [];
  }
  const groups = config["proxy-groups"];
  const existing = new Set(groups.map(g => g.name));

  const newGroups = [];
  for (const name of GROUP_ORDER) {
    if (!existing.has(name)) {
      newGroups.push({
        name: name,
        type: "select",
        "include-all": true // 自动包含全部节点与策略组,在代理页自选
      });
      existing.add(name);
    }
  }

  // ===== 2. 注入 rule-providers(与 clash_config_slim.yaml 同源) =====
  if (!config["rule-providers"]) {
    config["rule-providers"] = {};
  }
  const OCD = "https://testingcf.jsdelivr.net/gh/peiyingyao/Rule-for-OCD@master/rule/Clash/";
  const providers = {
    OpenAI_Domain: { type: "http", behavior: "domain", format: "mrs", interval: 86400, url: OCD + "OpenAI/OpenAI_OCD_Domain.mrs" },
    OpenAI_IP: { type: "http", behavior: "ipcidr", format: "mrs", interval: 86400, url: OCD + "OpenAI/OpenAI_OCD_IP.mrs" },
    Claude_Domain: { type: "http", behavior: "domain", format: "mrs", interval: 86400, url: OCD + "Claude/Claude_OCD_Domain.mrs" },
    Gemini_Domain: { type: "http", behavior: "domain", format: "mrs", interval: 86400, url: OCD + "Gemini/Gemini_OCD_Domain.mrs" }
  };
  for (const key in providers) {
    if (!config["rule-providers"][key]) {
      config["rule-providers"][key] = providers[key];
    }
  }

  // ===== 3. 组插到订阅已有 ChatGPT 类分组(如 🎶 ChatGPT)前面;找不到才插到最顶 =====
  const groupAnchor = groups.findIndex(g => /chatgpt/i.test(g.name || ""));
  if (groupAnchor >= 0) {
    groups.splice(groupAnchor, 0, ...newGroups);
  } else {
    groups.unshift(...newGroups);
  }

  // ===== 4. 生成规则(顺序即优先级:精确覆盖 > 内联兜底 > 全量清单 > 进程规则) =====

  // 内联兜底域名:即使清单缺漏/拉取失败,主域依然正确分流
  const INLINE_DOMAINS = [
    [GROUPS.chatgpt, [
      "chatgpt.com",           // 主站(夜煞云订阅缺失)
      "openai.com",            // API / Auth / 平台
      "oaistatic.com",         // 静态资源
      "oaiusercontent.com",    // 用户上传/文件
      "sora.com",              // Sora 独立站
      "ai.com",                // OpenAI 跳转域
      "identrust.com",         // 证书链(Safari 校验需要)
      "openaiapi-site.azureedge.net",
      "cdn.auth0.com",         // 登录页静态资源(精确域,不代理整个 auth0.com)
      "chatgpt.livekit.cloud"  // 语音模式
    ]],
    [GROUPS.claude, [
      "claude.ai",             // 旧主体
      "claude.com",            // 新主体
      "anthropic.com",         // API / Console
      "claudeusercontent.com"  // Artifacts 用户内容
    ]],
    [GROUPS.gemini, [
      "gemini.google.com",                        // 主体
      "aistudio.google.com",                      // AI Studio
      "generativelanguage.googleapis.com",        // API
      "alkalimakersuite-pa.clients6.google.com",  // AI Studio 后端
      "alkalicore-pa.clients6.google.com",        // 同上系
      "alkalimetricsink-pa.clients6.google.com",  // 同上系
      "content-autofill.googleapis.com",          // AI Studio 系
      "content-developerprofiles-pa.googleapis.com",
      "ai.google.dev",                            // 开发者文档
      "makersuite.google.com",                    // 旧跳转
      "bard.google.com",                          // 旧跳转
      "notebooklm.google.com",                    // NotebookLM
      "notebooklm.googleusercontent.com",
      "jules.google.com"                          // Jules 编程 agent
    ]]
  ];

  const newRules = [
    // 桌面端更新包走独立组,不占 Claude 主组线路(clash_config_slim 中同样独立)
    "DOMAIN-SUFFIX,downloads.claude.ai," + GROUPS.claudeUpdate
  ];
  for (const pair of INLINE_DOMAINS) {
    for (const d of pair[1]) {
      newRules.push("DOMAIN-SUFFIX," + d + "," + pair[0]);
    }
  }
  // 全量清单(peiyingyao/Rule-for-OCD,与 clash_config_slim 同源)
  newRules.push(
    "RULE-SET,OpenAI_Domain," + GROUPS.chatgpt,
    "RULE-SET,OpenAI_IP," + GROUPS.chatgpt + ",no-resolve",
    "RULE-SET,Claude_Domain," + GROUPS.claude,
    "RULE-SET,Gemini_Domain," + GROUPS.gemini,
    // 进程规则(需 TUN 模式;CLI 工具连 API 时无域名特征,按进程分流)
    "PROCESS-NAME,Codex," + GROUPS.chatgpt,
    "PROCESS-NAME,codex," + GROUPS.chatgpt,
    "PROCESS-NAME,Codex Helper," + GROUPS.chatgpt,
    "PROCESS-NAME,Codex Helper (Renderer)," + GROUPS.chatgpt,
    "PROCESS-NAME,gemini," + GROUPS.gemini
  );

  // 插到订阅第一条 ChatGPT 类规则前,与原有 AI 规则区衔接(该位置前已验证无截胡规则)
  const rules = config.rules || (config.rules = []);
  const ruleAnchor = rules.findIndex(r => /chatgpt/i.test(r));
  if (ruleAnchor >= 0) {
    rules.splice(ruleAnchor, 0, ...newRules);
  } else {
    rules.unshift(...newRules);
  }

  return config;
}
