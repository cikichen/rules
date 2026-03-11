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
