import { expect, test } from "@playwright/test";
import { apiHeaders, resetFixture } from "./helpers";

/**
 * 安全渲染：只有通过校验的 http(s) 官方链接可以点击；任意协议链接
 * （如 `javascript:`）不得渲染为可点击链接。
 */

test.beforeEach(async ({ request }) => {
  await resetFixture(request);
});

test.describe("安全渲染", () => {
  test("非法协议的官方链接不渲染为可点击链接", async ({ page, request }) => {
    const headers = await apiHeaders(request);
    const listResponse = await request.get("/api/v1/document-examples", { headers });
    expect(listResponse.ok()).toBeTruthy();
    const list = (await listResponse.json()) as { items: Array<{ exampleId: string }> };
    const exampleId = list.items[0]!.exampleId;

    const detailResponse = await request.get(`/api/v1/document-examples/${exampleId}`, { headers });
    const detail = (await detailResponse.json()) as {
      example: { legalSources: Array<{ sourceId: string; officialUrl: string | null }> };
    };
    expect(detail.example.legalSources.length).toBeGreaterThan(0);
    detail.example.legalSources[0]!.officialUrl = "javascript:alert(1)";

    await page.route(`**/api/v1/document-examples/${exampleId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(detail),
      }),
    );

    await page.goto(`/documents/${exampleId}`);
    await expect(page.getByTestId("example-detail")).toBeVisible();

    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(
      page.getByTestId(`source-link-missing-${detail.example.legalSources[0]!.sourceId}`),
    ).toBeVisible();
  });
});
