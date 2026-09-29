import { expect, test } from "@playwright/test";
import { reachReport } from "./report-flow";

/**
 * 报告复制与导出边界验收（规格 7.5、AC-29）。
 *
 * 第一版不得提供报告全文或局部内容的产品内复制、下载、打印、分享或导出能力。
 */

const FORBIDDEN_LABELS = ["复制", "下载", "打印", "分享", "导出", "另存", "生成 PDF"];

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

test("报告页不存在产品内复制、打印、分享、下载或导出入口", async ({ page }) => {
  // 注册打印钩子：任何自动或误触的打印调用都会被记录。
  await page.addInitScript(() => {
    const target = window as unknown as { __pmPrintCalls: number };
    target.__pmPrintCalls = 0;
    window.print = () => {
      target.__pmPrintCalls += 1;
    };
  });

  await reachReport(page);

  for (const label of FORBIDDEN_LABELS) {
    await expect(
      page.getByRole("button", { name: new RegExp(label) }),
      `报告页不应存在按钮：${label}`,
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: new RegExp(label) }),
      `报告页不应存在链接：${label}`,
    ).toHaveCount(0);
  }

  // 页面不注册任何打印或导出入口，也不在加载时调用 window.print。
  const printCalls = await page.evaluate(
    () => (window as unknown as { __pmPrintCalls?: number }).__pmPrintCalls ?? -1,
  );
  expect(printCalls).toBe(0);

  // 报告头部固定声明仍然存在，说明这是辅助参考而非可导出材料。
  await expect(page.getByTestId("analysis-report")).toContainText("不构成案件定性");
});
