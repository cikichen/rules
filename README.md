# rules
个人用

## 脚本说明

### 推荐使用

**`convert_clash_reference.js`**：主脚本，支持客户端/路由器分层配置。

### 兼容参考

**`convert_auto.js`**：来自 [powerfullz/override-rules](https://github.com/powerfullz/override-rules) 的外部脚本，保留作为参考。如需新功能（`profile` 分层、更全规则集），请使用 `convert_clash_reference.js`。

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
