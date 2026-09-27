import { expect, test } from "@playwright/test";
import { resetFixture, setFixture } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetFixture(request);
});

test.describe("入口可用状态门控", () => {
  test("文书范例不可用时在点击前显示暂不可用，且不进入空入口", async ({ page, request }) => {
    await setFixture(request, { eligibleExampleCount: 0 });
    await page.goto("/");

    const entry = page.getByTestId("entry-documentExamples");
    await expect(entry).toHaveAttribute("data-available", "false");
    await expect(page.getByTestId("entry-status-documentExamples")).toContainText("暂不可用");
    await expect(page.getByTestId("entry-reason-documentExamples")).toBeVisible();

    // 不可用入口在点击前已明确标记，且不提供可进入的动作。
    const action = page.getByTestId("entry-action-documentExamples");
    await expect(action).toHaveAttribute("aria-disabled", "true");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("capability-documentExamples")).toHaveCount(0);

    // 另一个入口保持可用：两个能力独立降级。
    await expect(page.getByTestId("entry-caseAnalysis")).toHaveAttribute("data-available", "true");
  });

  test("案情分析不可用时文书范例仍可浏览", async ({ page, request }) => {
    await setFixture(request, { difyAvailable: false });
    await page.goto("/");

    await expect(page.getByTestId("entry-caseAnalysis")).toHaveAttribute("data-available", "false");
    await expect(page.getByTestId("entry-reason-caseAnalysis")).toContainText("分析服务");
    await expect(page.getByTestId("entry-documentExamples")).toHaveAttribute(
      "data-available",
      "true",
    );

    await page.getByTestId("entry-action-documentExamples").click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByTestId("capability-documentExamples")).toBeVisible();
  });

  test("两个入口可以同时不可用", async ({ page, request }) => {
    await setFixture(request, { difyAvailable: false, eligibleExampleCount: 0 });
    await page.goto("/");

    await expect(page.getByTestId("entry-caseAnalysis")).toHaveAttribute("data-available", "false");
    await expect(page.getByTestId("entry-documentExamples")).toHaveAttribute(
      "data-available",
      "false",
    );
  });

  test("直接访问不可用入口时显示功能暂不可用状态和可执行下一步", async ({ page, request }) => {
    await setFixture(request, { difyAvailable: false });
    await page.goto("/analysis");

    const panel = page.getByTestId("capability-unavailable");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("功能暂不可用");
    await expect(panel).toContainText("影响");
    await expect(panel).toContainText("下一步");
    await expect(page.getByTestId("capability-unavailable-reason")).toContainText("分析服务");

    await page
      .getByTestId("capability-unavailable")
      .getByRole("link", { name: "返回首页" })
      .click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("可用入口进入能力边界说明页", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("entry-action-caseAnalysis").click();

    await expect(page).toHaveURL(/\/analysis$/);
    await expect(page.getByTestId("capability-caseAnalysis")).toBeVisible();
  });
});
