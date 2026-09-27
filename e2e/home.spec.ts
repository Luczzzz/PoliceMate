import { expect, test } from "@playwright/test";
import { resetFixture } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetFixture(request);
});

test.describe("首页产品外壳", () => {
  test("只显示案情分析与文书范例两个主入口", async ({ page }) => {
    await page.goto("/");
    const entries = page.getByTestId("primary-entries");
    await expect(entries).toBeVisible();

    await expect(entries.locator(".entry-card")).toHaveCount(2);
    await expect(page.getByTestId("entry-caseAnalysis")).toBeVisible();
    await expect(page.getByTestId("entry-documentExamples")).toBeVisible();

    // 不展示未来功能占位。
    await expect(page.getByText("敬请期待")).toHaveCount(0);

    // 不展示账户、历史、收藏、设置等内容入口。
    for (const forbidden of ["个人中心", "我的", "历史记录", "收藏", "设置", "案例库", "消息"]) {
      await expect(page.getByRole("link", { name: forbidden })).toHaveCount(0);
      await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);
    }
  });

  test("两个入口在尺寸与视觉强度上同等重要", async ({ page }) => {
    await page.goto("/");
    const analysis = page.getByTestId("entry-caseAnalysis");
    const documents = page.getByTestId("entry-documentExamples");
    await expect(analysis).toBeVisible();
    await expect(documents).toBeVisible();

    const analysisBox = await analysis.boundingBox();
    const documentsBox = await documents.boundingBox();
    expect(analysisBox).not.toBeNull();
    expect(documentsBox).not.toBeNull();
    expect(Math.abs((analysisBox?.width ?? 0) - (documentsBox?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((analysisBox?.height ?? 0) - (documentsBox?.height ?? 0))).toBeLessThanOrEqual(1);

    // 两个入口使用相同卡片结构与状态呈现，不区分主次。
    await expect(analysis).toHaveClass(/entry-card/);
    await expect(documents).toHaveClass(/entry-card/);
    await expect(analysis).not.toHaveClass(/entry-card--unavailable/);
    await expect(documents).not.toHaveClass(/entry-card--unavailable/);
  });

  test("入口可用状态来自 PoliceMate 后端", async ({ page }) => {
    const shellResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/shell") && response.request().method() === "GET",
    );
    await page.goto("/");
    const response = await shellResponse;

    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      entries: Record<string, { available: boolean; reason: string | null }>;
    };
    expect(body.entries.caseAnalysis?.available).toBe(true);
    expect(body.entries.documentExamples?.available).toBe(true);

    await expect(page.getByTestId("entry-caseAnalysis")).toHaveAttribute("data-available", "true");
    await expect(page.getByTestId("entry-documentExamples")).toHaveAttribute(
      "data-available",
      "true",
    );
  });

  test("首页可以进入使用与数据说明", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("data-use-link").click();

    await expect(page).toHaveURL(/\/data-use$/);
    await expect(page.getByRole("heading", { name: "使用与数据说明", level: 1 })).toBeVisible();
  });
});
