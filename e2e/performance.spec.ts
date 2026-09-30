import { expect, test } from "@playwright/test";
import { reachReport } from "./report-flow";

/**
 * 性能验收（规格 15.3）。
 *
 * 自动化代理使用 CDP 4G 限速与 4× CPU 降速测量首页进入可操作状态的时间，
 * 并验证折叠、筛选与临时标记不依赖服务端往返。真实中端机型的冷启动
 * 由 performance-real-device-4g 人工记录把关。
 */

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

test("4G 限速与中端 CPU 下首页 3 秒内进入可操作状态", async ({ page, context }) => {
  // 先预热开发服务器模块转换，再在限速下测量浏览器侧首次进入可操作的时间。
  await page.goto("/");
  await expect(page.getByTestId("primary-entries")).toBeVisible();

  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const startedAt = Date.now();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("primary-entries")).toBeVisible({ timeout: 15_000 });
  const interactiveMs = Date.now() - startedAt;

  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  expect(interactiveMs, `首页在限速下 ${interactiveMs}ms 进入可操作`).toBeLessThan(3000);
});

test("折叠、筛选与临时标记不依赖服务端往返且即时响应", async ({ page }) => {
  await reachReport(page);

  // 报告生成后阻断所有 API 请求：本地工作台操作必须仍然可用。
  await page.route("**/api/**", (route) => route.abort());

  const startedAt = Date.now();
  await page.getByTestId("workbench-reviewed-ev-01").click();
  await expect(page.getByTestId("workbench-reviewed-ev-01")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("workbench-filter-mark-reviewed-evidence").click();
  await expect(page.getByTestId("workbench-count-evidence")).toHaveText("当前显示 1 项，共 4 项");
  await page.getByTestId("workbench-clear-evidence").click();
  await expect(page.getByTestId("workbench-item-ev-02")).toBeVisible();
  const elapsed = Date.now() - startedAt;

  expect(elapsed, `本地交互耗时 ${elapsed}ms`).toBeLessThan(1500);
});
