import { expect, type Page } from "@playwright/test";

/**
 * 报告流程共享装置：从案情输入驱动到六模块报告。
 *
 * 只服务于 e2e 验收测试，不改变产品行为；与 report-workbench.spec.ts
 * 使用的步骤保持一致，避免各专项验收重复维护。
 */

export const REPORT_FLOW_TEXT = "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。";

export async function resetFixtureState(page: Page): Promise<void> {
  await page.request.post("/api/test/fixtures/reset");
}

/** 提交案情后直接停留在已生成报告的页面（不再经过确认与追问）。 */
export async function reachReport(page: Page): Promise<void> {
  await page.goto("/analysis");
  await page.getByTestId("case-text-input").fill(REPORT_FLOW_TEXT);
  await page.getByTestId("case-input-submit").click();
  await page.waitForURL(/\/analysis\/report$/);
  await expect(page.getByTestId("analysis-report")).toBeVisible({ timeout: 20_000 });
}
