# rules
个人用

## 脚本说明

### 推荐使用

**`convert_clash_reference.js`**：主脚本，支持客户端/路由器分层配置。

### 兼容参考

**`convert_auto.js`**：来自 [powerfullz/override-rules](https://github.com/powerfullz/override-rules) 的外部脚本，保留作为参考。如需新功能（`profile` 分层、更全规则集），请使用 `convert_clash_reference.js`。

### 下载地址

GitHub 直连下载和失效的 `github.ithome.me` 入口改用 `https://gh-proxy.org/` 前缀，现有可用的 jsDelivr 和其他 CDN 地址保留。主脚本的 GitHub 原始规则地址由 `wrapRaw` 统一拼接前缀，修改时避免重复添加。

精简配置也显式设置 `geox-url`，沿用主脚本的 jsDelivr Geo 数据源。`IP-ASN` 规则即使带有 `no-resolve` 也依赖 ASN 数据库；遗漏 `geox-url.asn` 时，内核仍可能从默认 GitHub 地址下载并超时。更新时应重新加载整个精简配置，确保顶层 `geox-url` 生效。

2026-11-09 已对配置和脚本生成结果中的下载地址执行完整 GET 与内容格式检查，310 个下载 URL 全部通过；81 个新镜像 URL 与 GitHub 原始文件的 SHA-256 一致。详见[校验记录](docs/reports/download-audit-2026-11-09.md)。这是本机当前网络的一次校验，后续镜像或上游变更仍可能影响下载；修改后需在客户端重新加载配置。

---
个人用

## convert_clash_reference.js 参数

- `full=true`：输出完整 Mihomo 配置
- `full=false`：仅输出共享策略层（`proxy-groups`、`rule-providers`、`rules`、`dns`、`sniffer`、`geodata` 等），不包含运行时端口与 controller
- `profile=legacy`：保留旧完整输出行为
- `profile=client`：生成更适合客户端的运行时字段（`mixed-port`、本机 `external-controller`、关闭 `allow-lan`）
- `profile=router`：生成更适合路由器的运行时字段（`redir-port` / `tproxy-port` / `routing-mark`、开启 `allow-lan`、本机 `external-controller`）
- `profile` 仅在 `full=true` 时生效；当 `full=false` 时，无论传入 `profile=client/router` 与否，都只输出共享策略层
- `fakeip=true`：切换到 Fake-IP DNS 模式


## 弱节点与故障切换

本轮调整覆盖主脚本 `convert_clash_reference.js`、`clash_config_slim.yaml` 和 `shadowrocket_slim.conf`；独立的 AI 分流覆写脚本与兼容参考脚本不受影响。

- 主脚本的“节点选择”默认使用“故障转移”，避免默认经“全球手动”落到 DIRECT。精简配置继续沿用故障转移默认值。
- Mihomo 故障转移直接测试候选节点，每 60 秒检查一次，超时 4000 毫秒；自动选择和负载均衡每 120 秒检查，闲置组按需检测，自动选择切换容差为 100 毫秒。所有测试保留 HTTPS，要求返回 204。
- AI 默认使用独立故障转移，负载均衡保留为可选项。故障转移按候选顺序选择可用节点，不保证最低延迟，也可能在前序节点恢复后切回。长会话若需要固定出口，可手动指定已确认可用的节点。
- 修复主脚本地区负载均衡缺少健康检查、其他地区测速参数不一致、空国家分组和小写国家代码识别问题。保留精简配置已经删除地区负载均衡组的布局。
- Shadowrocket 同步默认 AI 故障转移、直接节点兜底和自动选择参数；其 timeout 单位为秒，不能照搬 Mihomo 的毫秒值。

更新文件后，需要在实际客户端重新加载配置。客户端若保存了上次选择，默认排序不会覆盖它，请将“节点选择”设为“故障转移”，将“人工智能”设为“AI-故障转移”（主脚本中名为“AI 故障转移”）。

204 测试只证明测速地址可达，不代表 AI 解锁、带宽或持续丢包质量；切换也不会迁移已有 TCP/SSE 连接。全部线路都差时仍需要更换节点或线路。以上间隔是配置基线，并非根据现场丢包测量得到的最优值。使用 proxy-providers 的客户端还需检查 provider 自身的 health-check；组级测速不能替代其检查。

参数语义参考 [Mihomo 策略组文档](https://wiki.metacubex.one/config/proxy-groups/)、[故障转移](https://wiki.metacubex.one/config/proxy-groups/fallback/) 和 [自动选择](https://wiki.metacubex.one/config/proxy-groups/url-test/)。

## 共享策略维护

`policy.json` 集中维护普通服务候选列表、适用服务名称和健康检查参数。修改后运行 `npm run sync:policy`，同步到 Clash 精简配置、Shadowrocket 配置和主转换脚本。`npm run check:policy` 只检查同步状态，`npm test` 会先执行此检查。

Clash 配置用 YAML 锚点复用相同的候选列表和健康检查，加载后仍是完整策略组；Shadowrocket 输出其原生的展开格式。主转换脚本内嵌生成的数据，可以继续直接粘贴到客户端使用，无需读取本地 JSON。`npm run gen` 仍输出主转换脚本的完整配置，不代替精简配置的同步命令。

普通服务统一列出现有的自动选择、故障转移、两种负载均衡、地区、手动选择和直连。各服务原默认出口和奈飞等专用候选保留；Shadowrocket 的 `select` 索引随列表重排，维持原默认选择。阿里海外补齐候选，但继续默认直连。

AI、TG 地区组、国内媒体、PT 等专用列表及故障转移的直接节点检查保持独立。地区识别表达式仍保留各客户端现有实现，本轮不改变地区匹配或域名/IP 规则。健康检查统一使用精简配置原有的 HTTPS Google 204 地址，间隔和超时不变。
