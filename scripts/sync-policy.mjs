import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

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

function health(type) {
  const { tolerance, fallbackInterval, ...common } = policy.health;
  return {
    ...common,
    interval: type === 'fallback' ? fallbackInterval : common.interval,
    lazy: type !== 'fallback',
    ...(type === 'url-test' ? { tolerance } : {})
  };
}

const clashFile = 'clash_config_slim.yaml';
const clashSource = fs.readFileSync(path.join(root, clashFile), 'utf8');
const clash = yaml.load(clashSource);
const available = new Set(['DIRECT', ...clash['proxy-groups'].map(g => g.name)]);
const anchors = new Map();
const healthAnchors = new Set();
const clashOutput = clashSource.replace(/^  - name: (.+)\n[\s\S]*?(?=^  - name: |^rule-providers:|^# ={5,}|$(?![\s\S]))/gm, block => {
  // Preserve section headings and spacing after the group.
  const end = block.search(/\n(?:  #|\s*$)/m);
  const suffix = end < 0 ? '' : block.slice(end + 1);
  const group = clash['proxy-groups'].find(g => g.name === block.split('\n')[0].slice(10));
  const { name, proxies, ...fields } = group;
  const automatic = ['url-test', 'fallback', 'load-balance'].includes(group.type);
  if (automatic) {
    for (const key of ['url', 'expected-status', 'timeout', 'interval', 'lazy', 'tolerance']) delete fields[key];
  }
  let output = `  - name: ${name}\n` + dump(fields).split('\n').map(l => `    ${l}`).join('\n') + '\n';
  if (automatic) {
    const anchor = `${group.type.replace('-', '_')}_health`;
    if (healthAnchors.has(anchor)) output += `    <<: *${anchor}\n`;
    else {
      healthAnchors.add(anchor);
      output += `    <<: &${anchor}\n` + dump(health(group.type)).split('\n').map(l => `      ${l}`).join('\n') + '\n';
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
save(clashFile, clashOutput);

const shadowFile = 'shadowrocket_slim.conf';
const shadowSource = fs.readFileSync(path.join(root, shadowFile), 'utf8');
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

const converterFile = 'convert_clash_reference.js';
const converter = fs.readFileSync(path.join(root, converterFile), 'utf8');
const marker = /\/\/ BEGIN SHARED POLICY[\s\S]*?\/\/ END SHARED POLICY/;
if (!marker.test(converter)) throw new Error('转换脚本缺少共享策略标记');
const embedded = `// BEGIN SHARED POLICY (由 npm run sync:policy 生成)\nconst SHARED_POLICY = ${JSON.stringify(policy, null, 4)};\n// END SHARED POLICY`;
save(converterFile, converter.replace(marker, embedded));
if (stale) process.exitCode = 1;
