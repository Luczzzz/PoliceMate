# 设备、浏览器、可访问性与性能验收记录

记录源数据在
[`apps/server/src/acceptance/evidence.ts`](../../apps/server/src/acceptance/evidence.ts)。
`blocksRelease` 为 true 且 `result !== "pass"` 的记录会阻断
`npm run release:acceptance`（产品规格 15、18.1）。

填写人工记录时：

- 只记录角色（例如“受控试行验收负责人”），不要写入真实姓名或联系方式；
- `performedAt` 使用 `YYYY-MM-DD`；
- `result` 使用 `pass` / `fail`；`fail` 时同步在问题跟踪中登记；
- `environment` 写明设备型号、系统版本、浏览器版本与网络环境；
- `notes` 只写与验收有关的环境与步骤，不记录任何案情或个人信息。

## 当前记录

| ID | 类别 | 方式 | 环境 | 结果 | 阻断 |
| --- | --- | --- | --- | --- | --- |
| `browser-android-chrome` | 浏览器 | 自动化代理 | Chromium 移动仿真（Pixel 7） | pass | 是 |
| `browser-wechat-embedded` | 浏览器 | 自动化代理 | Chromium + 微信 UA | pass | 是 |
| `browser-ios-safari` | 浏览器 | 真实设备 | iPhone + iOS Safari（当前及前一个主要版本） | not_run | 是 |
| `a11y-device-assistive-tech` | 可访问性 | 真实设备 | VoiceOver / TalkBack + 系统字体最大档 | not_run | 是 |
| `performance-real-device-4g` | 性能 | 真实设备 | 中端测试手机 + 普通 4G | not_run | 是 |

## 真实设备执行步骤

1. **iOS Safari**：用真实 iPhone 打开不公开试行网址，依次完成
   首页双入口 → 文书范例详情 → 案情输入并形成候选事实，确认竖屏无横向滚动；
   分别在当前与前一主要版本 iOS 上执行，回填 `browser-ios-safari`。
2. **屏幕阅读器**：开启 VoiceOver / TalkBack，把系统字体调到最大档，
   确认总体状态 → 主判断 → 固定六模块索引的读取顺序，表单标签、错误说明与
   焦点状态可读，关键内容不被截断；回填 `a11y-device-assistive-tech`。
3. **性能**：在约定中端测试手机上使用普通 4G（关闭 WiFi），记录首页进入
   可操作状态的时间（要求 ≤ 3 秒），以及折叠、筛选与临时标记的即时响应；
   回填 `performance-real-device-4g`。

## 自动化代理对应的用例

| 记录 | 用例 |
| --- | --- |
| `browser-android-chrome` / `browser-wechat-embedded` | [`e2e/cross-browser.spec.ts`](../../e2e/cross-browser.spec.ts) |
| `a11y-device-assistive-tech` | [`e2e/accessibility.spec.ts`](../../e2e/accessibility.spec.ts) |
| `performance-real-device-4g` | [`e2e/performance.spec.ts`](../../e2e/performance.spec.ts) |
