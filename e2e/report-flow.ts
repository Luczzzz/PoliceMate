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

async function answerRound(page: Page): Promise<void> {
  const before = await page.getByTestId("round-progress").innerText();
  const questions = page.locator('[data-testid="question-list"] .question-card');
  const count = await questions.count();
  for (let index = 0; index < count; index += 1) {
    const card = questions.nth(index);
    await card.getByTestId(/-answer-value$/).click();
    await card.locator("textarea").fill("已核实的情况说明。");
  }
  await expect(page.getByTestId("submit-round")).toBeEnabled();
  await page.getByTestId("submit-round").click();
  await Promise.race([
    page.getByTestId("pre-analysis-page").waitFor({ state: "visible", timeout: 30_000 }),
    page
      .locator('[data-testid="round-progress"]', { hasNotText: before })
      .waitFor({ state: "visible", timeout: 30_000 }),
  ]);
}

/** 走完主流程并停留在已生成报告的页面。 */
export async function reachReport(page: Page): Promise<void> {
  await page.goto("/analysis");
  await page.getByTestId("case-text-input").fill(REPORT_FLOW_TEXT);
  await page.getByTestId("case-input-submit").click();
  await page.waitForURL(/\/analysis\/facts$/);

  const timeCard = page.locator('[data-testid="fact-list"] [data-category="time"]').first();
  await timeCard.getByTestId(/fact-mark-.*-confirmed/).click();
  await expect(timeCard).toHaveAttribute("data-status", "confirmed");

  await page.getByTestId("start-questions").click();
  await expect(page.getByTestId("decisive-questions-page")).toBeVisible();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await page.getByTestId("pre-analysis-page").count()) > 0) break;
    await answerRound(page);
  }
  await expect(page.getByTestId("pre-analysis-page")).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("confirm-snapshot").click();
  await expect(page.getByTestId("snapshot-panel")).toBeVisible();
  await page.getByTestId("go-report").click();
  await page.waitForURL(/\/analysis\/report$/);
  await page.getByTestId("generate-report").click();
  await expect(page.getByTestId("analysis-report")).toBeVisible({ timeout: 20_000 });
}
