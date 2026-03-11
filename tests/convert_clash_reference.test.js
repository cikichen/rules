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
