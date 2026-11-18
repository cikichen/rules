const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const root = path.join(__dirname, '..');
const clash = yaml.load(fs.readFileSync(path.join(root, 'clash_config_slim.yaml'), 'utf8'));
const shadow = fs.readFileSync(path.join(root, 'shadowrocket_slim.conf'), 'utf8').replace(/\r\n/g, '\n');
const groups = new Map(clash['proxy-groups'].map(g => [g.name, g]));
const shadowGroups = new Map(shadow.split('[Proxy Group]')[1].split('[Rule]')[0]
  .split('\n').filter(l => l.includes(' = ')).map(l => l.split(' = ')));
const regions = ['香港', '台湾', '狮城', '日本', '美国'];

test('slim Geo rules explicitly configure their database download sources', () => {
  for (const rule of clash.rules) {
    const type = rule.split(',')[0];
    const database = type === 'IP-ASN' ? 'asn'
      : type === 'GEOIP' ? (clash['geodata-mode'] ? 'geoip' : 'mmdb')
      : type === 'GEOSITE' ? 'geosite' : null;
    if (!database) continue;
    const source = clash['geox-url']?.[database];
    assert.ok(source, `${rule} depends on an explicit geox-url.${database}`);
    const host = new URL(source).hostname;
    assert.equal(new URL(source).protocol, 'https:');
    assert.ok(!['github.com', 'raw.githubusercontent.com'].includes(host), `${database}: needs a download mirror`);
  }
});

test('slim profiles retain regional auto groups and remove redundant load balancing', () => {
  for (const region of regions) {
    assert.equal(groups.get(`${region}-自动选择`).type, 'url-test');
    assert.ok(shadowGroups.get(`${region}-自动选择`).startsWith('url-test,'));
    assert.equal(groups.has(`${region}-负载均衡`), false);
    assert.equal(shadowGroups.has(`${region}-负载均衡`), false);
  }
  for (const name of ['负载均衡-散列', '负载均衡-轮询', 'AI-负载均衡']) {
    assert.equal(groups.has(name), false);
    assert.equal(shadowGroups.has(name), false);
  }
  for (const name of ['韩国节点', '东南亚-自动选择', '土耳其节点', '阿根廷节点']) {
    assert.equal(groups.has(name), false, name);
    assert.equal(shadowGroups.has(name), false, name);
  }
});

test('removed region nodes are collected by Other Regions', () => {
  const clashFilter = groups.get('其他地区')['exclude-filter'].replace(/^\(\?i\)/, '');
  const shadowFilter = shadowGroups.get('其他地区').match(/policy-regex-filter=(.*)$/)[1]
    .replace(/^\(\?i\)/, '');
  const clashExclude = new RegExp(clashFilter, 'i');
  const shadowInclude = new RegExp(shadowFilter, 'i');
  for (const name of ['韩国 01', '首尔 01', '🇰🇷 01', '泰国 01', '马来西亚 01', '印尼 01',
    '土耳其 01', '阿根廷 01']) {
    assert.equal(clashExclude.test(name), false, `Clash 应收入其他地区：${name}`);
    assert.equal(shadowInclude.test(name), true, `Shadowrocket 应收入其他地区：${name}`);
  }
  for (const name of ['香港 01', '日本 01', '新加坡 01', '美国 01', '德国 01', '网站导航']) {
    assert.equal(clashExclude.test(name), true, `Clash 不应收入其他地区：${name}`);
    assert.equal(shadowInclude.test(name), false, `Shadowrocket 不应收入其他地区：${name}`);
  }
});

test('Clash group references and rule targets exist and have no cycles', () => {
  assert.equal(groups.size, clash['proxy-groups'].length);
  const builtins = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS']);
  function visit(name, stack = []) {
    assert.ok(!stack.includes(name), `cycle: ${[...stack, name]}`);
    if (builtins.has(name)) return;
    assert.ok(groups.has(name), `missing group: ${name}`);
    const members = groups.get(name).proxies || [];
    assert.equal(new Set(members).size, members.length, name);
    for (const member of members) visit(member, [...stack, name]);
    const fallback = groups.get(name)['empty-fallback'];
    assert.ok(!fallback || !groups.has(fallback), `${name}: empty-fallback must reference a proxy, not a group`);
  }
  for (const name of groups.keys()) visit(name);
  for (const rule of clash.rules) {
    const fields = rule.split(',');
    if (fields[0] === 'RULE-SET') assert.ok(clash['rule-providers'][fields[1]], rule);
    const target = fields.at(-1) === 'no-resolve' ? fields.at(-2) : fields.at(-1);
    assert.ok(groups.has(target) || builtins.has(target), rule);
  }
});

test('Clash checks are bounded and fallback checks actual nodes', () => {
  for (const group of groups.values()) {
    if (!['url-test', 'fallback', 'load-balance'].includes(group.type)) continue;
    assert.match(group.url, /^https:\/\//);
    assert.equal(group['expected-status'], 204);
    assert.equal(group.timeout, 4000);
    assert.equal(group.interval, group.type === 'fallback' ? 60 : 120);
    assert.equal(group.lazy, group.type !== 'fallback');
    if (group.type === 'fallback') {
      assert.equal(group['include-all'], true);
      assert.equal('proxies' in group, false);
    }
  }
  assert.equal(groups.get('人工智能').proxies[0], 'AI-故障转移');
  assert.ok(shadowGroups.get('人工智能').startsWith('select,AI-故障转移,'));
  assert.ok(shadowGroups.get('故障转移').startsWith('fallback,url=https://'));
});

test('Shadowrocket explicit policy members and rule targets exist', () => {
  const names = new Set([...shadowGroups.keys(), 'DIRECT', 'REJECT', 'PROXY']);
  for (const [name, value] of shadowGroups) {
    const members = value.split(',').slice(1).filter(v => !v.includes('='));
    for (const member of members) assert.ok(names.has(member), `${name}: ${member}`);
  }
  const rules = shadow.split('[Rule]')[1].split('[Host]')[0].split('\n');
  for (const rule of rules.filter(l => l && !l.startsWith('#'))) {
    const fields = rule.split(',');
    const target = fields.at(-1) === 'no-resolve' ? fields.at(-2) : fields.at(-1);
    assert.ok(names.has(target), rule);
  }
});
