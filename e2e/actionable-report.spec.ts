import { expect, test } from "@playwright/test";

const TEXT = "今天下午12:40张某报警称自己在江滨酒店被叶某打了叶某喝酒了。";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

for (const viewport of [{ width: 360, height: 800 }, { width: 1440, height: 1000 }]) {
  test(`酒店殴打报案在 ${viewport.width}px 展示具体六模块分析`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/analysis");
    await page.getByTestId("case-text-input").fill(TEXT);
    await page.getByTestId("case-input-submit").click();
    await page.waitForURL(/\/analysis\/report$/);
    await expect(page.getByTestId("report-headline")).toContainText("涉嫌殴打他人");
    await expect(page.getByTestId("report-module-filing_conditions")).toContainText("建议及时受理");
    await expect(page.getByTestId("report-module-preliminary_qualification")).toContainText("不等于无伤情");
    await expect(page.getByTestId("workbench-item-ev-01")).toContainText("江滨酒店");
    await expect(page.getByTestId("workbench-item-ev-01")).toContainText("12:40");
    const interview = page.getByTestId("report-module-interview_points");
    await expect(interview.locator(".interview-role-group")).toHaveCount(3);
    await expect(page.getByTestId("workbench-item-iv-06")).toContainText("饮酒");
    await expect(page.getByTestId("report-module-enforcement_risks")).toContainText("饮酒不等于醉酒失控");
    const law = page.getByTestId("report-module-legal_basis_trace");
    await expect(law).toContainText("第五十一条");
    await expect(law).toContainText("第九十七条");
    await expect(law).toContainText("五百元以上一千元以下");
    await page.screenshot({ path: testInfo.outputPath("report-top.png") });
    await page.getByTestId("report-index-interview_points").click();
    await page.screenshot({ path: testInfo.outputPath("interview.png") });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  });
}
