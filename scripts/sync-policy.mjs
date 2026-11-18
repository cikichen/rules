import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { compactPolicy } from './compact-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'policy.json'), 'utf8'));
const check = process.argv.includes('--check');
let stale = false;
const unique = values => [...new Set(values)];
const dump = value => yaml.dump(value, { lineWidth: -1, noRefs: true }).trimEnd();

function save(file, content) {
  const target = path.join(root, file);
  if (fs.readFileSync(target, 'utf8') === content) return;
  if (check) {
    console.error(`策略未同步: ${file}`);
    stale = true;
  } else {
    fs.writeFileSync(target, content);
    console.log(`已同步: ${file}`);
  }
}

// 保留原默认出口及专用入口，仅补齐公共候选；不接管 AI、TG 地区组等专用策略。
function members(name, original, available) {
  if (!policy.services.includes(name)) return original;
  return unique([original[0], ...original.filter(p => !policy.candidates.includes(p)),
    ...policy.candidates.filter(p => available.has(p))]);
}

function health(type, name) {
  const { tolerance, fallbackInterval, ...common } = policy.health;
  return {
    ...common,
    // Telegram 前端的 HEAD 返回 501，不能复用 Google 的 204 或 GET 的 404。
    ...policy.telegramHealth[name],
    interval: type === 'fallback' ? fallbackInterval : common.interval,
    lazy: type !== 'fallback',
    ...(type === 'url-test' ? { tolerance } : {})
  };
}

const clashFile = 'clash_config_slim.yaml';
const clashSource = fs.readFileSync(path.join(root, clashFile), 'utf8');
const clash = yaml.load(clashSource);
const originalRules = clash.rules;
compactPolicy(clash, policy.groupMerges);
// DC 组直接测实际节点，避免借用普通地区组对 Google 的测速结果。
for (const group of clash['proxy-groups']) {
  if (!policy.telegramHealth[group.name]) continue;
  group.type = 'url-test';
  group['include-all'] = true;
  group['exclude-filter'] = clash['proxy-groups'].find(g => g.name === '自动选择')['exclude-filter'];
  delete group.proxies;
}
const ruleChanges = new Map(originalRules.map((rule, index) => [rule, clash.rules[index]]));
const available = new Set(['DIRECT', ...clash['proxy-groups'].map(g => g.name)]);
const anchors = new Map();
const healthAnchors = new Map();
const clashOutput = clashSource.replace(/^  - name: (.+)\n[\s\S]*?(?=^  - name: |^rule-providers:|^# ={5,}|$(?![\s\S]))/gm, block => {
  // Preserve section headings and spacing after the group.
  const end = block.search(/\n(?:  #|\s*$)/m);
  const suffix = end < 0 ? '' : block.slice(end + 1);
  const group = clash['proxy-groups'].find(g => g.name === block.split('\n')[0].slice(10));
  if (!group) return suffix;
  const { name, proxies, ...fields } = group;
  const automatic = ['url-test', 'fallback', 'load-balance'].includes(group.type);
  if (automatic) {
    for (const key of ['url', 'expected-status', 'timeout', 'interval', 'lazy', 'tolerance']) delete fields[key];
  }
  let output = `  - name: ${name}\n` + dump(fields).split('\n').map(l => `    ${l}`).join('\n') + '\n';
  if (automatic) {
    const settings = health(group.type, name);
    const key = JSON.stringify(settings);
    const existing = healthAnchors.get(key);
    if (existing) output += `    <<: *${existing}\n`;
    else {
      const anchor = `${group.type.replace('-', '_')}_health${policy.telegramHealth[name] ? `_${healthAnchors.size + 1}` : ''}`;
      healthAnchors.set(key, anchor);
      output += `    <<: &${anchor}\n` + dump(settings).split('\n').map(l => `      ${l}`).join('\n') + '\n';
    }
  }
  if (proxies) {
    const selected = members(name, proxies, available);
    const key = JSON.stringify(selected);
    if (policy.services.includes(name) && anchors.has(key)) output += `    proxies: *${anchors.get(key)}\n`;
    else {
      const anchor = policy.services.includes(name) ? `service_candidates_${anchors.size + 1}` : null;
      if (anchor) anchors.set(key, anchor);
      output += `    proxies:${anchor ? ` &${anchor}` : ''}\n` + selected.map(p => `      - ${p}\n`).join('');
    }
  }
  return output + suffix;
});
save(clashFile, clashOutput.replace(/^  - (.+)$/gm, (line, rule) =>
  ruleChanges.has(rule) ? `  - ${ruleChanges.get(rule)}` : line));

const shadowFile = 'shadowrocket_slim.conf';
const originalShadow = fs.readFileSync(path.join(root, shadowFile), 'utf8');
const shadowGroupSource = originalShadow.split('[Proxy Group]')[1].split('[Rule]')[0];
const shadowConfig = {
  'proxy-groups': shadowGroupSource.split('\n').filter(line => line.includes(' = ')).map(line => {
    const [name, definition] = line.split(' = ');
    const [type, ...parts] = definition.split(',');
    return { name, type, ...(type === 'select' ? { proxies: parts.filter(p => !p.includes('=')) } : {}) };
  }),
  rules: originalShadow.split('[Rule]')[1].split('[Host]')[0].split('\n').filter(line => line && !line.startsWith('#'))
};
const shadowRules = shadowConfig.rules;
compactPolicy(shadowConfig, policy.groupMerges);
const shadowKept = new Map(shadowConfig['proxy-groups'].map(group => [group.name, group]));
const shadowRedirect = name => policy.groupMerges[name]?.find(candidate => shadowKept.has(candidate)) || name;
const shadowRuleChanges = new Map(shadowRules.map((rule, index) => [rule, shadowConfig.rules[index]]));
const shadowSource = originalShadow.replace(/^(.*?) = (select|url-test|fallback|load-balance),(.+)\n/gm, (line, name, type, rest) => {
  if (!shadowKept.has(name)) return '';
  if (type !== 'select') return line;
  const parts = rest.split(',');
  const original = parts.filter(p => !p.includes('='));
  const selected = shadowKept.get(name).proxies;
  const oldIndex = Number(parts.find(p => p.startsWith('select='))?.slice(7) || 0);
  const options = parts.filter(p => p.includes('=') && !p.startsWith('select='));
  if (parts.some(p => p.startsWith('select='))) options.push(`select=${selected.indexOf(shadowRedirect(original[oldIndex]))}`);
  return `${name} = select,${[...selected, ...options].join(',')}\n`;
}).split('\n').map(line => shadowRuleChanges.get(line) || line).join('\n');
const shadowAvailable = new Set(['DIRECT', 'PROXY', ...shadowSource.split('[Proxy Group]')[1].split('[Rule]')[0]
  .split('\n').filter(l => l.includes(' = ')).map(l => l.split(' = ')[0])]);
save(shadowFile, shadowSource.replace(/^(.*?) = (select|url-test|fallback|load-balance),(.+)$/gm, (line, name, type, rest) => {
  // Regex filters may contain commas: only split the select lists we manage.
  if (type === 'select' && policy.services.includes(name)) {
    const parts = rest.split(',');
    const original = parts.filter(p => !p.includes('='));
    const selected = members(name, original, shadowAvailable);
    const oldIndex = Number(parts.find(p => p.startsWith('select='))?.slice(7) || 0);
    const options = parts.filter(p => p.includes('=') && !p.startsWith('select='));
    return `${name} = select,${[...selected, ...options, `select=${selected.indexOf(original[oldIndex])}`].join(',')}`;
  }
  if (type === 'url-test' || type === 'fallback') {
    return line.replace(/url=[^,]+/, `url=${policy.health.url}`)
      .replace(/interval=\d+/, `interval=${type === 'fallback' ? policy.health.fallbackInterval : policy.health.interval}`)
      .replace(/timeout=\d+/, `timeout=${policy.health.timeout / 1000}`)
      .replace(/tolerance=\d+/, `tolerance=${policy.health.tolerance}`);
  }
  return line;
}));

const aclFile = 'ACL4SSR_WithChinaIp_WithGFW.ini';
const aclSource = fs.readFileSync(path.join(root, aclFile), 'utf8');
const aclNames = new Map(aclSource.split('\n').filter(line => line.startsWith('custom_proxy_group='))
  .map(line => {
    const name = line.split('`')[0].slice('custom_proxy_group='.length);
    return [name.slice(name.indexOf(' ') + 1), name];
  }));
const aclRedirects = new Map();
for (const [name, candidates] of Object.entries(policy.groupMerges)) {
  if (!aclNames.has(name)) continue;
  const target = candidates.find(candidate => aclNames.has(candidate) && !policy.groupMerges[candidate]);
  if (!target) throw new Error(`无法合并 ACL 策略组 ${name}`);
  aclRedirects.set(aclNames.get(name), aclNames.get(target));
}
save(aclFile, aclSource.split('\n').filter(line => !line.startsWith('custom_proxy_group=')
  || !aclRedirects.has(line.split('`')[0].slice('custom_proxy_group='.length)))
  .map(line => {
    if (line.startsWith('ruleset=')) {
      const comma = line.indexOf(',');
      const name = line.slice('ruleset='.length, comma);
      return `ruleset=${aclRedirects.get(name) || name}${line.slice(comma)}`;
    }
    if (line.startsWith('custom_proxy_group=')) {
      const parts = line.split('`');
      return [parts[0], ...new Set(parts.slice(1).map(part => part.startsWith('[]')
        ? `[]${aclRedirects.get(part.slice(2)) || part.slice(2)}` : part))].join('`');
    }
    return line;
  }).join('\n'));

const marker = /\/\/ BEGIN SHARED POLICY[\s\S]*?\/\/ END SHARED POLICY/;
const embedded = `// BEGIN SHARED POLICY (由 npm run sync:policy 生成)\nconst SHARED_POLICY = ${JSON.stringify(policy, null, 4)};\n\n${compactPolicy.toString()}\n// END SHARED POLICY`;
for (const converterFile of ['convert_clash_reference.js', 'convert_auto.js']) {
  const converter = fs.readFileSync(path.join(root, converterFile), 'utf8');
  const output = marker.test(converter) ? converter.replace(marker, embedded)
    : converter.replace('const DEFAULT_GROUP_ICON', embedded + '\n\nconst DEFAULT_GROUP_ICON');
  save(converterFile, output);
}
if (stale) process.exitCode = 1;
