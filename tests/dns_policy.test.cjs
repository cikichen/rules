const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');

for (const file of ['clash_config_slim.yaml', 'convert_clash_reference.js', 'convert_auto.js']) {
  test(`${file}: foreign DNS uses an existing proxy group and direct DNS stays domestic`, () => {
    const configs = [];
    if (file.endsWith('.yaml')) {
      configs.push(yaml.load(fs.readFileSync(path.join(root, file), 'utf8')));
    } else {
      for (const fakeip of [false, true]) {
        for (const compact of [false, true]) {
          const context = { $arguments: { fakeip, compact }, console, structuredClone };
          vm.createContext(context);
          vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
          configs.push(JSON.parse(JSON.stringify(context.main({ proxies: [] }))));
        }
      }
    }
    for (const config of configs) {
      const groups = new Set(config['proxy-groups'].map(group => group.name));
      const dns = config.dns;
      // 未分类域名也须使用有效的加密上游，不能隐式采用内核默认的国内 DNS。
      for (const upstream of [...dns.nameserver, ...dns['nameserver-policy']['geosite:geolocation-!cn']]) {
        const url = new URL(upstream);
        assert.equal(url.protocol, 'https:');
        assert.equal(url.pathname, '/dns-query');
        assert.ok(groups.has(decodeURIComponent(url.hash.slice(1))));
      }
      assert.deepEqual(dns.fallback, []);
      assert.deepEqual(dns['nameserver-policy']['geosite:cn,private'],
        ['223.5.5.5#DIRECT', '119.29.29.29#DIRECT']);
      assert.deepEqual(dns['direct-nameserver'], ['223.5.5.5', '119.29.29.29']);
      assert.equal(dns['direct-nameserver-follow-policy'], false);
      assert.ok(dns['proxy-server-nameserver'].length > 0);
      assert.deepEqual(config.tun['dns-hijack'], ['any:53', 'tcp://any:53']);
      assert.equal('enable' in config.tun, false);
      assert.equal('route-address' in config.tun, false);
    }
  });
}

test('DNS overlay preserves traffic rules, node selection and existing TUN routes', () => {
  const context = { console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, '防止dns泄露(雾).js'), 'utf8'), context);
  const config = {
    'proxy-groups': [{ name: '出口 #1', type: 'select', proxies: ['节点 A'] }],
    rules: ['DOMAIN-SUFFIX,example.cn,DIRECT', 'MATCH,出口 #1'],
    dns: { 'fake-ip-filter': ['*.lan'], 'nameserver-policy': { '+.lan': '192.168.0.1' } },
    tun: { enable: false, 'route-address': ['1.1.1.1/32'], 'dns-hijack': ['192.168.0.1:53'] }
  };
  const original = structuredClone(config);
  const result = JSON.parse(JSON.stringify(context.main(config)));
  assert.deepEqual(result.rules, original.rules);
  assert.deepEqual(result['proxy-groups'], original['proxy-groups']);
  assert.deepEqual(result.dns['fake-ip-filter'], original.dns['fake-ip-filter']);
  assert.equal(result.dns['nameserver-policy']['+.lan'], '192.168.0.1');
  assert.equal(decodeURIComponent(new URL(result.dns.nameserver[0]).hash.slice(1)), '出口 #1');
  assert.equal(result.tun.enable, false);
  assert.deepEqual(result.tun['route-address'], original.tun['route-address']);
  assert.ok(result.tun['dns-hijack'].includes('tcp://any:53'));
  assert.deepEqual(JSON.parse(JSON.stringify(context.main(config))), result);
  assert.throws(() => context.main({ rules: ['MATCH,DIRECT'] }), /代理组/);
});
