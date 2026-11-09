# 下载地址校验记录（2026-11-09）

配置及脚本中的 310 个下载 URL 已全部通过完整 GET 和内容格式检查。81 个使用新 GitHub 镜像的 URL，下载内容与本次取得的 GitHub 原始文件 SHA-256 全部一致。

## ASN 默认下载遗漏的补充修复

用户随后报告 `IP-ASN,44907,TG-亚洲 (DC5),no-resolve` 触发默认 GitHub Release 的 ASN 数据库下载超时。此前清单覆盖的是显式 URL，未覆盖内核的隐式默认下载，原先的通过结果不能证明这些默认下载也可用。

精简配置现已在顶层显式加入完整 `geox-url`，沿用主脚本的四个 jsDelivr 数据源。`IP-ASN` 仍需 ASN 数据库，`no-resolve` 仅限制规则触发域名解析，不能免除数据库依赖。四个数据源已再次完整下载并检查，ASN 和 Country 文件通过 MaxMind 元数据检查，Geo DAT 通过 protobuf 顶层长度完整性检查。

新增的离线回归检查会根据精简配置实际使用的 `IP-ASN`、`GEOIP` 和 `GEOSITE` 规则，要求对应 Geo 数据库有显式 HTTPS 镜像地址，避免再次依赖 GitHub 默认直连。当前 `npm test` 为 **24/24 通过**。客户端需重新加载包含顶层 `geox-url` 的整个配置；实际客户端加载结果尚待确认。

## 范围与方法

- 检查主脚本 `convert_clash_reference.js`、兼容脚本 `convert_auto.js`、两个独立覆写脚本、Clash 精简配置、Shadowrocket 配置和 ACL4SSR INI。
- 合并源文件中的完整 URL 与脚本运行生成的 URL，覆盖字符串拼接得到的规则集；按完整 URL 去重。同一文件的不同 CDN、分支路径分别检查。
- 共取得 315 个 URL 候选，其中 310 个是下载地址；另 5 个是 204 测速、两个 DoH 端点、Google 重写目标和兼容脚本注释中的来源仓库主页。DoH 使用 DNS 查询参数单独验证，不能以空请求的 400/502 判为下载故障。
- 使用本机当前网络，curl 未显式指定代理，校验证书并跟随重定向，下载完整响应；记录 HTTP 状态、耗时、大小、内容类型、最终地址和 SHA-256。未在其他运营商、路由器或实际客户端验证，也不据此保证长期可用或提速。
- 源脚本中传给 `wrapRaw` 的原始地址也在检查范围内，实际生成结果使用镜像前缀；没有将原始地址重复拼接前缀。

## 发现与修复

| 问题 | 实测结果 | 处理 |
| --- | --- | --- |
| `github.ithome.me` | 25 个不同下载 URL 返回 HTTP 200，但响应为 HTML 网页 | 主脚本包装函数及兼容脚本改为 `gh-proxy.org` |
| ACL4SSR 的 `人工智能/人工智能.list` | HTTP 404 | 改为同一上游有效的 `OpenAI/OpenAI.list`；已有 Claude、BardAI 和 OtherAI 条目保留 |
| GitHub 直连下载 | 当前网络可用，但缺少所需的加速入口 | Shadowrocket 规则、精简配置中的 GitHub MRS、脚本图标及防 DNS 泄露规则等加上镜像前缀 |
| CDN 瞬时连接失败 | 初次检查 1 个 SVG 超时；最终全量复验另有 3 个 CDN URL 出现 TLS 连接错误 | 重试均成功，保留地址；最终复验的重试 URL 记录在 JSON 中 |

现有可用的 jsDelivr、cdnjs 和 `fastgh.lainbo.com` 下载入口保留。分流组、健康检查参数、规则顺序和格式声明未改动；仅修复失效的 AI 规则下载条目。

## 镜像比较

每个候选完整下载相同的 5 个样本：OpenAI YAML、自定义直连规则、11.44 MB 的 geosite.dat、PNG 图标和 MetaCubeXD 分支 ZIP。ZIP 另外通过归档完整性检查。耗时仅反映这一轮请求，不能视为稳定带宽排名。

| 镜像 | 成功数 | OpenAI YAML | geosite.dat | ZIP |
| --- | --- | --- | --- | --- |
| `gh-proxy.org` | 5/5 | 1.08 秒 | 3.24 秒 | 1.06 秒 |
| `gh-proxy.com` | 5/5 | 1.71 秒 | 3.89 秒 | 2.09 秒 |
| `ghfast.top` | 5/5 | 2.90 秒 | 4.41 秒 | 3.60 秒 |
| `ghproxy.net` | 4/5 | 5.55 秒 | 25 秒超时，文件不完整 | 14.24 秒 |

采用 `gh-proxy.org`。其[服务使用说明](https://gh-proxy.com/docs/github-accelerator)采用相同的 URL 前缀形式；本次选择以实际下载和内容校验为依据。

## 最终验证

| 内容 | URL 数 | 校验 |
| --- | --- | --- |
| YAML 规则 | 51 | 解析成功，包含非空的字符串数组 `payload` |
| 文本规则 | 96 | 非空 UTF-8 文本，排除 HTML 错误页 |
| MRS | 32 | Zstandard 完整解压成功，解压内容有 MRS v1 文件头 |
| PNG | 83 | PNG 文件头及结束标记 |
| SVG | 44 | XML 解析成功，根节点为 SVG |
| Geo DAT | 2 | 顶层 protobuf 记录及长度完整 |
| MMDB | 2 | MaxMind 数据库元数据标记 |
| **合计** | **310** | **全部通过** |

另外，Google 测速端点返回预期的 204；两个 DoH 端点使用有效 DNS 查询均返回 200 和 `application/dns-message`。这些检查分别验证 HTTP 协议响应，不等同于下载内容检查或设备 DNS 验收。

`npm test` 的共享策略同步检查及 23 项现有测试全部通过，`npm run gen` 成功生成完整配置，精简配置 YAML 解析通过，`git diff --check` 无错误。

逐 URL 的来源位置、HTTP 结果、耗时、字节数和 SHA-256，以及修复前故障、候选镜像实测和重试信息，见[校验证据 JSON](download-audit-2026-11-09.json)。在线内容、耗时和可用性均为本次测量结果；未将网络检查加入离线测试。
