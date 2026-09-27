# PoliceMate（松警伴侣）

松警伴侣是面向公安一线民警的**程序辅助工具**，第一版为移动端 H5 **受控试行版**。
规范性产品行为见 [`docs/specs/songjing-h5-v1-product-spec.md`](docs/specs/songjing-h5-v1-product-spec.md)，
领域词汇见 [`CONTEXT.md`](CONTEXT.md)。

当前实现对应 `#27 建立松警伴侣可运行产品基线`：可运行的移动端外壳、PoliceMate 后端、
两个同级主入口的可用状态门控、使用与数据说明、通用失败状态，以及移动浏览器黑盒验收测试缝。

## 目录结构

```
apps/web            移动端 H5（Vite + React + TypeScript）
apps/server         PoliceMate 后端（Fastify + TypeScript）
packages/contracts  H5 与后端共享的版本化契约
e2e                 Playwright 移动浏览器黑盒验收测试
scripts             环境辅助脚本
```

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

- **Dify 集成适配层**：提供分析服务可用性；
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
| `PM_SERVICE_PROVIDER` | 未配置 | 使用与数据说明中的实际服务提供者 |
| `PM_SERVICE_CONTACT` | 未配置 | 试行反馈联系人 |
| `PM_DATA_PROCESSING_STATEMENT` | 未配置 | 适用的数据处理说明 |
| `PM_TECHNICAL_LOGGING_BOUNDARY` | 空 | 技术日志边界，多行文本 |

使用与数据说明中的服务提供者、联系人和数据处理说明未配置时，页面如实显示“尚未配置”，
不得使用虚构主体；受控试行前必须填写实际信息。
