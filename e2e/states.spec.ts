import { expect, test } from "@playwright/test";
import { resetFixture } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetFixture(request);
});

test.describe("通用状态", () => {
  test("断网后就地显示网络不可用状态及下一步", async ({ page, context }) => {
    await page.goto("/");
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    const banner = page.getByTestId("offline-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("当前无网络连接");
    await expect(banner).toContainText("请恢复网络后重试");

    await context.setOffline(false);
  });

  test("读取入口状态失败时显示影响、下一步并可重试", async ({ page }) => {
    await page.route("**/api/v1/shell", (route) => route.abort());
    await page.goto("/");

    const panel = page.getByTestId("shell-failure");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("影响");
    await expect(panel).toContainText("下一步");

    await page.unroute("**/api/v1/shell");
    await page.getByTestId("retry").click();
    await expect(page.getByTestId("primary-entries")).toBeVisible();
  });

  test("后端服务异常时显示服务暂时不可用和请求编号", async ({ page }) => {
    await page.route("**/api/v1/shell", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          contractVersion: "1.0",
          error: {
            code: "internal_error",
            message: "服务暂时不可用，请稍后重试。",
            requestId: "req-500",
          },
        }),
      }),
    );
    await page.goto("/");

    const panel = page.getByTestId("shell-failure");
    await expect(panel).toContainText("服务暂时不可用");
    await expect(page.getByTestId("request-id")).toContainText("req-500");
  });

  test("契约版本不兼容时提示更新页面", async ({ page }) => {
    await page.route("**/api/v1/shell", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          contractVersion: "1.0",
          error: {
            code: "contract_incompatible",
            message: "契约版本不兼容，请刷新或更新页面。",
            requestId: "req-409",
          },
        }),
      }),
    );
    await page.goto("/");

    const panel = page.getByTestId("shell-failure");
    await expect(panel).toHaveAttribute("data-variant", "contract");
    await expect(panel).toContainText("需要更新页面");
  });

  test("页面渲染异常时显示页面异常状态", async ({ page }) => {
    await page.goto("/__test__/throw");

    const panel = page.getByTestId("page-error");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("页面出现异常");
    await expect(panel).toContainText("刷新页面重试");
    await expect(page.getByRole("button", { name: "刷新页面" })).toBeVisible();
  });

  test("未知路径显示页面不存在状态", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");

    const panel = page.getByTestId("not-found");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("页面不存在");
    await expect(panel).toContainText("下一步");
  });
});
