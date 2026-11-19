// Mihomo DNS 覆写：国外加密解析走代理，国内和直连出口保持本地解析。
// 不切换节点、不启用 TUN；实际接管需在客户端开启，或由路由器完成。
function main(config) {
  const groups = config["proxy-groups"] || [];
  const matchRule = (config.rules || []).find(rule => rule.startsWith("MATCH,"));
  const proxyName = groups.some(group => group.name === "节点选择")
    ? "节点选择"
    : matchRule?.split(",")[1];
  if (!groups.some(group => group.name === proxyName)) {
    throw new Error("DNS 覆写需要“节点选择”或 MATCH 指向的代理组");
  }

  const foreignDns = [
    `https://1.1.1.1/dns-query#${encodeURIComponent(proxyName)}`,
    `https://8.8.8.8/dns-query#${encodeURIComponent(proxyName)}`
  ];
  config.dns = {
    ...config.dns,
    enable: true,
    "enhanced-mode": "fake-ip",
    "respect-rules": true,
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    nameserver: foreignDns,
    fallback: [],
    "nameserver-policy": {
      ...config.dns?.["nameserver-policy"],
      "geosite:cn,private": ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT"],
      "geosite:geolocation-!cn": foreignDns
    },
    "proxy-server-nameserver": ["223.5.5.5", "119.29.29.29"],
    "direct-nameserver": ["223.5.5.5", "119.29.29.29"],
    "direct-nameserver-follow-policy": false
  };
  config.tun = {
    ...config.tun,
    "dns-hijack": [...new Set([
      ...(config.tun?.["dns-hijack"] || []),
      "any:53",
      "tcp://any:53"
    ])]
  };
  return config;
}
