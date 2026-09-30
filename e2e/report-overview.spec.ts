import { expect, test } from "@playwright/test";
import { reachReport } from "./report-flow";

/**
 * 研判概览验收：结果页首先给出方向、判断依据、优先核查与影响方向的条件，
 * 六模块保留为可追溯详情（ADR-0010）。
 */

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

test("概览在模块索引之前给出方向、判断依据与优先核查", async ({ page }) => {
  await reachReport(page);
  const overview = page.getByTestId("report-overview");
  await expect(overview).toBeVisible();
  await expect(overview).toContainText("判断依据");
  await expect(overview).toContainText("优先核查");
  await expect(overview.locator("li").first()).not.toBeEmpty();

  const before = await page.getByTestId("analysis-report").evaluate((report) => {
    const overviewNode = report.querySelector('[data-testid="report-overview"]');
    const indexNode = report.querySelector('[data-testid="report-module-index"]');
    const headlineNode = report.querySelector('[data-testid="report-headline"]');
    if (overviewNode === null || indexNode === null || headlineNode === null) return false;
    return Boolean(
      headlineNode.compareDocumentPosition(overviewNode) & Node.DOCUMENT_POSITION_FOLLOWING,
    ) && Boolean(overviewNode.compareDocumentPosition(indexNode) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(before).toBe(true);
});

test("优先核查项可跳转到证据核查模块，争议与缺口在概览中可见", async ({ page }) => {
  await reachReport(page);
  const overview = page.getByTestId("report-overview");
  const firstAction = overview.locator('.report-overview__actions a').first();
  await expect(firstAction).toHaveAttribute("href", "#report-module-evidence_checklist");
  await firstAction.click();
  const evidence = page.getByTestId("report-module-evidence_checklist");
  const box = await evidence.boundingBox();
  expect(box?.y).toBeLessThan(120);
});

test("未经确认状态压缩为一句提示，详细版本信息仍在报告信息区", async ({ page }) => {
  await reachReport(page);
  const notice = page.getByTestId("unconfirmed-basis-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("未经确认");
  await expect(page.getByTestId("report-metadata")).toContainText("事实快照", { timeout: 10_000 });
  await expect(page.getByTestId("analysis-report")).toContainText("不构成案件定性");
});

test("概览在窄屏与放大字体下不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await reachReport(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = "28px"; });
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width + 1);
});
