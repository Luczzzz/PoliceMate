import { expect, test, type Page } from "@playwright/test";
import { resetFixture } from "./helpers";

/**
 * 会话隐私与生命周期：案情只属于当前标签页，不进入存储、URL、Service Worker
 * 缓存或错误输出；存在未清除案情时提供不含内容的通用离开提醒；清除后不可恢复。
 */

const CANARY = "CANARY7F3A9B";
const TEXT = `3月2日晚上，张某在${CANARY}门口殴打李某。李某手部擦伤。`;

test.beforeEach(async ({ request }) => {
  await resetFixture(request);
});

async function startAnalysis(page: Page): Promise<void> {
  await page.goto("/analysis");
  await page.getByTestId("case-text-input").fill(TEXT);
  await page.getByTestId("case-input-submit").click();
  await page.waitForURL(/\/analysis\/report$/);
  await expect(page.getByTestId("analysis-report")).toBeVisible({ timeout: 20_000 });
}

test.describe("会话隐私边界", () => {
  test("案情不进入浏览器存储、URL、Service Worker 缓存或控制台输出", async ({ page, request }) => {
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    page.on("pageerror", (error) => consoleMessages.push(error.message));

    const tokenRequest = page.waitForRequest((request) =>
      request.url().includes("/api/v1/anonymous-tokens"),
    );
    const sessionRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/api/v1/analysis/sessions") && request.method() === "POST",
    );

    await startAnalysis(page);
    await expect(page.locator("body")).toContainText(CANARY);

    // 受保护接口携带短期匿名令牌，且令牌来自后端，不写入页面。
    await tokenRequest;
    const posted = await sessionRequest;
    expect(posted.headers()["x-pm-anonymous-token"]).toBeTruthy();

    const url = new URL(page.url());
    expect(url.search).toBe("");
    expect(page.url()).not.toContain(CANARY);

    const stored = await page.evaluate(async () => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
      caches: typeof caches === "undefined" ? [] : await caches.keys(),
      workers: (await navigator.serviceWorker.getRegistrations()).length,
    }));
    expect(stored.local).toBe("{}");
    expect(stored.session).toBe("{}");
    expect(stored.caches).toEqual([]);
    expect(stored.workers).toBe(0);

    expect(JSON.stringify(consoleMessages)).not.toContain(CANARY);
  });

  test("存在未清除案情时设置不含内容的通用离开提醒，清除后不再提醒", async ({ page }) => {
    await startAnalysis(page);

    const warnedWhileActive = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(warnedWhileActive).toBe(true);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("clear-analysis-report").click();
    await page.waitForURL(/\/analysis$/);

    await expect(page.locator("body")).not.toContainText(CANARY);
    await expect(page.getByTestId("case-text-input")).toHaveValue("");

    const warnedAfterClear = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(warnedAfterClear).toBe(false);
  });

  test("空闲 30 分钟后当前标签页状态不可恢复", async ({ page }) => {
    await page.clock.install();
    await startAnalysis(page);
    await expect(page.getByTestId("analysis-report")).toBeVisible();

    await page.clock.fastForward(31 * 60 * 1000);

    await page.waitForURL(/\/analysis$/);
    await expect(page.getByTestId("analysis-report")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(CANARY);
  });

  test("清除本次分析需要二次确认；取消确认时保留当前状态", async ({ page }) => {
    await startAnalysis(page);

    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.getByTestId("clear-analysis-report").click();

    await expect(page).toHaveURL(/\/analysis\/report$/);
    await expect(page.getByTestId("analysis-report")).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("clear-analysis-report").click();
    await page.waitForURL(/\/analysis$/);
    await expect(page.getByTestId("analysis-report")).toHaveCount(0);
  });
});
