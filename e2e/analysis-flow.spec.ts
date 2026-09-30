import { expect, test, type Page } from "@playwright/test";

/**
 * 案情分析主路径：提交脱敏案情后直接得到事实快照与分析报告。
 *
 * 取消候选事实确认、决定性追问与分析前确认三个前置页面；全部通过移动
 * 浏览器黑盒驱动 H5 → PoliceMate 后端。
 */

const NORMAL_TEXT = "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。";
const VAGUE_TEXT = "年初，王某偷走室友现金一千多元。王某三十多岁。";
const INDEPENDENT_TEXT =
  "3月2日，张某在城南市场殴打李某。另外，3月8日王某报案称电动车在火车站门口被盗。";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

async function gotoInput(page: Page): Promise<void> {
  await page.goto("/analysis");
  await expect(page.getByTestId("case-input")).toBeVisible();
}

async function submitCase(page: Page, text: string): Promise<void> {
  await gotoInput(page);
  await page.getByTestId("case-text-input").fill(text);
  await page.getByTestId("case-input-submit").click();
  await page.waitForURL(/\/analysis\/report$/);
  await expect(page.getByTestId("analysis-report")).toBeVisible({ timeout: 20_000 });
}

test.describe("案情输入页", () => {
  test("常驻显示脱敏义务、Dify 处理提示与字符计数", async ({ page }) => {
    await gotoInput(page);

    const notice = page.getByTestId("deidentification-notice");
    await expect(notice).toContainText("请勿输入姓名、身份证号、手机号、精确住址");
    await expect(notice).toContainText("发送至 Dify 处理");
    await expect(notice).toContainText("只接受纯文本");

    await page.getByTestId("case-text-input").fill("测试内容");
    await expect(page.getByTestId("char-count")).toContainText("4 / 10,000 字符");
  });

  test("超过 10,000 字符时明确拒绝，不静默截断", async ({ page }) => {
    await gotoInput(page);
    await page.getByTestId("case-text-input").fill("案".repeat(10_001));

    await expect(page.getByTestId("char-count")).toContainText("已超出上限");
    await expect(page.getByTestId("case-input-error")).toContainText("10,000 字符上限");
    await expect(page.getByTestId("case-input-submit")).toBeDisabled();
    await expect(page).toHaveURL(/\/analysis$/);
  });

  test("空案情不能提交", async ({ page }) => {
    await gotoInput(page);
    await expect(page.getByTestId("case-input-submit")).toBeDisabled();
  });
});

test.describe("提交案情直达报告", () => {
  test("提交脱敏案情后直接进入报告页，无需任何确认或回答步骤", async ({ page }) => {
    await submitCase(page, NORMAL_TEXT);

    // 报告绑定不可变事实快照，并展示固定六模块。
    const detail = page.getByTestId("analysis-report");
    await expect(page.getByTestId("report-status")).not.toHaveText("");
    await expect(page.getByTestId("report-headline")).not.toHaveText("");
    await expect(detail).toContainText(/v\d+ · [0-9a-f]{64}/);
    await expect(page.getByTestId("report-module-index")).toBeVisible();
    for (const moduleId of [
      "preliminary_qualification",
      "filing_conditions",
      "evidence_checklist",
      "interview_points",
      "enforcement_risks",
      "legal_basis_trace",
    ]) {
      await expect(page.getByTestId(`report-module-${moduleId}`)).toBeVisible();
    }

    // 主路径不再出现确认、追问与分析前确认页面。
    for (const path of ["/analysis/facts", "/analysis/questions", "/analysis/review"]) {
      await page.goto(path);
      await expect(page.getByTestId("not-found")).toBeVisible();
    }
  });

  test("报告展示每条依据的确认状态，并在存在未经确认依据时顶部提示", async ({ page }) => {
    await submitCase(page, NORMAL_TEXT);

    // 顶部显著提示未经确认依据。
    const notice = page.getByTestId("unconfirmed-basis-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("未经确认");

    // 每条依据都带确认状态标签（不只是第一条）。
    const qualification = page.getByTestId("report-module-preliminary_qualification");
    await qualification.locator("summary").click();
    const labels = qualification.locator('[data-testid^="basis-confirmation-"]');
    await expect(labels).not.toHaveCount(0);
    const texts = await labels.allTextContents();
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text).toBe("系统提取，未经确认");
    }
  });

  test("模糊事实仍被提取并形成报告，余额与范围不阻塞报告生成", async ({ page }) => {
    await submitCase(page, VAGUE_TEXT);
    await expect(page.getByTestId("analysis-report")).toBeVisible();
  });

  test("检测到彼此独立的事项时报告仍正常生成", async ({ page }) => {
    await submitCase(page, INDEPENDENT_TEXT);
    // 多事项自动拆分由后续切片实现；本切片只保证不阻断报告生成。
    await expect(page.getByTestId("analysis-report")).toBeVisible();
  });
});

test.describe("隐私边界", () => {
  test("客户端资产不包含 Dify 密钥，页面请求仅访问同源 /api", async ({ page }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) apiRequests.push(request.url());
    });

    await page.goto("/analysis");
    await page.getByTestId("case-text-input").fill(NORMAL_TEXT);
    await page.getByTestId("case-input-submit").click();
    await page.waitForURL(/\/analysis\/report$/);

    const scripts = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script[src]")).map((node) =>
        (node as HTMLScriptElement).src,
      ),
    );
    for (const src of scripts) {
      const response = await page.request.get(src);
      const body = await response.text();
      expect(body).not.toMatch(/DIFY_[A-Z_]+|dify[-_]?api[-_]?key|sk-[A-Za-z0-9]{16,}/i);
    }

    const origin = new URL(page.url()).origin;
    for (const requestUrl of apiRequests) {
      expect(new URL(requestUrl).origin).toBe(origin);
    }
  });
});
