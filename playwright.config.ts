import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const configDir = fileURLToPath(new URL(".", import.meta.url));

// 无 root 环境下由 scripts/install-browser-deps.sh 解包的系统库；
// 存在时让 Chromium 进程可见（浏览器进程默认继承 process.env）。
const browserDepsLib = resolve(configDir, ".browser-deps/root/usr/lib/x86_64-linux-gnu");
if (existsSync(browserDepsLib)) {
  process.env.LD_LIBRARY_PATH = [browserDepsLib, process.env.LD_LIBRARY_PATH]
    .filter((entry): entry is string => typeof entry === "string" && entry !== "")
    .join(":");
}

const webPort = Number(process.env.PM_WEB_PORT ?? "5173");
const baseURL = `http://127.0.0.1:${webPort}`;

/**
 * 移动浏览器黑盒验收测试。
 *
 * H5 与 PoliceMate 后端在开发模式下一起启动，浏览器只访问 Vite 源站，
 * `/api` 由开发服务器代理到 PoliceMate 后端。外部 Dify 与受治理内容边界
 * 由进程内的确定性替身替换，测试通过 `/api/test/fixtures` 控制替身状态。
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "PM_ENABLE_TEST_CONTROLS=1 npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
