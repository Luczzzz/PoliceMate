import { expect, test } from "@playwright/test";

test.describe("使用与数据说明", () => {
  test("提供必需的非占位章节", async ({ page }) => {
    await page.goto("/data-use");

    for (const id of [
      "purpose",
      "desensitization",
      "dify",
      "lifetime",
      "metadata",
      "distribution",
    ]) {
      await expect(page.getByTestId(`data-use-section-${id}`)).toBeVisible();
    }

    await expect(page.getByTestId("data-use-section-purpose")).toContainText("程序辅助工具");
    await expect(page.getByTestId("data-use-section-desensitization")).toContainText(
      "请勿输入姓名",
    );
    await expect(page.getByTestId("data-use-section-dify")).toContainText("Dify");
    await expect(page.getByTestId("data-use-section-lifetime")).toContainText("30 分钟");
    await expect(page.getByTestId("data-use-section-metadata")).toContainText("随机请求编号");
  });

  test("分发说明不把不公开网址表述为认证、权限控制或保密访问", async ({ page }) => {
    await page.goto("/data-use");
    const distribution = page.getByTestId("data-use-section-distribution");

    await expect(distribution).toContainText("不公开网址只是分发控制");
    await expect(distribution).toContainText("不构成身份认证");
    await expect(distribution).toContainText("不能阻止网址传播");
    await expect(distribution).toContainText("noindex");
  });

  test("未配置部署信息时如实显示尚未配置，不编造主体", async ({ page }) => {
    await page.goto("/data-use");
    const service = page.getByTestId("data-use-service");

    await expect(service).toBeVisible();
    await expect(service).toContainText("尚未配置");
  });
});

test.describe("降低搜索引擎收录概率的措施", () => {
  test("首页文档声明 noindex 并禁止跟随", async ({ page }) => {
    await page.goto("/");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");

    expect(robots).toContain("noindex");
    expect(robots).toContain("nofollow");
  });

  test("API 响应带有 x-robots-tag", async ({ request }) => {
    const response = await request.get("/api/v1/shell");

    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  });
});
