const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const slim = yaml.load(read('clash_config_slim.yaml'));

function generate(name) {
  const context = vm.createContext({ $arguments: { full: false }, console, structuredClone });
  vm.runInContext(read(name), context, { filename: name });
  return context.main({
    proxies: [{ name: '日本 01', type: 'ss', server: '127.0.0.1', port: 443,
      cipher: 'aes-128-gcm', password: 'test' }]
  });
}

function before(rules, first, second) {
  for (const rule of [first, second]) {
    assert.equal(rules.filter(item => item === rule).length, 1, `规则应只出现一次：${rule}`);
  }
  assert.ok(rules.indexOf(first) < rules.indexOf(second), `${first} 必须早于 ${second}`);
}

function findRule(rules, fragment) {
  const matches = rules.filter(rule => rule.includes(fragment));
  assert.equal(matches.length, 1, `应唯一匹配规则：${fragment}`);
  return matches[0];
}

test('精简配置：微软与专用服务先于通用直连，保留白名单和拦截优先级', () => {
  const rules = slim.rules;
  const microsoft = 'RULE-SET,Microsoft_Domain,微软服务';
  assert.ok(rules.includes('RULE-SET,Relay,DIRECT'));
  before(rules, 'RULE-SET,Relay,DIRECT', 'RULE-SET,Custom_Direct,DIRECT');
  before(rules, 'RULE-SET,Custom_Direct,DIRECT', 'RULE-SET,BanAD,全球拦截');
  before(rules, 'RULE-SET,BanAD,全球拦截', microsoft);
  before(rules, 'RULE-SET,BanProgramAD,全球拦截', microsoft);
  before(rules, 'DOMAIN,browser.events.data.microsoft.com,人工智能', microsoft);
  before(rules, 'RULE-SET,AI,人工智能', microsoft);
  for (const provider of ['Direct_Domain', 'China_Domain', 'China_YYDS_Domain',
    'China_IP', 'China_YYDS_IP', 'Download']) {
    const direct = `RULE-SET,${provider},DIRECT`;
    before(rules, microsoft, direct);
    before(rules, 'RULE-SET,PT,DIRECT', direct);
    before(rules, direct, 'GEOIP,CN,DIRECT');
  }
  before(rules, 'GEOIP,CN,DIRECT', 'RULE-SET,ProxyGFWlist,漏网之鱼');
  assert.equal(rules.at(-1), 'MATCH,漏网之鱼');
});

test('精简配置：微软登录域同时属于国内与微软规则集时，先命中微软服务', () => {
  // 固定重现已确认的规则集重叠，不依赖联网下载或上游内容变化。
  const domains = {
    China_Domain: ['microsoftonline.com'],
    Microsoft_Domain: ['microsoftonline.com']
  };
  for (const host of ['microsoftonline.com', 'login.microsoftonline.com',
    'device.login.microsoftonline.com']) {
    const matched = slim.rules.find(rule => {
      const [type, provider] = rule.split(',');
      return type === 'RULE-SET' && domains[provider]?.some(domain =>
        host === domain || host.endsWith(`.${domain}`));
    });
    assert.equal(matched, 'RULE-SET,Microsoft_Domain,微软服务', host);
  }
});

for (const name of ['convert_clash_reference.js', 'convert_auto.js']) {
  test(`${name}：微软国内分类不能覆盖微软服务，AI 与 OneDrive 优先`, () => {
    const { rules, 'rule-providers': providers } = generate(name);
    const reference = name === 'convert_clash_reference.js';
    const microsoft = reference ? 'RULE-SET,Microsoft,微软服务' : 'GEOSITE,MICROSOFT,微软服务';
    const oneDrive = reference ? 'RULE-SET,OneDrive,节点选择' : 'GEOSITE,ONEDRIVE,节点选择';
    // DirectList 是仓库自定义白名单，不是需要后移的第三方通用直连集。
    assert.ok(providers.DirectList.url.endsWith('/clash/direct.list'));
    before(rules, 'RULE-SET,DirectList,DIRECT', 'RULE-SET,BanAD,广告拦截');
    before(rules, 'RULE-SET,BanAD,广告拦截', microsoft);
    before(rules, 'RULE-SET,BanProgramAD,广告拦截', microsoft);
    before(rules, 'GEOSITE,CATEGORY-AI-!CN,人工智能', microsoft);
    before(rules, oneDrive, microsoft);
    for (const direct of ['GEOSITE,MICROSOFT@CN,DIRECT', 'GEOSITE,CN,DIRECT',
      'GEOIP,CN,DIRECT']) {
      before(rules, microsoft, direct);
      before(rules, direct, 'GEOSITE,GFW,漏网之鱼');
    }
    assert.equal(rules.at(-1), 'MATCH,漏网之鱼');
  });
}

test('ACL4SSR：自定义白名单与拦截保持前置，微软服务先于通用直连', () => {
  const rules = read('ACL4SSR_WithChinaIp_WithGFW.ini').split(/\r?\n/)
    .filter(line => line.startsWith('ruleset='));
  const microsoft = findRule(rules, '/Microsoft/Microsoft.list');
  const customDirect = findRule(rules, '/cikichen/rules@main/clash/direct.list');
  const ad = findRule(rules, '/BanAD.list');
  assert.ok(customDirect.startsWith('ruleset=DIRECT,'));
  before(rules, customDirect, ad);
  before(rules, ad, microsoft);
  before(rules, findRule(rules, '/BanProgramAD.list'), microsoft);
  before(rules, findRule(rules, '/OtherAI.list'), microsoft);
  for (const fragment of ['/Direct/Direct.list', '/China/China_Classical.yaml',
    '/ChinaDNS/ChinaDNS.list', '/ChinaIPs/ChinaIPs.list', '/ChinaIpV6.list',
    '/China/China_Domain.yaml', '/ChinaCompanyIp.list', '/Download.list', '[]GEOIP,CN']) {
    const direct = findRule(rules, fragment);
    assert.ok(direct.startsWith('ruleset=DIRECT,'), direct);
    before(rules, microsoft, direct);
  }
  assert.equal(rules.at(-1), 'ruleset=🐟 漏网之鱼,[]FINAL');
});

test('Shadowrocket：保持已有的 AI、微软、通用直连顺序', () => {
  const rules = read('shadowrocket_slim.conf').split('[Rule]')[1].split('[Host]')[0]
    .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  const microsoft = findRule(rules, '/Microsoft/Microsoft.list');
  before(rules, findRule(rules, '/Advertising/Advertising.list'), microsoft);
  before(rules, findRule(rules, '/Copilot/Copilot.list'), microsoft);
  before(rules, 'DOMAIN,browser.events.data.microsoft.com,人工智能', microsoft);
  for (const fragment of ['/Direct/Direct.list', '/China/China.list', 'GEOIP,CN']) {
    const direct = findRule(rules, fragment);
    assert.ok(direct.endsWith(',DIRECT'), direct);
    before(rules, microsoft, direct);
  }
  assert.equal(rules.at(-1), 'FINAL,漏网之鱼');
});
