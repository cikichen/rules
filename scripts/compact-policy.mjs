// 同步静态配置与独立转换脚本共用；转换脚本内嵌此函数，不依赖本地文件。
export function compactPolicy(config, merges) {
  const groups = config['proxy-groups'];
  const names = new Set(groups.map(group => group.name));
  const remaining = new Set(['DIRECT', 'REJECT', ...groups
    .filter(group => !merges[group.name]).map(group => group.name)]);
  const redirects = new Map();
  for (const [name, candidates] of Object.entries(merges)) {
    if (!names.has(name)) continue;
    const target = candidates.find(candidate => remaining.has(candidate));
    if (!target) throw new Error(`无法合并策略组 ${name}：目标组不存在`);
    redirects.set(name, target);
  }
  config['proxy-groups'] = groups.filter(group => !redirects.has(group.name));
  for (const group of config['proxy-groups']) {
    if (group.proxies) group.proxies = [...new Set(group.proxies
      .map(name => redirects.get(name) || name))];
  }
  config.rules = config.rules.map(rule => {
    const fields = rule.split(',');
    const index = fields.length - (fields.at(-1) === 'no-resolve' ? 2 : 1);
    fields[index] = redirects.get(fields[index]) || fields[index];
    return fields.join(',');
  });
  return config;
}
