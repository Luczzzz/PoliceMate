# 受控试行验收与发布门槛

本文件记录 `#37 完成松警伴侣受控试行验收与发布门槛` 的验收方式、硬门槛、
可复现结果与剩余人工行动。规范性要求见
[`docs/specs/songjing-h5-v1-product-spec.md`](../specs/songjing-h5-v1-product-spec.md)
第 17 节（场景化验收矩阵）与第 18 节（开始与停止门槛）。

## 1. 可复现的发布检查

```bash
# 完整模式：含真实设备、浏览器与性能人工记录门槛（默认）
npm run release:acceptance

# 仅自动化门槛：跳过真实设备人工记录（用于本地/CI 自检）
npm run release:acceptance -- --auto-only

# 固定生成时间，得到逐字节可复现的结果文件
PM_ACCEPTANCE_GENERATED_AT=2026-09-29T00:00:00.000Z npm run release:acceptance
```

脚本组合以下硬门槛，任一失败即以非零退出码阻断，并写入
[`docs/acceptance/trial-release-result.json`](trial-release-result.json)
（只包含门槛名称与失败原因，不含任何案情、事实或报告内容）：

| 门槛 | 内容 | 规格 |
| --- | --- | --- |
| `gate-release-readiness` | 十组重点案情、至少 6 个文书范例、必需办理阶段与高风险环节、服务信息与传输安全 | 3.4、16、18.1 |
| `gate-acceptance-coverage` | AC-01 至 AC-34 全部存在、证据引用可追踪、无场景被静默删除 | 17 |
| `gate-drills` | 紧急停止、内容批次与隐私 canary 演练全部通过 | 12.4、13.6、13.7、18.2 |
| `gate-manual-evidence` | 设备、浏览器、可访问性与性能阻断型记录全部通过 | 15、18.1 |
| `gate-trial-decisions` | 内容批次确认与试行发布决定分别记录，且不作正式审定表述 | 13.1、18.1 |

## 2. 验收矩阵（AC-01 至 AC-34）

矩阵作为版本化数据保存在
[`apps/server/src/acceptance/scenarios.ts`](../../apps/server/src/acceptance/scenarios.ts)，
逐项绑定自动化测试、人工/设备记录或演练。`coverage.ts` 会机械校验：

- AC-01 至 AC-34 全部存在且不重复，没有多余编号；
- 每个场景至少有一类证据；
- 每条自动化测试引用都能在对应测试文件中字面找到；
- 每条人工记录与演练都被矩阵引用，没有无法解释的“僵尸门槛”；
- 每个场景追溯到的规格章节在产品规格正文中真实存在。

对应测试：[`acceptance-matrix.test.ts`](../../apps/server/test/acceptance-matrix.test.ts)。

## 3. 紧急停止与内容批次演练（15 项）

[`apps/server/src/acceptance/drills.ts`](../../apps/server/src/acceptance/drills.ts)
以确定性替身边界执行：

| 演练 | 验证行为 |
| --- | --- |
| `drill-master-switch` | 后端总开关关闭时两个入口同时不可用且正文检索失败关闭 |
| `drill-analysis-entry-disabled` | 案情分析入口停用时文书范例仍可用 |
| `drill-documents-entry-disabled` | 文书范例入口停用时正文检索失败关闭而案情分析不受影响 |
| `drill-legal-source-repealed` / `drill-legal-source-uncertain` | 法源失效或效力不明时依赖内容立即退出生产 |
| `drill-single-example-withdrawn` | 单项下架只影响指定范例，旧链接返回不可用 |
| `drill-single-case-focus-disabled` | 单项禁用重点案情后命中仍成立但停止限定法源 |
| `drill-content-expiry` / `drill-source-expiry` | 内容或法源到期后退出生产，恢复核验期限后重新可用 |
| `drill-no-eligible-examples` | 没有合格范例时入口提前显示暂不可用 |
| `drill-fail-closed-status` | 无法确认可用状态时失败关闭，未知与失效标识严格区分 |
| `drill-release-activation-atomic` | 批次部分校验失败时整批拒绝并保持上一完整批次 |
| `drill-release-rollback` | 整体回滚切回上一完整批次，未知批次返回空 |
| `drill-release-rebuild-from-assets` | 可从版本化结构化资产重建当前批次，损坏资产被拒绝 |
| `drill-privacy-canary` | 合成 canary 不进入遥测、元数据接口或缓存 |

对应测试：[`acceptance-drills.test.ts`](../../apps/server/test/acceptance-drills.test.ts)。
“从版本化资产重建”能力由
[`apps/server/src/content/assets.ts`](../../apps/server/src/content/assets.ts) 提供。

## 4. 设备、浏览器、可访问性与性能记录

记录作为版本化数据保存在
[`apps/server/src/acceptance/evidence.ts`](../../apps/server/src/acceptance/evidence.ts)，
并在 [`manual-evidence.md`](manual-evidence.md) 中列出填写方式。

| 记录 | 方式 | 环境 | 当前结果 |
| --- | --- | --- | --- |
| `browser-android-chrome` | 自动化代理 | Chromium 移动仿真（Pixel 7） | 通过 |
| `browser-wechat-embedded` | 自动化代理 | Chromium + 微信内置浏览器 UA | 通过 |
| `browser-ios-safari` | 真实设备 | 真实 iPhone + iOS Safari（当前及前一个主要版本） | 未完成（阻断） |
| `a11y-device-assistive-tech` | 真实设备 | VoiceOver / TalkBack + 系统字体最大档 | 未完成（阻断） |
| `performance-real-device-4g` | 真实设备 | 约定中端测试手机 + 普通 4G | 未完成（阻断） |

自动化代理覆盖：系统字体放大、屏幕阅读器读取顺序、键盘焦点顺序、对比度、
非颜色状态、约 44×44 触控目标、减少动态效果（15.2）；4G + 中端 CPU 下首页
3 秒内可操作与本地交互即时响应（15.3）。用例见
[`e2e/accessibility.spec.ts`](../../e2e/accessibility.spec.ts)、
[`e2e/performance.spec.ts`](../../e2e/performance.spec.ts) 与
[`e2e/cross-browser.spec.ts`](../../e2e/cross-browser.spec.ts)。

iOS Safari 的 WebKit 引擎需要额外系统库，本仓库运行环境无法安装；配置了
可运行 WebKit 的环境后可执行：

```bash
PM_ENABLE_WEBKIT_E2E=1 npm run test:e2e -- --project=mobile-safari
```

## 5. 两类角色记录

见 [`trial-release-decisions.md`](trial-release-decisions.md)。两类记录分别由
内容维护者与产品负责人角色记录，并固定声明“不代表法制审核、正式内容审定或
机关授权”；`decisions.ts` 会拒绝任何暗示已正式审定或机关授权的表述。

## 6. 当前可复现结果与剩余人工行动

以默认配置执行 `npm run release:acceptance` 的结果见
[`trial-release-result.json`](trial-release-result.json)：自动化门槛
（验收矩阵覆盖、演练、角色记录）全部通过，以下人工/运维输入尚未提供，
因此发布检查明确阻断：

1. **使用与数据说明的实际信息**：按 [`.env.trial.example`](../../.env.trial.example)
   提供 `PM_SERVICE_PROVIDER`、`PM_SERVICE_CONTACT`、
   `PM_DATA_PROCESSING_STATEMENT`、`PM_TECHNICAL_LOGGING_BOUNDARY`。
   仓库与界面不保留任何虚构主体；未配置时页面如实显示“尚未配置”。
2. **iOS Safari 真机记录**：在真实 iPhone 上执行核心流程并回填
   `browser-ios-safari` 的结果、设备型号与系统版本。
3. **真实屏幕阅读器记录**：在真实设备上执行并回填 `a11y-device-assistive-tech`。
4. **中端机型 + 4G 记录**：在约定测试手机上记录首次可操作时间并回填
   `performance-real-device-4g`。

完成上述四项后重新运行 `npm run release:acceptance`；全部硬门槛通过时
`ok` 为 true、退出码为 0，并生成可复现的试行发布检查结果。

## 7. 立即停止试行的条件

产品规格 18.2 的停止条件对应以下演练与检查，均已在 CI 中执行：
严重误导结论（报告跨模块矛盾失败关闭）、法源门控失效（法源状态/到期/禁用演练）、
禁止内容持久化或泄露（隐私 canary）、无法禁用（总开关与单项禁用演练）、
关键语义矛盾（报告校验失败关闭）、安全绕过（来源限制、令牌、限流测试）、
维护责任缺失与内容到期（到期自动退出与决策记录边界）。
