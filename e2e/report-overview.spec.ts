import { expect, test } from "@playwright/test";
import { reachReport } from "./report-flow";

/**
 * 研判速览验收（ADR-0011）：首屏给出一句话、立即动作与走向分支，
 * 六模块默认折叠为可追溯详情。
 */

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

test("研判速览在模块索引之前：一句话、立即动作、走向分支", async ({ page }) => {
  await reachReport(page);
  const brief = page.getByTestId("quick-brief");
  await expect(brief).toBeVisible();
  await expect(page.getByTestId("quick-brief-bottom-line")).toContainText("涉嫌殴打他人");
  const steps = page.getByTestId("quick-brief-steps").locator("li");
  expect(await steps.count()).toBeGreaterThanOrEqual(3);
  expect(await steps.count()).toBeLessThanOrEqual(5);
  await expect(page.getByTestId("quick-brief-branches")).toContainText("如果");
  expect(await page.getByTestId("quick-brief-branches").locator("li").count()).toBeLessThanOrEqual(3);

  const ordered = await page.getByTestId("analysis-report").evaluate((report) => {
    const node = (id: string) => report.querySelector(`[data-testid="${id}"]`);
    const headline = node("report-headline"), quick = node("quick-brief"), index = node("report-module-index");
    if (!headline || !quick || !index) return false;
    return Boolean(headline.compareDocumentPosition(quick) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      Boolean(quick.compareDocumentPosition(index) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(ordered).toBe(true);
});

test("默认只展开核心证据核查，其余模块折叠为一行摘要，点击可展开", async ({ page }) => {
  await reachReport(page);
  await expect(page.getByTestId("report-fold-evidence_checklist")).toHaveAttribute("open", "");
  for (const id of ["preliminary_qualification", "filing_conditions", "interview_points", "enforcement_risks", "legal_basis_trace"]) {
    await expect(page.getByTestId(`report-fold-${id}`)).not.toHaveAttribute("open", "");
  }
  await page.getByTestId("report-fold-enforcement_risks").locator(":scope > summary").click();
  await expect(page.getByTestId("report-module-enforcement_risks")).toBeVisible();
});

test("立即动作可跳转，并自动展开被折叠的目标模块", async ({ page }) => {
  await reachReport(page);
  const interview = page.getByTestId("quick-brief-steps").locator('a[href="#report-module-interview_points"]').first();
  await expect(interview).toBeVisible();
  await interview.click();
  await expect(page.getByTestId("report-fold-interview_points")).toHaveAttribute("open", "");
  await expect(page.getByTestId("report-module-interview_points")).toBeVisible();
  // 索引同样会展开折叠模块。
  await page.getByTestId("report-index-legal_basis_trace").click();
  await expect(page.getByTestId("report-fold-legal_basis_trace")).toHaveAttribute("open", "");
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

test("伤情未查时一句话先说不能下结论，走向分支排在动作之前", async ({ page }) => {
  await page.goto("/analysis");
  await page.getByTestId("case-text-input").fill("3月2日晚上，张某在城南市场门口殴打李某。");
  await page.getByTestId("case-input-submit").click();
  await page.waitForURL(/\/analysis\/report$/);
  await expect(page.getByTestId("quick-brief")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("quick-brief-bottom-line")).toContainText("现在还不能下结论，因为");
  const branchesFirst = await page.getByTestId("quick-brief").evaluate((brief) => {
    const branches = brief.querySelector('[data-testid="quick-brief-branches"]');
    const steps = brief.querySelector('[data-testid="quick-brief-steps"]');
    return Boolean(branches && steps && (branches.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(branchesFirst).toBe(true);
});

test("证据清单默认只显示高优先级，其余收进“更多”；询问要点每角色默认不超过 3 问", async ({ page }) => {
  await reachReport(page);
  const evidence = page.getByTestId("report-module-evidence_checklist");
  for (const item of await evidence.locator('[data-testid^="workbench-item-"]:visible').all()) {
    await expect(item.locator(".evidence-priority")).toHaveClass(/evidence-priority--high/);
  }
  await expect(page.getByTestId("workbench-more-evidence")).toBeVisible();
  await page.getByTestId("report-fold-interview_points").locator(":scope > summary").click();
  for (const group of await page.locator(".interview-role-group").all()) {
    expect(await group.locator(":scope > ul > li").count()).toBeLessThanOrEqual(3);
  }
});
