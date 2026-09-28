import { expect, test } from "@playwright/test";
import { resetFixture } from "./helpers";

/**
 * 结构化反馈：只提交预定义类型和非内容元数据，不提供自由文本框，
 * 也不上传页面文本、案情、事实、报告或检索词。
 */

test.beforeEach(async ({ request }) => {
  await resetFixture(request);
});

test.describe("结构化反馈", () => {
  test("只提供预定义类型，不提供自由文本框", async ({ page }) => {
    await page.goto("/data-use");

    const panel = page.getByTestId("feedback-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("不提供自由文本框");
    await expect(panel.locator("textarea")).toHaveCount(0);
    await expect(panel.locator('input[type="text"]')).toHaveCount(0);

    const options = panel.locator(".feedback-options button");
    await expect(options).toHaveCount(5);
  });

  test("提交预定义类型后只回执类型与请求编号", async ({ page }) => {
    await page.goto("/data-use");
    const panel = page.getByTestId("feedback-panel");
    await panel.getByTestId("feedback-basis_unopenable").click();

    const accepted = page.getByTestId("feedback-accepted");
    await expect(accepted).toBeVisible();
    await expect(accepted).toContainText("依据无法打开");
    await expect(accepted).toContainText("请求编号");
  });
});
