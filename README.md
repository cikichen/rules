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
- `compact=true`：默认精简重复策略组；`compact=false` 恢复完整分组，与 `full`、`profile` 独立。兼容转换脚本也支持此参数。


## 弱节点与故障切换

健康检查参数调整覆盖主脚本 `convert_clash_reference.js`、`clash_config_slim.yaml` 和 `shadowrocket_slim.conf`；独立 AI 分流覆写脚本和兼容参考脚本的健康检查参数保持各自实现。

- “节点选择”默认使用“自动选择”，也可手动选择“故障转移”，避免默认经手动组落到 DIRECT。
- Mihomo 故障转移直接测试候选节点，每 60 秒检查一次，超时 4000 毫秒；自动选择和负载均衡每 120 秒检查，闲置组按需检测，自动选择切换容差为 100 毫秒。普通与 AI 连通性测试保留 HTTPS Google 204；Telegram DC 使用独立目标和预期状态，见下方说明。
- 主脚本和精简配置的 AI 默认使用独立故障转移；负载均衡选项收在转换脚本的 `compact=false` 完整分组中。故障转移按候选顺序选择可用节点，不保证最低延迟，也可能在前序节点恢复后切回。长会话若需要固定出口，可手动指定已确认可用的节点。
- 修复主脚本地区负载均衡缺少健康检查、其他地区测速参数不一致、空国家分组和小写国家代码识别问题。保留精简配置已经删除地区负载均衡组的布局。
- Shadowrocket 同步默认 AI 故障转移、直接节点兜底和自动选择参数；其 timeout 单位为秒，不能照搬 Mihomo 的毫秒值。

更新文件后，需要在实际客户端重新加载配置。客户端若保存了上次选择，默认排序不会覆盖它，请将“节点选择”设为“故障转移”，将“人工智能”设为“AI-故障转移”（主脚本中名为“AI 故障转移”）。

204 测试只证明测速地址可达，不代表 AI 解锁、带宽或持续丢包质量；切换也不会迁移已有 TCP/SSE 连接。全部线路都差时仍需要更换节点或线路。以上间隔是配置基线，并非根据现场丢包测量得到的最优值。使用 proxy-providers 的客户端还需检查 provider 自身的 health-check；组级测速不能替代其检查。

参数语义参考 [Mihomo 策略组文档](https://wiki.metacubex.one/config/proxy-groups/)、[故障转移](https://wiki.metacubex.one/config/proxy-groups/fallback/) 和 [自动选择](https://wiki.metacubex.one/config/proxy-groups/url-test/)。

## 规则优先级

规则按从上到下首次命中生效。Clash 精简配置、主转换脚本、兼容转换脚本和 ACL4SSR 模板将微软等服务分流放在通用国内直连规则之前；Shadowrocket 原有顺序已符合这一要求，保持不变。

- 局域网、自定义白名单和广告拦截保留前置；指定的直连例外不变。
- AI 分流优先于微软总规则；转换脚本中 OneDrive 也优先于微软总规则。
- 通用 `Direct`、`China`、`MICROSOFT@CN` 分类位于适用配置的服务分流之后，避免 `microsoftonline.com` 同时属于国内与微软规则集时绕过“微软服务”。自定义 `DirectList` 不属于通用直连集，仍保持白名单优先级。
- 仅调整规则顺序，不改变规则内容、策略组默认选择或 DNS 设置。`npm test` 包含顺序和微软登录域重叠的回归测试。

使用更新后的配置需在实际客户端更新订阅或重新加载配置；如需微软登录走代理，请确认“微软服务”选择“节点选择”或可用代理，而不是 `DIRECT`。修改仓库文件不会自动更新本机正在运行的配置。

## 策略组展示顺序

Clash 精简配置、Shadowrocket、ACL4SSR 模板和两个转换脚本按“节点控制 → AI 服务 → 常用服务 → 媒体与游戏 → 地区与专线 → 直连与拦截 → 兜底”组织策略组；“漏网之鱼”始终放在策略组列表末尾。转换脚本的可选落地、低倍率和动态地区组保留在对应区域，未启用或没有节点时仍不生成。

三种顺序各自影响不同的行为：策略组声明顺序用于组织界面；组内 `proxies` 候选顺序影响初始选择，故障转移的节点顺序还影响切换优先级；`rules` 顺序决定实际分流的首次命中。展示顺序调整本身只移动策略组声明；下方精简模式会合并服务的出口控制。`policy.json` 的 `services` 是共享候选列表的适用名单，不决定界面排序；`sync:policy` 保留文件里的策略组声明顺序。

更新订阅或重新加载配置后检查展示效果。部分 Mihomo 面板按内置 `GLOBAL` 组的成员顺序展示，客户端自定义排序也可能覆盖配置顺序；若界面仍沿用旧排列，需检查客户端的排序设置及正在加载的配置。参见 [Mihomo 内置策略组文档](https://wiki.metacubex.one/config/proxy-groups/built-in/)。

## 精简分组

Clash 精简配置从 50 组降为 41 组，Shadowrocket 从 57 组降为 37 组。社交网站、Cloudflare 验证和原有 Telegram DC 地区组保留独立控制。两个转换脚本默认启用精简，数量随节点地区及可选功能变化；传入 `compact=false` 可恢复完整分组。`full=true` 仅决定是否包含运行时配置，不代表恢复完整分组。

- OpenAI、Claude、Gemini 共用“人工智能”；保留主脚本与精简配置的 AI 故障转移和地区限制。Claude 更新下载单独匹配“节点选择”，不跟随 AI 出口。
- 社交平台和 Cloudflare 验证保留原有独立分组；Linux.do、OneDrive 共用“节点选择”。OneDrive 的专用规则仍先于微软总规则，微软服务的直连默认值不变。
- Clash 原有 Telegram DC 分组保留，改为直接对实际节点执行目标测速：DC5 测亚洲前端，DC1/3 测美洲前端，DC2/4 测欧洲前端。各组自动选择到对应前端延迟较低的节点，不再固定使用狮城/美国/欧洲地区组的 Google 测速结果。DC 规则仍位于通用 Telegram 规则之前，其他流量使用“电报消息”。
- YouTube Music 并入油管，Spotify、PikPak、Disney+、Max 并入“国外媒体”，Epic 并入“游戏平台”。这些合并服务跟随目标组选择。
- 全球优选、两种全局负载均衡、AI 负载均衡与 Shadowrocket 的 AI 专线入口收起；自动选择、普通故障转移、手动切换、AI 故障转移保留。“应用净化”并入广告拦截，原净化规则仍生效。
- 奈飞及专用节点、国内媒体、PT、微软/苹果、阿里海外、自定义/中转规则和地区选择保留。“漏网之鱼”仍位于末尾。

精简保留规则内容、规则顺序、下载源与 DNS，只替换合并服务的规则目标、删除重复组并整理候选引用。普通健康检查参数保留，Telegram DC 的测速方式单独调整。合并的服务不再能通过原有组分别选出口，客户端保存的旧选择也不会自动迁移到目标组。更新后确认“人工智能”、微软和奈飞等保留组的选择。

`policy.json` 的 `groupMerges` 维护合并关系；`scripts/compact-policy.mjs` 同时用于静态配置同步和两个独立转换脚本的内嵌实现。修改后运行 `npm run sync:policy`。独立 `AI分流覆写.js` 面向已有机场订阅，仍提供其专用的四个 AI 入口。

## 测速地址

普通自动选择、故障转移、地区组和共享 AI 故障转移继续使用 `https://www.gstatic.com/generate_204`，预期状态为 204。这适合检查普通 HTTPS 连通性；共享 AI 组服务多个厂商，单测其中一个 API 不能证明其他厂商可用，因此没有把公共检测替换为单厂商的鉴权接口。

Clash 的三个 Telegram DC 组使用各自的 Telegram Web 传输前端：

| 组 | 测速地址 | Mihomo HEAD 预期状态 |
| --- | --- | --- |
| TG-亚洲 (DC5) | `https://flora.web.telegram.org/apiw1` | 501 |
| TG-美洲 (DC1/3) | `https://pluto.web.telegram.org/apiw1` | 501 |
| TG-欧洲 (DC2/4) | `https://venus.web.telegram.org/apiw1` | 501 |

Mihomo 使用 HEAD 请求测速，不跟随重定向。这些传输端点不实现 HEAD；2026-11-18 本机验证三个地址的 HTTPS HTTP/1.1 HEAD 均返回 501，GET 均返回 404。501 在这里表示收到了目标前端对该方法的响应，作为连通性和延迟判定的预期状态；它不代表完成了 Telegram 业务请求。不能照搬 Google 的 204，也不能拿 GET 的 404 配置 HEAD 检测。

三个 DC 组保留原名称与规则目标，类型改为 `url-test`，直接包含订阅实际节点并排除流量/过期等说明条目，不嵌套普通地区策略组。每 120 秒按需检测，超时 4000 毫秒，切换容差 100 毫秒。Mihomo 的 `empty-fallback` 只接受节点名、不接受策略组，且仅在组内没有任何候选节点时生效，因此三个 DC 组不设置该字段：订阅没有任何节点时按内核默认回退 `COMPATIBLE`（等价直连），候选节点测速全部失败时则继续尝试首个候选节点。节点选择基于到各 DC 的 HTTPS 前端延迟，不以节点名称所属地区为唯一依据。

这些结果不代表 MTProto 会话质量、文件下载带宽或长期丢包。DC1/3 和 DC2/4 各自共用一个地区前端，不能分别衡量该地区的每一个 DC。此变更针对原本带有 DC 规则的 Clash 精简配置；Shadowrocket 与两个转换脚本沿用各自现有的普通 Telegram 分流，不额外增加 DC 分组。更新后需重新加载配置；客户端手动测速若统一指定其他地址，会覆盖本次目标测速。

`policy.json` 的 `telegramHealth` 维护每个 DC 的目标和状态要求，`npm run sync:policy` 为其生成独立健康检查参数，避免 YAML 锚点复用或再次同步时变回 Google 204。参数语义参考 [Mihomo 策略组文档](https://wiki.metacubex.one/config/proxy-groups/)；HEAD 与重定向行为见 [Mihomo URLTest 实现](https://github.com/MetaCubeX/mihomo/blob/Meta/adapter/adapter.go)。

## 共享策略维护

`policy.json` 集中维护普通服务候选列表、适用服务名称、普通与 Telegram DC 健康检查参数和分组合并关系。修改后运行 `npm run sync:policy`，同步到 Clash 精简配置、Shadowrocket、ACL 模板和两个转换脚本。兼容脚本共享合并关系，仍沿用自己的候选列表及健康检查参数。`npm run check:policy` 只检查同步状态，`npm test` 会先执行此检查。

Clash 配置用 YAML 锚点复用相同的候选列表和健康检查，加载后仍是完整策略组；Shadowrocket 输出其原生的展开格式。主转换脚本内嵌生成的数据，可以继续直接粘贴到客户端使用，无需读取本地 JSON。`npm run gen` 仍输出主转换脚本的完整配置，不代替精简配置的同步命令。

普通服务统一列出现有的自动选择、故障转移、地区、手动选择和直连；转换脚本完整模式还包含两种负载均衡。保留组的原默认出口和奈飞等专用候选保留；Shadowrocket 的 `select` 索引随列表重排，维持保留组的原默认选择。阿里海外补齐候选，但继续默认直连。

AI、国内媒体、PT 等专用列表及故障转移的直接节点检查保持独立；Telegram DC 直接测试实际节点。地区识别表达式保留各客户端现有实现；不改变域名/IP 匹配内容。普通健康检查继续使用原有的 HTTPS Google 204 地址，间隔和超时不变。
