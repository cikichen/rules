const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const policy = JSON.parse(read('policy.json'));
const clash = yaml.load(read('clash_config_slim.yaml'));
const groups = new Map(clash['proxy-groups'].map(g => [g.name, g]));
const shadowGroups = new Map(read('shadowrocket_slim.conf').split('[Proxy Group]')[1].split('[Rule]')[0]
  .split('\n').filter(l => l.includes(' = ')).map(l => l.split(' = ')));

test('common service menus expose all existing candidates without duplicates', () => {
  for (const name of policy.services) {
    const group = groups.get(name);
    if (group) {
      for (const member of policy.candidates) {
        if (groups.has(member) || member === 'DIRECT') assert.ok(group.proxies.includes(member), `${name}: ${member}`);
      }
    }
    const shadow = shadowGroups.get(name);
    if (shadow) {
      const members = shadow.split(',').slice(1).filter(p => !p.includes('='));
      assert.equal(members.length, new Set(members).size, name);
      for (const member of policy.candidates) {
        if (shadowGroups.has(member) || member === 'DIRECT') assert.ok(members.includes(member), `${name}: ${member}`);
      }
    }
  }
});

test('service defaults and dedicated media/AI entries survive menu normalization', () => {
  assert.equal(groups.get('阿里海外').proxies[0], 'DIRECT');
  assert.equal(groups.get('中转站').proxies[0], 'DIRECT');
  assert.equal(groups.get('国外媒体').proxies[0], '节点选择');
  assert.ok(groups.get('国外媒体').proxies.includes('奈飞节点'));
  assert.equal(groups.has('OpenAI'), false);
  assert.equal(groups.get('人工智能').proxies[0], 'AI-故障转移');
  assert.equal(groups.get('故障转移').proxies, undefined);
  const media = shadowGroups.get('国外媒体').split(',');
  assert.equal(media[1], '节点选择');
  assert.ok(media.includes('奈飞节点'));
  assert.ok(media.includes('流媒体解锁'));
  assert.equal(shadowGroups.has('Spotify'), false);
  for (const name of ['微软服务']) {
    const parts = shadowGroups.get(name).split(',').slice(1);
    const index = Number(parts.find(p => p.startsWith('select=')).slice(7));
    assert.equal(parts.filter(p => !p.includes('='))[index], '节点选择');
  }
});

test('精简配置奈飞节点只在解锁标记节点中自动选延迟较低的线路', () => {
  const netflix = groups.get('奈飞节点');
  assert.equal(netflix.type, 'url-test');
  assert.equal(netflix.filter, '(?i)\\bNF\\b|奈飞|解锁|Netflix');
  assert.equal(netflix.url, policy.health.url);
  assert.equal(netflix['expected-status'], policy.health['expected-status']);
  assert.equal(netflix.timeout, policy.health.timeout);
  assert.equal(netflix.interval, policy.health.interval);
  assert.equal(netflix.tolerance, policy.health.tolerance);
  assert.ok(clash.rules.includes('RULE-SET,Netflix_Domain,奈飞节点'));
  assert.ok(clash.rules.includes('RULE-SET,Netflix_IP,奈飞节点,no-resolve'));
});

test('converter resolves shared candidates to existing dynamic regional groups', () => {
  const context = { $arguments: {}, console, structuredClone };
  vm.createContext(context);
  vm.runInContext(read('convert_clash_reference.js'), context);
  const proxies = ['美国 01', '日本 01', '香港 01', '新加坡 01', '德国 01', '法国 01']
    .map(name => ({ name, type: 'ss', server: 'example.com', port: 443, cipher: 'aes-128-gcm', password: 'test' }));
  const result = JSON.parse(JSON.stringify(context.main({ proxies })));
  const dynamic = new Map(result['proxy-groups'].map(g => [g.name, g]));
  const common = dynamic.get('国外媒体').proxies;
  for (const name of ['GitHub', '苹果服务', '电报消息']) {
    const group = dynamic.get(name);
    for (const member of common) assert.ok(group.proxies.includes(member), `${name}: ${member}`);
  }
  assert.ok(common.includes('美国节点'));
  assert.ok(common.includes('狮城节点'));
  assert.ok(!common.includes('美国-自动选择'));
  assert.equal(dynamic.get('人工智能').proxies[0], 'AI-故障转移');
});

test('converter collects removed regions into Other Regions', () => {
  const names = ['香港 01', '日本 01', '新加坡 01', '美国 01', '德国 01', '法国 01',
    '韩国 01', '泰国 01', '土耳其 01', '阿根廷 01'];
  for (const script of ['convert_clash_reference.js', 'convert_auto.js']) {
    const context = { $arguments: {}, console, structuredClone };
    vm.createContext(context);
    vm.runInContext(read(script), context, { filename: script });
    const proxies = names.map(name => ({ name, type: 'ss', server: 'example.com',
      port: 443, cipher: 'aes-128-gcm', password: 'test' }));
    const result = JSON.parse(JSON.stringify(context.main({ proxies })));
    const other = result['proxy-groups'].find(group => group.name === '其他地区');
    assert.ok(other, script);
    for (const name of ['韩国 01', '泰国 01', '土耳其 01', '阿根廷 01']) {
      assert.ok(other.proxies.includes(name), `${script}: ${name}`);
    }
  }
});
