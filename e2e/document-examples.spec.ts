import { expect, test } from "@playwright/test";
import { resetFixture, setFixture } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetFixture(request);
});

/** 从详情页 URL 中取出范例标识，避免测试硬编码内容 ID。 */
function exampleIdFromUrl(url: string): string {
  const match = /\/documents\/([^/?#]+)$/.exec(url);
  expect(match, `无法从 ${url} 解析范例标识`).not.toBeNull();
  return decodeURIComponent(match![1]!);
}

test.describe("文书范例：浏览与检索", () => {
  test("按办理阶段浏览当前批次中的已核验范例", async ({ page }) => {
    await page.goto("/documents");

    await expect(page.getByTestId("capability-documentExamples")).toBeVisible();
    await expect(page.getByTestId("document-notice")).toContainText("不是正式文书模板");
    await expect(page.getByTestId("document-notice")).toContainText("不得直接制发");
    await expect(page.getByTestId("document-notice")).toContainText("均为虚构");

    // 默认按办理阶段浏览，六个阶段全部可见，空阶段明确说明。
    await expect(page.getByTestId("stage-section-reception_acceptance")).toContainText("接报与受理");
    await expect(page.getByTestId("stage-section-investigation_evidence")).toContainText("调查取证");
    await expect(page.getByTestId("stage-section-measures_approval")).toContainText("措施与审批");
    await expect(page.getByTestId("stage-section-execution_closure")).toContainText(
      "该阶段暂无已核验范例",
    );

    const cards = page.getByTestId("example-list").locator(".example-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(1);

    // 默认状态不显示已启用筛选。
    await expect(page.getByTestId("active-filters")).toHaveCount(0);
  });

  test("按关键词检索并显示已启用筛选与清除筛选", async ({ page }) => {
    await page.goto("/documents");

    await page.getByTestId("example-search").fill("讯问");

    await expect(page.getByTestId("active-filters")).toBeVisible();
    await expect(page.getByTestId("active-filter-keyword")).toContainText("关键词“讯问”");
    await expect(page.getByTestId("clear-filters")).toBeVisible();

    const cards = page.getByTestId("example-list").locator(".example-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("讯问笔录");

    await page.getByTestId("clear-filters").click();
    await expect(page.getByTestId("active-filters")).toHaveCount(0);
    await expect(page.getByTestId("stage-section-reception_acceptance")).toBeVisible();
  });

  test("别名与日常用语可以检索到对应范例", async ({ page }) => {
    await page.goto("/documents");

    await page.getByTestId("example-search").fill("先行登记保存");

    const cards = page.getByTestId("example-list").locator(".example-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("证据保全决定书");
  });

  test("按程序类别、办理阶段和文书类型筛选", async ({ page }) => {
    await page.goto("/documents");

    await page.getByTestId("filter-procedure-criminal").click();
    await expect(page.getByTestId("active-filter-procedure")).toContainText("程序类别：刑事程序");
    await expect(page.getByTestId("example-list").locator(".example-card")).toHaveCount(1);

    await page.getByTestId("filter-procedure-all").click();
    await page.getByTestId("filter-stage-measures_approval").click();
    await expect(page.getByTestId("active-filter-stage")).toContainText("办理阶段：措施与审批");
    await expect(page.getByTestId("example-list").locator(".example-card")).toHaveCount(1);

    await page.getByTestId("filter-stage-all").click();
    await page.getByTestId("filter-documentType-doc-type-admin-inquiry").click();
    await expect(page.getByTestId("active-filter-documentType")).toContainText("文书类型：询问笔录");
    await expect(page.getByTestId("example-list").locator(".example-card")).toHaveCount(1);

    await page.getByTestId("clear-filters").click();
    await expect(page.getByTestId("active-filters")).toHaveCount(0);
  });

  test("筛选条件组合后无匹配结果时显示明确状态并可返回分类浏览", async ({ page }) => {
    await page.goto("/documents");

    await page.getByTestId("filter-stage-measures_approval").click();
    await page.getByTestId("example-search").fill("讯问");

    const noMatch = page.getByTestId("no-match");
    await expect(noMatch).toBeVisible();
    await expect(noMatch).toContainText("当前没有匹配的已核验范例");
    await expect(noMatch).toContainText("影响");
    await expect(noMatch).toContainText("下一步");

    await page.getByTestId("back-to-browse").click();
    await expect(page.getByTestId("no-match")).toHaveCount(0);
    await expect(page.getByTestId("stage-section-measures_approval")).toBeVisible();
  });

  test("检索词只保留在当前页面内存，不进入网址、存储或后端请求", async ({ page }) => {
    await page.goto("/documents");

    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.getByTestId("example-search").fill("讯问笔录别名");

    await expect(page.getByTestId("active-filter-keyword")).toContainText("讯问笔录别名");

    // 不进入网址。
    const url = new URL(page.url());
    expect(url.search).toBe("");
    expect(url.pathname).toBe("/documents");

    // 不进入后端请求。
    expect(requests.filter((requestUrl) => requestUrl.includes(encodeURIComponent("讯问笔录别名")))).toEqual([]);
    expect(requests.filter((requestUrl) => requestUrl.includes("讯问笔录别名"))).toEqual([]);
    expect(requests.some((requestUrl) => requestUrl.includes("/api/v1/document-examples?"))).toBe(
      false,
    );

    // 不进入浏览器持久化存储。
    const stored = await page.evaluate(() => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
    }));
    expect(stored.local).not.toContain("讯问笔录别名");
    expect(stored.session).not.toContain("讯问笔录别名");
    expect(stored.local).toBe("{}");
    expect(stored.session).toBe("{}");
  });

  test("页面不提供复制、编辑、下载、打印、分享或导出入口", async ({ page }) => {
    await page.goto("/documents");
    await page.getByTestId("example-list").locator(".example-card").first().click();
    await expect(page.getByTestId("example-detail")).toBeVisible();

    for (const forbidden of ["复制", "编辑", "下载", "打印", "分享", "导出", "套用", "生成文书"]) {
      await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);
      await expect(page.getByRole("link", { name: forbidden })).toHaveCount(0);
    }
    await expect(page.locator("[download]")).toHaveCount(0);
  });
});

test.describe("文书范例：详情与治理", () => {
  test("详情展示适用条件、制作指导、虚构示例、依据与治理信息", async ({ page }) => {
    await page.goto("/documents");
    await page.getByTestId("example-list").locator(".example-card").first().click();

    await expect(page.getByTestId("example-detail")).toBeVisible();
    await expect(page.getByTestId("document-notice")).toContainText("辅助参考");
    await expect(page.getByTestId("document-notice")).toContainText("均为虚构");

    await expect(page.getByTestId("example-identity")).toContainText("内容发布批次");
    await expect(page.getByTestId("example-applicability")).toContainText("适用场景");
    await expect(page.getByTestId("example-applicability")).toContainText("不适用情形");
    await expect(page.getByTestId("example-applicability")).toContainText("前置条件");
    await expect(page.getByTestId("example-guidance")).toContainText("结构分段及每段目的");
    await expect(page.getByTestId("example-guidance")).toContainText("制作要点");
    await expect(page.getByTestId("example-guidance")).toContainText("常见错误");
    await expect(page.getByTestId("annotated-example")).toBeVisible();
    await expect(page.getByTestId("example-governance")).toContainText("法源依据");
    await expect(page.getByTestId("legal-sources")).toContainText("现行有效");
    await expect(page.getByTestId("example-governance")).toContainText("内容维护者");
  });
});

test.describe("文书范例：状态失效与旧链接阻断", () => {
  test("单项下架后列表与旧链接同步失效", async ({ page, request }) => {
    await page.goto("/documents");
    const firstCard = page.getByTestId("example-list").locator(".example-card").first();
    await firstCard.click();
    await expect(page.getByTestId("example-detail")).toBeVisible();

    const detailUrl = page.url();
    const exampleId = exampleIdFromUrl(detailUrl);

    await setFixture(request, { exampleStatus: { exampleId, status: "withdrawn" } });

    // 刷新旧链接：后端状态门控生效，页面不展示正文。
    await page.reload();
    await expect(page.getByTestId("example-unavailable")).toBeVisible();
    await expect(page.getByTestId("example-unavailable")).toContainText("当前内容已经失效");
    await expect(page.getByTestId("example-detail-body")).toHaveCount(0);

    // 列表同步移除。
    await page.goto("/documents");
    await expect(page.getByTestId("example-card-" + exampleId)).toHaveCount(0);
  });

  test("详情响应禁止缓存，缓存不能绕过当前状态", async ({ page, request }) => {
    await page.goto("/documents");

    const detailResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/document-examples/") &&
        response.request().method() === "GET",
    );
    await page.getByTestId("example-list").locator(".example-card").first().click();

    const detailResponse = await detailResponsePromise;
    expect(detailResponse.headers()["cache-control"]).toBe("no-store");

    const exampleId = exampleIdFromUrl(page.url());
    await setFixture(request, { exampleStatus: { exampleId, status: "withdrawn" } });

    // 重新请求同一地址仍返回失效状态，而不是使用缓存。
    const blocked = await request.get(`/api/v1/document-examples/${encodeURIComponent(exampleId)}`, {
      headers: { "x-pm-contract-version": "1.0" },
    });
    expect(blocked.status()).toBe(410);
  });

  test("全部范例失效时入口在点击前显示暂不可用", async ({ page, request }) => {
    await setFixture(request, { exampleStatusAll: "withdrawn" });
    await page.goto("/");

    await expect(page.getByTestId("entry-documentExamples")).toHaveAttribute(
      "data-available",
      "false",
    );
    await expect(page.getByTestId("entry-status-documentExamples")).toContainText("暂不可用");
    await expect(page.getByTestId("entry-action-documentExamples")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("依赖法源失效时内容退出列表", async ({ page, request }) => {
    await setFixture(request, { legalSourceStatusAll: "repealed" });
    await page.goto("/");

    await expect(page.getByTestId("entry-documentExamples")).toHaveAttribute(
      "data-available",
      "false",
    );
  });
});
