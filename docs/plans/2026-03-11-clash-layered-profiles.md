# Clash Client/Router Layered Profiles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `convert_clash_reference.js` 在保持现有完整配置兼容的前提下，支持共享规则层与 `client` / `router` 运行时配置分层。

**Architecture:** 保留现有 `full=false` 输出作为共享规则层，继续包含规则、分组、DNS、sniffer 与 geodata。新增 `profile` 运行时参数，在 `full=true` 时根据 `legacy | client | router` 叠加不同的运行时字段；默认仍为 `legacy`，确保现有使用方不被破坏。

**Tech Stack:** JavaScript、Node.js 内置 `node:test` / `node:assert` / `node:vm`

---

### Task 1: 为运行时 profile 建立回归测试

**Files:**
- Create: `tests/convert_clash_reference.test.js`
- Modify: `convert_clash_reference.js`

**Step 1: Write the failing test**

```javascript
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
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/convert_clash_reference.test.js`
Expected: FAIL，因为当前脚本还不识别 `profile=client/router`

**Step 3: Write minimal implementation**

```javascript
function buildRuntimeProfileConfig({ profile }) {
  // 根据 legacy/client/router 返回不同 runtime 字段
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/convert_clash_reference.test.js`
Expected: PASS

### Task 2: 抽离 shared 层与 runtime overlay

**Files:**
- Modify: `convert_clash_reference.js`
- Test: `tests/convert_clash_reference.test.js`

**Step 1: Write the failing test**

```javascript
test('base output excludes runtime-only ports and controller settings', () => {
  const result = runGenerator({ full: false });
  assert.equal('mixed-port' in result, false);
  assert.equal('allow-lan' in result, false);
  assert.ok(result['proxy-groups']);
  assert.ok(result['rule-providers']);
  assert.ok(result.rules);
  assert.ok(result.dns);
  assert.ok(result.sniffer);
});
```

**Step 2: Run test to verify it fails or guards behavior**

Run: `node --test tests/convert_clash_reference.test.js`
Expected: 如果当前行为已满足，则作为保护测试；若不满足，则 FAIL

**Step 3: Refactor implementation**

```javascript
function buildSharedConfig({ proxyGroups, finalRules }) {
  return {
    'proxy-groups': proxyGroups,
    'rule-providers': ruleProviders,
    rules: finalRules,
    sniffer: snifferConfig,
    dns: fakeIPEnabled ? dnsConfigFakeIp : dnsConfig,
    'geodata-mode': true,
    'geox-url': geoxURL
  };
}
```

**Step 4: Run tests again**

Run: `node --test tests/convert_clash_reference.test.js`
Expected: PASS

### Task 3: 保持 legacy 兼容并记录新参数

**Files:**
- Modify: `convert_clash_reference.js`
- Modify: `README.md`
- Test: `tests/convert_clash_reference.test.js`

**Step 1: Write the failing test**

```javascript
test('legacy profile remains backward compatible', () => {
  const result = runGenerator({ full: true });
  assert.equal(result['mixed-port'], 7890);
  assert.equal(result['allow-lan'], true);
  assert.equal(result['external-controller'], ':9999');
});
```

**Step 2: Run test to verify it fails only if compatibility regressed**

Run: `node --test tests/convert_clash_reference.test.js`
Expected: PASS before or after refactor；若 FAIL 说明兼容性被破坏

**Step 3: Update docs minimally**

```markdown
- `profile=legacy`：维持旧完整输出
- `profile=client`：混合端口、本机 controller、更保守 LAN 设置
- `profile=router`：透明代理端口、路由标记、局域网代理
```

**Step 4: Verify docs and tests**

Run: `node --test tests/convert_clash_reference.test.js`
Expected: PASS

### Task 4: 生成验证与人工检查

**Files:**
- Modify: `convert_clash_reference.js`
- Test: `tests/convert_clash_reference.test.js`

**Step 1: Add a small fixture-style verification**

```javascript
test('client and router profiles preserve shared policy sections', () => {
  const client = runGenerator({ full: true, profile: 'client' });
  const router = runGenerator({ full: true, profile: 'router' });
  assert.deepEqual(Object.keys(client['rule-providers']), Object.keys(router['rule-providers']));
  assert.equal(Array.isArray(client.rules), true);
  assert.equal(Array.isArray(router.rules), true);
});
```

**Step 2: Run focused test suite**

Run: `node --test tests/convert_clash_reference.test.js`
Expected: PASS

**Step 3: Perform a direct runtime sanity check**

Run: `node --test tests/convert_clash_reference.test.js`
Expected: 所有 profile 均输出可预期字段集合，无旧行为回归

Plan complete and saved to `docs/plans/2026-03-11-clash-layered-profiles.md`.
