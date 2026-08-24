const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const clashSource = fs.readFileSync(path.join(projectRoot, 'clash_config_slim.yaml'), 'utf8');
const shadowrocketSource = fs.readFileSync(path.join(projectRoot, 'shadowrocket_slim.conf'), 'utf8');
const commonRegions = ['香港', '台湾', '狮城', '日本', '美国', '东南亚'];

function getClashGroupBlock(name) {
  const marker = `  - name: ${name}\n`;
  const start = clashSource.indexOf(marker);
  assert.notEqual(start, -1, `missing Clash group: ${name}`);

  const next = clashSource.indexOf('\n  - name: ', start + marker.length);
  return clashSource.slice(start, next === -1 ? clashSource.length : next);
}

function getYamlField(block, field) {
  const match = block.match(new RegExp(`^    ${field}: (.+)$`, 'm'));
  return match?.[1];
}

function getShadowrocketGroups() {
  const section = shadowrocketSource.split('[Proxy Group]\n')[1].split('\n[Rule]')[0];
  return new Map(
    section
      .split('\n')
      .filter(line => line && !line.startsWith('#') && line.includes(' = '))
      .map(line => {
        const separator = line.indexOf(' = ');
        return [line.slice(0, separator), line.slice(separator + 3)];
      })
  );
}

test('common Clash regions expose matching auto-select and consistent-hashing groups', () => {
  const selector = getClashGroupBlock('节点选择');
  const fallbackSelector = getClashGroupBlock('漏网之鱼');
  const groupNames = Array.from(clashSource.matchAll(/^  - name: (.+)$/gm), match => match[1]);

  for (const region of commonRegions) {
    const autoName = `${region}-自动选择`;
    const balanceName = `${region}-负载均衡`;
    const autoGroup = getClashGroupBlock(autoName);
    const balanceGroup = getClashGroupBlock(balanceName);

    assert.equal(getYamlField(autoGroup, 'type'), 'url-test');
    assert.equal(getYamlField(balanceGroup, 'type'), 'load-balance');
    assert.equal(getYamlField(balanceGroup, 'strategy'), 'consistent-hashing');
    assert.equal(getYamlField(autoGroup, 'filter'), getYamlField(balanceGroup, 'filter'));
    assert.match(selector, new RegExp(`^      - ${autoName}$`, 'm'));
    assert.match(selector, new RegExp(`^      - ${balanceName}$`, 'm'));
    assert.match(fallbackSelector, new RegExp(`^      - ${balanceName}$`, 'm'));
    assert.doesNotMatch(clashSource, new RegExp(`${region}节点`));
  }

  for (const groupName of groupNames) {
    const group = getClashGroupBlock(groupName);
    for (const region of commonRegions) {
      if (new RegExp(`^      - ${region}-自动选择$`, 'm').test(group)) {
        assert.match(group, new RegExp(`^      - ${region}-负载均衡$`, 'm'));
      }
    }
  }
});

test('Shadowrocket keeps the same common regional strategy pairs', () => {
  const groups = getShadowrocketGroups();
  const selector = groups.get('节点选择');
  const fallbackSelector = groups.get('漏网之鱼');

  for (const region of commonRegions) {
    const autoName = `${region}-自动选择`;
    const balanceName = `${region}-负载均衡`;
    const autoGroup = groups.get(autoName);
    const balanceGroup = groups.get(balanceName);
    const autoFilter = autoGroup?.match(/policy-regex-filter=(.*)$/)?.[1];
    const balanceFilter = balanceGroup?.match(/policy-regex-filter=(.*),strategy=/)?.[1];

    assert.ok(autoGroup?.startsWith('url-test,'));
    assert.ok(balanceGroup?.startsWith('load-balance,'));
    assert.match(balanceGroup, /strategy=consistent-hashing$/);
    assert.equal(autoFilter, balanceFilter);
    assert.ok(selector.split(',').includes(autoName));
    assert.ok(selector.split(',').includes(balanceName));
    assert.ok(fallbackSelector.split(',').includes(balanceName));
    assert.doesNotMatch(shadowrocketSource, new RegExp(`${region}节点`));
  }

  for (const [groupName, group] of groups) {
    if (!group.startsWith('select,')) continue;
    const members = group.split(',');
    for (const region of commonRegions) {
      if (members.includes(`${region}-自动选择`)) {
        assert.ok(
          members.includes(`${region}-负载均衡`),
          `${groupName} is missing ${region}-负载均衡`
        );
      }
    }
  }
});
