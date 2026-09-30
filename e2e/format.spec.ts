import { expect, test } from "@playwright/test";
import { reachReport } from "./report-flow";

/**
 * 语言、时间、金额与地域格式验收（规格 3.5、AC-34）。
 *
 * 时间按北京时间展示且明确时区；金额保留原始值与规范化范围并以人民币元展示；
 * 法源地域显示实际适用范围（国家 / 浙江），不使用模糊的“本地规定”。
 */

const VAGUE_TEXT = "年初，王某偷走室友现金一千多元。王某三十多岁。";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

test("报告时间按北京时间展示、金额使用人民币元且法源标注实际地域", async ({ page }) => {
  // 报告生成时间：北京时间且明确时区。
  await reachReport(page);
  const generatedAt = await page.locator('dt:text-is("生成时间") + dd').innerText();
  expect(generatedAt).toContain("北京时间");

  // 金额：报告的事实限制保留规范化后的金额与人民币元单位。
  await page.goto("/analysis");
  await page.getByTestId("case-text-input").fill(VAGUE_TEXT);
  await page.getByTestId("case-input-submit").click();
  await page.waitForURL(/\/analysis\/report$/);
  const report = page.getByTestId("analysis-report");
  await expect(report).toBeVisible({ timeout: 20_000 });
  await expect(report).toContainText("1000");
  await expect(report).toContainText("元");

  // 法源地域：使用实际适用范围标签，而非“本地规定”。
  await page.goto("/documents");
  await expect(page.getByTestId("documents-index")).toBeVisible();
  await page.locator('[data-testid^="example-card-"]').first().click();
  await expect(page.getByTestId("example-detail")).toBeVisible();
  const sources = page.getByTestId("legal-sources");
  await expect(sources).toContainText("适用地域");
  await expect(sources).not.toContainText("本地规定");
  const regionText = await sources.innerText();
  expect(/国家|浙江/.test(regionText)).toBe(true);
});
