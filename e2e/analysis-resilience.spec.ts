import { expect, test, type Page } from "@playwright/test";
import { resetFixture } from "./helpers";

/**
 * 长任务真实阶段/取消，以及网络、限流、超长内容等失败状态的独立呈现。
 */

const TEXT = "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。";

test.beforeEach(async ({ request }) => {
  await resetFixture(request);
});

function errorBody(code: string, message: string, requestId: string): string {
  return JSON.stringify({ contractVersion: "1.0", error: { code, message, requestId } });
}

async function gotoAndSubmit(page: Page): Promise<void> {
  await page.goto("/analysis");
  await page.getByTestId("case-text-input").fill(TEXT);
  await page.getByTestId("case-input-submit").click();
}

test.describe("长任务真实阶段与取消", () => {
  test("提交后显示真实阶段与已等待时间，不显示百分比，并可取消", async ({ page }) => {
    await page.route("**/api/v1/analysis/sessions", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ contractVersion: "1.0" }),
        });
      } catch {
        // 请求已被取消，忽略。
      }
    });

    await gotoAndSubmit(page);

    const progress = page.getByTestId("analysis-progress");
    await expect(progress).toBeVisible();
    await expect(page.getByTestId("analysis-progress-stage")).toContainText("提取候选事实");
    await expect(page.getByTestId("analysis-progress-elapsed")).toContainText("已等待");
    await expect(progress).not.toContainText("%");

    await page.getByTestId("analysis-cancel").click();
    await expect(progress).toHaveCount(0);

    // 迟到响应不得写回，页面保持在输入页。
    await page.waitForTimeout(2800);
    expect(new URL(page.url()).pathname).toBe("/analysis");
    await expect(page.getByTestId("analysis-report")).toHaveCount(0);
  });
});

test.describe("失败状态分别处理", () => {
  test("请求过于频繁时显示限流状态、影响与下一步", async ({ page }) => {
    await page.route("**/api/v1/analysis/sessions", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: errorBody("rate_limited", "请求过于频繁，请稍后再试。", "req-429"),
      }),
    );
    await gotoAndSubmit(page);

    const panel = page.getByTestId("case-input-failure");
    await expect(panel).toHaveAttribute("data-variant", "throttled");
    await expect(panel).toContainText("请求过于频繁");
    await expect(panel).toContainText("影响");
    await expect(panel).toContainText("下一步");
    await expect(page.getByTestId("inline-request-id")).toContainText("req-429");
  });

  test("内容过长或格式不支持时显示输入状态", async ({ page }) => {
    await page.route("**/api/v1/analysis/sessions", (route) =>
      route.fulfill({
        status: 413,
        contentType: "application/json",
        body: errorBody("request_too_large", "请求体超过大小上限，请精简后重试。", "req-413"),
      }),
    );
    await gotoAndSubmit(page);

    const panel = page.getByTestId("case-input-failure");
    await expect(panel).toHaveAttribute("data-variant", "input");
    await expect(panel).toContainText("内容过长或格式不支持");
  });

  test("输入格式不支持时同样显示输入状态", async ({ page }) => {
    await page.route("**/api/v1/analysis/sessions", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: errorBody("invalid_input", "案情内容包含不支持的格式或特殊字符，仅接受纯文本。", "req-400"),
      }),
    );
    await gotoAndSubmit(page);

    const panel = page.getByTestId("case-input-failure");
    await expect(panel).toHaveAttribute("data-variant", "input");
    await expect(panel).toContainText("内容过长或格式不支持");
  });

  test("网络不可用时显示网络状态与下一步", async ({ page }) => {
    await page.route("**/api/v1/analysis/sessions", (route) => route.abort());
    await gotoAndSubmit(page);

    const panel = page.getByTestId("case-input-failure");
    await expect(panel).toHaveAttribute("data-variant", "offline");
    await expect(panel).toContainText("网络不可用");
    await expect(panel).toContainText("下一步");
  });
});
