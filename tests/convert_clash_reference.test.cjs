const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'convert_clash_reference.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

function createSampleProxies() {
  return [
    { name: '美国 01', type: 'ss', server: '1.1.1.1', port: 443, cipher: 'aes-128-gcm', password: 'pwd' },
    { name: '日本 01', type: 'ss', server: '1.1.1.2', port: 443, cipher: 'aes-128-gcm', password: 'pwd' },
    { name: '香港 01', type: 'ss', server: '1.1.1.3', port: 443, cipher: 'aes-128-gcm', password: 'pwd' }
  ];
}

function runGenerator(args = {}, proxies = createSampleProxies()) {
  const context = {
    $arguments: args,
    console,
    structuredClone,
  };

  vm.createContext(context);
  vm.runInContext(scriptSource, context, { filename: 'convert_clash_reference.js' });
  return JSON.parse(JSON.stringify(context.main({ proxies: structuredClone(proxies) })));
}

test('legacy full config remains backward compatible', () => {
  const result = runGenerator({ full: true });

  assert.equal(result['mixed-port'], 7890);
  assert.equal(result['redir-port'], 7892);
  assert.equal(result['tproxy-port'], 7893);
  assert.equal(result['routing-mark'], 7894);
  assert.equal(result['allow-lan'], true);
  assert.equal(result['external-controller'], ':9999');
});

test('base output excludes runtime-only ports and controller settings', () => {
  const result = runGenerator({ full: false });

  assert.equal('mixed-port' in result, false);
  assert.equal('redir-port' in result, false);
  assert.equal('tproxy-port' in result, false);
  assert.equal('routing-mark' in result, false);
  assert.equal('allow-lan' in result, false);
  assert.equal('external-controller' in result, false);
  assert.ok(result['proxy-groups']);
  assert.ok(result['rule-providers']);
  assert.ok(result.rules);
  assert.ok(result.dns);
  assert.ok(result.sniffer);
});

test('profile does not leak runtime fields into base output when full is false', () => {
  for (const profile of ['client', 'router']) {
    const result = runGenerator({ full: false, profile });

    assert.equal('mixed-port' in result, false);
    assert.equal('redir-port' in result, false);
    assert.equal('tproxy-port' in result, false);
    assert.equal('routing-mark' in result, false);
    assert.equal('allow-lan' in result, false);
    assert.equal('external-controller' in result, false);
    assert.ok(result['proxy-groups']);
    assert.ok(result['rule-providers']);
    assert.ok(result.rules);
    assert.ok(result.dns);
    assert.ok(result.sniffer);
  }
});

test('client profile uses localhost controller and mixed-port only', () => {
  const result = runGenerator({ full: true, profile: 'client' });

  assert.equal(result['mixed-port'], 7890);
  assert.equal(result['allow-lan'], false);
  assert.equal(result['external-controller'], '127.0.0.1:9999');
  assert.equal('redir-port' in result, false);
  assert.equal('tproxy-port' in result, false);
  assert.equal('routing-mark' in result, false);
});

test('router profile keeps transparent proxy ports and safer controller binding', () => {
  const result = runGenerator({ full: true, profile: 'router' });

  assert.equal(result['allow-lan'], true);
  assert.equal(result['redir-port'], 7892);
  assert.equal(result['tproxy-port'], 7893);
  assert.equal(result['routing-mark'], 7894);
  assert.equal(result['external-controller'], '127.0.0.1:9999');
  assert.equal('mixed-port' in result, false);
});

test('client and router profiles preserve shared policy sections', () => {
  const client = runGenerator({ full: true, profile: 'client' });
  const router = runGenerator({ full: true, profile: 'router' });

  assert.deepEqual(
    Object.keys(client['rule-providers']).sort(),
    Object.keys(router['rule-providers']).sort()
  );
  assert.deepEqual(client.rules, router.rules);
  assert.deepEqual(client.dns, router.dns);
  assert.deepEqual(client.sniffer, router.sniffer);
});

test('linux.do group and rules are included in generated config', () => {
  const result = runGenerator({ full: false });
  const linuxDoGroup = result['proxy-groups'].find(group => group.name === 'Linux.do');

  assert.ok(linuxDoGroup);
  assert.equal(linuxDoGroup.type, 'select');
  assert.deepEqual(
    linuxDoGroup.proxies.slice(0, 4),
    ['节点选择', '自动选择', '全球优选', '故障转移']
  );
  assert.ok(result.rules.includes('DOMAIN-SUFFIX,linux.do,Linux.do'));
  assert.ok(result.rules.includes('DOMAIN,linux.do,Linux.do'));
});

test('ai groups prioritize AI fallback and expose AI fallback group', () => {
  const result = runGenerator({ full: false });
  const aiFallbackGroup = result['proxy-groups'].find(group => group.name === 'AI 故障转移');
  const openAiGroup = result['proxy-groups'].find(group => group.name === 'OpenAI');
  const claudeGroup = result['proxy-groups'].find(group => group.name === 'Claude');

  assert.ok(aiFallbackGroup);
  assert.equal(aiFallbackGroup.type, 'fallback');
  assert.equal(openAiGroup.proxies[0], 'AI 故障转移');
  assert.equal(claudeGroup.proxies[0], 'AI 故障转移');
});

test('custom group uses friendly chinese name and Custom rules target it', () => {
  const result = runGenerator({ full: false });
  const customGroup = result['proxy-groups'].find(group => group.name === '自定义规则');
  const customRuleIndex = result.rules.indexOf('RULE-SET,Custom,自定义规则');
  const directRuleIndex = result.rules.indexOf('RULE-SET,DirectList,全球直连');

  assert.ok(customGroup);
  assert.equal(customGroup.type, 'select');
  assert.ok(result.rules.includes('RULE-SET,Custom,自定义规则'));
  assert.ok(customRuleIndex >= 0);
  assert.ok(directRuleIndex >= 0);
  assert.ok(customRuleIndex < directRuleIndex);
  assert.equal(result['proxy-groups'].some(group => group.name === 'custom'), false);
  assert.equal(result['proxy-groups'].some(group => group.name === '自定义组'), false);
});

test('hybrid health-check defaults keep selectors conservative and fallback responsive', () => {
  const result = runGenerator({ full: false });
  const groups = new Map(result['proxy-groups'].map(group => [group.name, group]));

  assert.equal(groups.get('自动选择').url, 'https://cp.cloudflare.com/generate_204');
  assert.equal(groups.get('自动选择').interval, 300);
  assert.equal(groups.get('自动选择').timeout, 4000);
  assert.equal(groups.get('自动选择').tolerance, 50);
  assert.equal(groups.get('自动选择').lazy, true);

  assert.equal(groups.get('全球优选').interval, 300);
  assert.equal(groups.get('全球优选').timeout, 4000);
  assert.equal(groups.get('全球优选').lazy, true);

  assert.equal(groups.get('故障转移').interval, 120);
  assert.equal(groups.get('故障转移').timeout, 4000);
  assert.equal(groups.get('故障转移').tolerance, 50);
  assert.equal(groups.get('故障转移').lazy, false);

  assert.equal(groups.get('AI 故障转移').interval, 120);
  assert.equal(groups.get('AI 故障转移').timeout, 4000);
  assert.equal(groups.get('AI 故障转移').lazy, false);

  assert.equal(groups.get('香港节点').interval, 300);
  assert.equal(groups.get('香港节点').timeout, 4000);
  assert.equal(groups.get('香港节点').tolerance, 50);
  assert.equal(groups.get('香港节点').lazy, true);
});

test('fallback groups use direct-node include-all semantics instead of nested region groups', () => {
  const result = runGenerator({ full: false });
  const groups = new Map(result['proxy-groups'].map(group => [group.name, group]));
  const fallback = groups.get('故障转移');
  const aiFallback = groups.get('AI 故障转移');

  assert.equal(fallback.type, 'fallback');
  assert.equal(fallback['include-all'], true);
  assert.equal('proxies' in fallback, false);

  assert.equal(aiFallback.type, 'fallback');
  assert.equal(aiFallback['include-all'], true);
  assert.equal('proxies' in aiFallback, false);
  assert.ok(typeof aiFallback['exclude-filter'] === 'string');
});

test('dual load-balance groups expose hashing and round-robin strategies', () => {
  const result = runGenerator({ full: false });
  const groups = new Map(result['proxy-groups'].map(group => [group.name, group]));
  const selector = groups.get('节点选择');
  const custom = groups.get('自定义规则');

  assert.ok(groups.get('负载均衡-散列'));
  assert.ok(groups.get('负载均衡-轮询'));
  assert.equal(groups.get('负载均衡-散列').type, 'load-balance');
  assert.equal(groups.get('负载均衡-散列').strategy, 'consistent-hashing');
  assert.equal(groups.get('负载均衡-轮询').type, 'load-balance');
  assert.equal(groups.get('负载均衡-轮询').strategy, 'round-robin');

  assert.ok(selector.proxies.includes('负载均衡-散列'));
  assert.ok(selector.proxies.includes('负载均衡-轮询'));
  assert.ok(custom.proxies.includes('负载均衡-散列'));
  assert.ok(custom.proxies.includes('负载均衡-轮询'));
});
