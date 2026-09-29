# PoliceMate（松警伴侣）

松警伴侣是面向公安一线民警的**程序辅助工具**，第一版为移动端 H5 **受控试行版**。
规范性产品行为见 [`docs/specs/songjing-h5-v1-product-spec.md`](docs/specs/songjing-h5-v1-product-spec.md)，
领域词汇见 [`CONTEXT.md`](CONTEXT.md)。

当前实现对应 `#27 建立松警伴侣可运行产品基线`、`#28 交付受治理的文书范例功能`
和 `#29 从自由案情形成分析前事实快照`：可运行的移动端外壳、PoliceMate 后端、
两个同级主入口的可用状态门控、使用与数据说明、通用失败状态、受治理文书范例，
以及从脱敏案情输入到候选事实确认、决定性追问和分析前确认的完整流程
（形成不可变事实快照；报告生成见 `#30`）。

## 目录结构

```
apps/web            移动端 H5（Vite + React + TypeScript）
apps/server         PoliceMate 后端（Fastify + TypeScript）
packages/contracts  H5 与后端共享的版本化契约
e2e                 Playwright 移动浏览器黑盒验收测试
docs/acceptance     受控试行验收矩阵、演练与发布检查结果
scripts             环境辅助脚本
```

## 案情分析流程（#29）

1. **案情输入**（`/analysis`）：常驻脱敏与 Dify 处理提示，只接受纯文本，
   显示字符计数；超过 10,000 字符或包含不支持内容时明确拒绝，不截断。
2. **候选事实确认**（`/analysis/facts`）：系统不默认确认任何事实；逐项标记
   确认/否认/未知/争议，可新增遗漏事实；删除只表示不纳入本次分析；
   检测到彼此独立的事项时提示拆分分析。
3. **决定性追问**（`/analysis/questions`）：按锁定优先级集中展示，每题说明
   为什么需要确认，允许“不知道、尚未核实、存在争议”；上限为三轮、
   每轮五问、总计十二问，达上限仍有缺口时保留不足状态。
4. **分析前确认**（`/analysis/review`）：分状态展示事实摘要、剩余缺口与
   预期限制；已确认的紧急风险事实触发报告前核验提示；用户主动确认后
   形成不可变事实快照（版本 + 哈希），此后所有修改被拒绝。

会话只存在于当前标签页内存与后端短暂运行内存（30 分钟空闲过期），
不写入数据库、日志或 URL。决策细节见
[`docs/adr/0003-pre-analysis-fact-snapshot.md`](docs/adr/0003-pre-analysis-fact-snapshot.md)。

## 环境要求

- Node.js 24+
- npm 11+

## 安装

```bash
npm install
```

## 开发环境一同启动

```bash
npm run dev
```

- H5 开发服务器：<http://127.0.0.1:5173>
- PoliceMate 后端：<http://127.0.0.1:8787>
- H5 只与 PoliceMate 后端同源通信；开发服务器把 `/api` 代理到后端，Dify 凭据不进入客户端。

## 生产式本地运行

```bash
npm run build   # 构建 H5 到 apps/web/dist
npm run start   # 后端同时提供 API 与构建后的 H5（SPA 回退）
```

## 测试

```bash
npm run typecheck   # 三个工作区 + e2e
npm test            # 后端单元测试（Vitest）
npm run test:e2e    # Playwright 移动浏览器黑盒验收测试
npm run verify      # typecheck + 单元测试 + 构建 + 黑盒测试
```

### 受控试行验收与发布门槛

```bash
npm run release:acceptance            # 完整发布检查（含真实设备人工记录门槛）
npm run release:acceptance -- --auto-only   # 只跑可自动化门槛
npm run release:check                 # 仅内容与文书范例覆盖门槛
```

发布检查把内容门槛、AC-01 至 AC-34 验收矩阵覆盖、紧急停止与内容批次演练、
设备/浏览器/可访问性/性能记录，以及内容维护者与产品负责人的角色记录组合为
一次可复现结果；任一硬门槛失败时以非零退出码阻断。详见
[`docs/acceptance/controlled-trial-acceptance.md`](docs/acceptance/controlled-trial-acceptance.md)。

真实 iPhone、真实屏幕阅读器与中端机型 + 普通 4G 的记录需要人工完成，
完成前发布检查阻断；填写方式见
[`docs/acceptance/manual-evidence.md`](docs/acceptance/manual-evidence.md)。

### 跨浏览器与可访问性/性能验收

`npm run test:e2e` 默认在 Android Chrome 代理与微信内置浏览器代理（Chromium +
微信 UA）下运行核心流程；配置了可运行 WebKit 的环境后可执行：

```bash
PM_ENABLE_WEBKIT_E2E=1 npm run test:e2e -- --project=mobile-safari
```

### 浏览器准备

```bash
npx playwright install chromium
sudo npx playwright install-deps chromium   # 有 root 时安装系统库
```

没有 root、无法使用 `playwright install-deps` 时：

```bash
bash scripts/install-browser-deps.sh
```

该脚本把所需系统库解包到 `.browser-deps/`（已加入 `.gitignore`），
`playwright.config.ts` 会在该目录存在时自动设置 `LD_LIBRARY_PATH`。

## 测试缝：移动浏览器 → PoliceMate 后端

第一版只有一条产品级测试缝：浏览器驱动 H5，H5 只访问 PoliceMate 后端。
仅在两个外部边界使用确定性替身：

- **Dify 集成适配层**：提供分析服务可用性、案情提取与追问选题；
- **受治理内容源**：提供当前激活的内容发布批次摘要。

替身状态由 `/api/test/fixtures` 控制，仅在 `PM_ENABLE_TEST_CONTROLS=1` 时挂载。
黑盒测试通过该接口切换可用状态，其余状态机、隐私与失败处理保持在同一个可观测缝内。

## 关键环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PM_WEB_PORT` | `5173` | H5 开发服务器端口 |
| `PM_SERVER_PORT` | `8787` | PoliceMate 后端端口 |
| `PM_HOST` | `127.0.0.1` | 后端监听地址 |
| `PM_MASTER_SWITCH` | `on` | 后端总开关；关闭时两个入口均不可用 |
| `PM_ANALYSIS_ENABLED` | `on` | 案情分析功能开关 |
| `PM_DOCUMENTS_ENABLED` | `on` | 文书范例功能开关 |
| `PM_ENABLE_TEST_CONTROLS` | `off` | 是否挂载替身控制接口（仅测试使用） |
| `PM_WEB_DIST` | `apps/web/dist` | 后端提供的 H5 构建产物目录；不存在时后端仅提供 API |
| `PM_SERVICE_PROVIDER` | 未配置 | 使用与数据说明中的实际服务提供者 |
| `PM_SERVICE_CONTACT` | 未配置 | 试行反馈联系人 |
| `PM_DATA_PROCESSING_STATEMENT` | 未配置 | 适用的数据处理说明 |
| `PM_TECHNICAL_LOGGING_BOUNDARY` | 空 | 技术日志边界，多行文本 |

使用与数据说明中的服务提供者、联系人和数据处理说明未配置时，页面如实显示“尚未配置”，
不得使用虚构主体；受控试行前必须填写实际信息。可参考
[`.env.trial.example`](.env.trial.example) 填写，未填写时 `npm run release:acceptance` 阻断发布。
