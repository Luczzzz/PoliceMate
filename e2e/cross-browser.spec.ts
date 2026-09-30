import { expect, test } from "@playwright/test";

/**
 * 目标移动浏览器核心流程验收（规格 15.1）。
 *
 * 同一份用例在多个 Playwright project 下运行：
 * - `mobile-chrome`：Android Chrome 代理；
 * - `wechat`：Chromium + 微信内置浏览器 User-Agent 代理；
 * - `mobile-safari`：WebKit 代理 iOS Safari（需 `PM_ENABLE_WEBKIT_E2E=1`）。
 *
 * 真实 iPhone、Android 与微信真机记录见 `manual-evidence`，未完成前发布检查阻断。
 */

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

test("核心流程在目标移动浏览器引擎下可用", async ({ page }) => {
  // 首页：两个同级主入口都可用且可点击。
  await page.goto("/");
  await expect(page.getByTestId("primary-entries")).toBeVisible();
  await expect(page.getByTestId("entry-action-caseAnalysis")).toBeVisible();
  await expect(page.getByTestId("entry-action-documentExamples")).toBeVisible();

  // 文书范例：可进入分类浏览并打开详情。
  await page.getByTestId("entry-action-documentExamples").click();
  await page.waitForURL(/\/documents$/);
  await expect(page.getByTestId("documents-index")).toBeVisible();
  await page.locator('[data-testid^="example-card-"]').first().click();
  await expect(page.getByTestId("example-detail")).toBeVisible();
  await expect(page.getByTestId("legal-sources")).toBeVisible();

  // 案情分析：可进入输入页并直接得到分析报告。
  await page.goto("/");
  await page.getByTestId("entry-action-caseAnalysis").click();
  await page.waitForURL(/\/analysis$/);
  await page.getByTestId("case-text-input").fill("3月2日晚上，张某在城南市场门口殴打李某。");
  await page.getByTestId("case-input-submit").click();
  await page.waitForURL(/\/analysis\/report$/);
  await expect(page.getByTestId("analysis-report")).toBeVisible({ timeout: 20_000 });

  // 竖屏无横向滚动。
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});
