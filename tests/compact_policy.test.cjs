const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8').replace(/\r\n/g, '\n');
const policy = JSON.parse(read('policy.json'));
const sample = ['香港 01', '台湾 01', '美国 01', '日本 01', '新加坡 01', '韩国 01',
  '德国 01', '法国 01', '泰国 01', '土耳其 01', '未知 01', '美国 低倍率 02', '美国 家宽 03']
  .map(name => ({ name, type: 'ss', server: 'example.com', port: 443,
    cipher: 'aes-128-gcm', password: 'test' }));

function generate(file, args, proxies = sample) {
  const context = vm.createContext({ $arguments: args, console, structuredClone });
  vm.runInContext(read(file), context);
  return JSON.parse(JSON.stringify(context.main({ proxies: structuredClone(proxies) })));
}

function verify(config, proxies = []) {
  const groups = new Map(config['proxy-groups'].map(group => [group.name, group]));
  const builtins = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'PROXY', ...proxies.map(p => p.name)]);
  assert.equal(groups.size, config['proxy-groups'].length);
  assert.equal(config['proxy-groups'].at(-1).name, '漏网之鱼');
  for (const name of Object.keys(policy.groupMerges)) assert.equal(groups.has(name), false, name);
  function visit(name, stack = []) {
    if (builtins.has(name)) return;
    assert.ok(groups.has(name), `缺失策略组：${name}`);
    assert.ok(!stack.includes(name), `循环引用：${[...stack, name]}`);
    const members = groups.get(name).proxies || [];
    assert.equal(new Set(members).size, members.length, name);
    for (const member of members) visit(member, [...stack, name]);
    const fallback = groups.get(name)['empty-fallback'];
    if (fallback) {
      assert.ok(!groups.has(fallback), `empty-fallback 不能引用策略组：${fallback}`);
      visit(fallback, [...stack, name]);
    }
  }
  for (const name of groups.keys()) visit(name);
  for (const rule of config.rules) {
    const fields = rule.split(',');
    const target = fields.at(-1) === 'no-resolve' ? fields.at(-2) : fields.at(-1);
    assert.ok(groups.has(target) || builtins.has(target), rule);
    if (fields[0] === 'RULE-SET') assert.ok(config['rule-providers'][fields[1]], rule);
  }
  return groups;
}

const payloads = rules => rules.map(rule => {
  const fields = rule.split(',');
  fields[fields.length - (fields.at(-1) === 'no-resolve' ? 2 : 1)] = '<出口>';
  return fields.join(',');
});

for (const file of ['convert_clash_reference.js', 'convert_auto.js']) {
  test(`${file}: 默认精简、完整恢复及各模式均无缺失引用或循环`, () => {
    for (const args of [{}, { landing: true }, { loadbalance: true },
      { landing: true, loadbalance: true }, { threshold: 3 },
      { full: true, profile: 'client' }, { full: true, profile: 'router' }]) {
      const compact = generate(file, args);
      const full = generate(file, { ...args, compact: false });
      verify(compact, sample);
      for (const config of [compact, full]) {
        assert.doesNotMatch(JSON.stringify(config), /全球直连/);
        assert.ok(config.rules.includes('RULE-SET,DirectList,DIRECT'));
      }
      assert.ok(full['proxy-groups'].length - compact['proxy-groups'].length >= 10);
      assert.ok(full['proxy-groups'].some(g => g.name === 'OpenAI'));
      assert.ok(full['proxy-groups'].some(g => g.name === '负载均衡-轮询'));
      assert.deepEqual(payloads(compact.rules), payloads(full.rules));
      const unchanged = config => Object.fromEntries(Object.entries(config)
        .filter(([key]) => !['proxy-groups', 'rules'].includes(key)));
      assert.deepEqual(unchanged(compact), unchanged(full));
    }
    for (const proxies of [[], sample.slice(0, 1), sample.slice(6, 9)]) {
      verify(generate(file, {}, proxies), proxies);
    }
    assert.deepEqual(generate(file, { compact: 'false' }), generate(file, { compact: false }));
    assert.deepEqual(generate(file, { compact: 'true' }), generate(file, {}));
  });
}

test('主脚本精简 AI、社交与媒体出口，PT 并入直连', () => {
  const config = generate('convert_clash_reference.js', {});
  const groups = verify(config, sample);
  assert.equal(groups.get('奈飞节点').type, 'url-test');
  assert.equal(groups.get('奈飞节点').filter, '(?i)\\bNF\\b|奈飞|解锁|Netflix');
  assert.equal(groups.get('人工智能').proxies[0], 'AI-故障转移');
  assert.equal(groups.get('AI-故障转移').type, 'fallback');
  assert.match(groups.get('AI-故障转移')['exclude-filter'], /香港/);
  assert.equal(groups.has('PT站点'), false);
  assert.equal(groups.get('社交平台').proxies[0], '节点选择');
  assert.equal(groups.get('微软服务').proxies[0], 'DIRECT');
  assert.equal(groups.get('节点选择').proxies[0], '自动选择');
  for (const rule of ['RULE-SET,OpenAI,人工智能', 'RULE-SET,Claude,人工智能',
    'RULE-SET,Gemini,人工智能', 'DOMAIN-SUFFIX,challenges.cloudflare.com,Cloudflare验证',
    'RULE-SET,Twitter,社交平台', 'RULE-SET,Discord,社交平台', 'RULE-SET,TikTok,社交平台',
    'RULE-SET,OneDrive,节点选择',
    'RULE-SET,YouTubeMusic,国外媒体', 'RULE-SET,YouTube,国外媒体',
    'RULE-SET,Netflix,奈飞节点', 'GEOIP,NETFLIX,奈飞节点,no-resolve', 'RULE-SET,Spotify,国外媒体',
    'RULE-SET,Epic,游戏平台', 'RULE-SET,PrivateTracker,DIRECT',
    'RULE-SET,BanProgramAD,广告拦截']) {
    assert.ok(config.rules.includes(rule), rule);
  }
});

test('兼容转换脚本将 Netflix 域名与 IP 规则独立发送到奈飞节点组', () => {
  for (const args of [{}, { compact: false }]) {
    const config = generate('convert_auto.js', args);
    const groups = new Map(config['proxy-groups'].map(group => [group.name, group]));
    assert.equal(groups.get('奈飞节点').type, 'url-test');
    assert.equal(groups.get('奈飞节点').filter, '(?i)\\bNF\\b|奈飞|解锁|Netflix');
    assert.ok(config.rules.includes('GEOSITE,NETFLIX,奈飞节点'));
    assert.ok(config.rules.includes('GEOIP,NETFLIX,奈飞节点,no-resolve'));
    assert.ok(!config.rules.includes('GEOSITE,NETFLIX,国外媒体'));
  }
});

test('Clash 精简配置保留 AI 故障转移、独立更新下载与奈飞候选', () => {
  const config = yaml.load(read('clash_config_slim.yaml'));
  const groups = verify(config);
  assert.equal(groups.size, 28);
  assert.equal(groups.has('全球直连'), false);
  assert.equal(groups.get('人工智能').proxies[0], 'AI-故障转移');
  assert.ok(groups.get('国外媒体').proxies.includes('奈飞节点'));
  assert.equal(groups.get('奈飞节点').type, 'url-test');
  assert.equal(groups.get('奈飞节点').filter, '(?i)\\bNF\\b|奈飞|解锁|Netflix');
  assert.ok(config.rules.includes('RULE-SET,Netflix_Domain,奈飞节点'));
  assert.ok(config.rules.includes('RULE-SET,Netflix_IP,奈飞节点,no-resolve'));
  assert.equal(groups.get('中转站').proxies[0], 'DIRECT');
  assert.equal(groups.get('国内媒体').proxies[0], 'DIRECT');
  assert.ok(config.rules.includes('DOMAIN-SUFFIX,downloads.claude.ai,节点选择'));
  assert.ok(config.rules.includes('PROCESS-NAME,Codex,人工智能'));
  assert.ok(config.rules.includes('IP-ASN,44907,电报消息,no-resolve'));
});

test('Shadowrocket 合并后选中索引有效，保留微软代理与奈飞候选', () => {
  const lines = read('shadowrocket_slim.conf').split('[Proxy Group]')[1].split('[Rule]')[0]
    .split('\n').filter(line => line.includes(' = '));
  const groups = new Map(lines.map(line => line.split(' = ')));
  assert.equal(groups.size, 29);
  assert.equal(groups.has('全球直连'), false);
  for (const name of Object.keys(policy.groupMerges)) assert.equal(groups.has(name), false, name);
  for (const [name, definition] of groups) {
    const [type, ...parts] = definition.split(',');
    if (type !== 'select') continue;
    const members = parts.filter(p => !p.includes('='));
    const selected = parts.find(p => p.startsWith('select='));
    if (selected) assert.ok(Number(selected.slice(7)) >= 0 && Number(selected.slice(7)) < members.length, name);
  }
  const microsoft = groups.get('微软服务').split(',').slice(1);
  assert.equal(microsoft.filter(p => !p.includes('='))[Number(microsoft.find(p => p.startsWith('select=')).slice(7))], '节点选择');
  assert.ok(groups.get('国外媒体').startsWith('select,节点选择,奈飞节点,流媒体解锁,'));
  assert.ok(groups.get('奈飞节点').startsWith('url-test,url=https://www.gstatic.com/generate_204,'));
  assert.ok(read('shadowrocket_slim.conf').includes('DOMAIN-SUFFIX,downloads.claude.ai,节点选择'));
  for (const name of ['Cloudflare验证', '社交平台']) {
    assert.ok(groups.has(name), name);
    assert.ok(groups.get(name).startsWith('select,节点选择,'), name);
  }
  const rules = read('shadowrocket_slim.conf').split('[Rule]')[1].split('[Host]')[0];
  assert.ok(rules.includes('DOMAIN-SUFFIX,challenges.cloudflare.com,Cloudflare验证'));
  for (const name of ['Twitter', 'Facebook', 'Discord', 'TikTok']) {
    assert.ok(rules.includes(`/${name}/${name}.list,社交平台`), name);
  }
  assert.ok(rules.includes('/YouTube/YouTube.list,国外媒体'));
  assert.ok(rules.includes('/Netflix/Netflix.list,奈飞节点'));
});

test('Telegram 分组统一为电报消息，DC 专用规则保留在最前', () => {
  const config = yaml.load(read('clash_config_slim.yaml'));
  const groups = verify(config);
  for (const name of ['TG-亚洲 (DC5)', 'TG-美洲 (DC1/3)', 'TG-欧洲 (DC2/4)']) {
    assert.equal(groups.has(name), false, name);
  }
  const general = config.rules.indexOf('RULE-SET,Telegram_Domain,电报消息');
  for (const rule of [
    'IP-ASN,44907,电报消息,no-resolve',
    'IP-ASN,59930,电报消息,no-resolve',
    'IP-ASN,62041,电报消息,no-resolve',
    'IP-CIDR,5.28.192.0/18,电报消息,no-resolve',
    'DOMAIN-SUFFIX,flora.web.telegram.org,电报消息',
    'DOMAIN-SUFFIX,pluto.web.telegram.org,电报消息',
    'DOMAIN-SUFFIX,venus.web.telegram.org,电报消息'
  ]) {
    const index = config.rules.indexOf(rule);
    assert.ok(index >= 0 && index < general, rule);
  }
  assert.ok(config.rules.includes('RULE-SET,Telegram_IP,电报消息,no-resolve'));
  assert.equal(groups.get('自动选择').url, 'https://www.gstatic.com/generate_204');
  assert.equal(groups.get('自动选择')['expected-status'], 204);
  assert.equal(groups.get('故障转移')['expected-status'], 204);
  assert.equal(groups.get('AI-故障转移')['expected-status'], 204);
});

test('ACL 模板合并净化到拦截，并保持完整目标引用', () => {
  const source = read('ACL4SSR_WithChinaIp_WithGFW.ini');
  const groups = source.split('\n').filter(line => line.startsWith('custom_proxy_group='));
  const names = new Set(['DIRECT', 'REJECT', ...groups.map(line => line.split('`')[0].slice(19))]);
  assert.equal(names.has('🍃 应用净化'), false);
  assert.ok(source.includes('ruleset=🛑 全球拦截,https://fastgh.lainbo.com/https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanProgramAD.list'));
  for (const group of groups) {
    for (const member of group.split('`').filter(part => part.startsWith('[]'))) assert.ok(names.has(member.slice(2)), member);
  }
  for (const rule of source.split('\n').filter(line => line.startsWith('ruleset='))) {
    assert.ok(names.has(rule.slice(8, rule.indexOf(','))), rule);
  }
});
