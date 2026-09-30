import { expect, test } from "@playwright/test";
import type { AnalysisIntakeResponse } from "@policymate/contracts";
import { reachReport } from "./report-flow";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

test("先展示分析方向与受立案条件，再展示待核验分支和行动清单", async ({ page }) => {
  await page.goto("/analysis");
  await page.getByTestId("case-text-input").fill("4月1日晚上，张某殴打李某。");
  await page.getByTestId("case-input-submit").click();
  await page.waitForURL(/\/analysis\/report$/);
  await expect(page.getByTestId("analysis-report")).toBeVisible();

  const order = await page.getByTestId("analysis-report").evaluate((report) => {
    const ids = [
      "report-module-index",
      "report-module-preliminary_qualification",
      "report-module-filing_conditions",
      "gap-branches",
      "report-module-evidence_checklist",
      "report-module-interview_points",
      "report-module-enforcement_risks",
      "report-module-legal_basis_trace",
      "document-tasks",
    ];
    return ids.every((id, index) => {
      if (index === 0) return true;
      const previous = report.querySelector(`[data-testid="${ids[index - 1]}"]`);
      const current = report.querySelector(`[data-testid="${id}"]`);
      return previous !== null && current !== null &&
        Boolean(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });
  expect(order).toBe(true);
});

test("摘要不重复展示，模块使用中文状态并具有明确段落间距", async ({ page }) => {
  await reachReport(page);
  const module = page.getByTestId("report-module-enforcement_risks");
  const summary = "核查紧急风险、程序期限和告知送达记录。";
  const text = await module.innerText();
  expect(text.split(summary)).toHaveLength(2);
  expect(text).not.toMatch(/\bpresent\b|\binsufficient_facts\b/);
  const style = await module.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { display: computed.display, gap: parseFloat(computed.rowGap) };
  });
  expect(style.display).toBe("grid");
  expect(style.gap).toBeGreaterThanOrEqual(12);
});

test("后端模块乱序时目录和正文仍按固定阅读顺序排列", async ({ page }) => {
  await page.route("**/api/v1/analysis/sessions", async (route) => {
    const response = await route.fetch();
    const body = await response.json() as AnalysisIntakeResponse;
    for (const analysis of body.analyses) analysis.report.modules.reverse();
    await route.fulfill({ response, json: body });
  });
  await reachReport(page);
  const order = await page.locator(".report-module").evaluateAll((modules) =>
    modules.map((module) => module.id),
  );
  expect(order).toEqual([
    "report-module-preliminary_qualification",
    "report-module-filing_conditions",
    "report-module-evidence_checklist",
    "report-module-interview_points",
    "report-module-enforcement_risks",
    "report-module-legal_basis_trace",
  ]);
  const hrefs = await page.getByTestId("report-module-index").locator("a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  expect(hrefs).toEqual(order.map((id) => `#${id}`));
});

test("技术版本默认收起，仍可查看完整快照与生成时间", async ({ page }) => {
  await reachReport(page);
  const metadata = page.getByTestId("report-metadata");
  await expect(metadata).not.toHaveAttribute("open");
  await expect(metadata.locator("dl")).not.toBeVisible();
  await metadata.locator("summary").click();
  await expect(metadata.locator("dl")).toBeVisible();
  await expect(metadata).toContainText(/v\d+ · [0-9a-f]{64}/);
  await expect(metadata).toContainText("北京时间");
});

for (const viewport of [
  { width: 360, height: 800 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
]) {
  test(`报告在 ${viewport.width}px 宽度和放大字体下可阅读`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await reachReport(page);
    await page.screenshot({ path: testInfo.outputPath("report.png"), fullPage: true });
    await page.getByTestId("report-index-evidence_checklist").click();
    const evidence = page.getByTestId("report-module-evidence_checklist");
    const box = await evidence.boundingBox();
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect(box?.y).toBeLessThan(100);

    await page.getByTestId("report-metadata").locator("summary").click();
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width + 1);
    for (const id of ["begin-modification", "report-index-preliminary_qualification"]) {
      const target = await page.getByTestId(id).boundingBox();
      expect(target?.height).toBeGreaterThanOrEqual(44);
      expect(target?.width).toBeGreaterThanOrEqual(44);
    }
  });
}
