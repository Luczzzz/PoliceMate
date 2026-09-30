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

  test("含风险标记的案情在报告正文之前置顶紧急核验提示", async ({ page }) => {
    await submitCase(page, "3月2日晚上，张某在家中家暴其妻子李某。");

    const prompts = page.getByTestId("urgent-prompts");
    await expect(prompts).toBeVisible();
    const card = page.getByTestId("urgent-prompt-domestic_violence");
    await expect(card).toContainText("紧急核验提示");
    await expect(card).toContainText("触发的事实");
    await expect(card).toContainText("系统提取，未经确认");
    await expect(card).toContainText("请核验");
    await expect(card).toContainText("不构成自动处置决定");

    // 置顶：紧急提示是报告正文的第一个区块。
    const firstTestId = await page
      .getByTestId("analysis-report")
      .evaluate((node) => (node.firstElementChild as HTMLElement | null)?.getAttribute("data-testid"));
    expect(firstTestId).toBe("urgent-prompts");
  });

  test("无风险标记的案情不出现紧急提示", async ({ page }) => {
    await submitCase(page, NORMAL_TEXT);
    await expect(page.getByTestId("analysis-report")).toBeVisible();
    await expect(page.getByTestId("urgent-prompts")).toHaveCount(0);
  });

  test("模糊事实仍被提取并形成报告，余额与范围不阻塞报告生成", async ({ page }) => {
    await submitCase(page, VAGUE_TEXT);
    await expect(page.getByTestId("analysis-report")).toBeVisible();
  });

  test("检测到彼此独立的事项时自动拆成多份分析并可切换", async ({ page }) => {
    await submitCase(page, INDEPENDENT_TEXT);

    // 输入含互不相关的事项：自动拆分为多份分析并提供切换入口。
    const switcher = page.getByTestId("analysis-switcher");
    await expect(switcher).toBeVisible();
    await expect(switcher).toContainText("2 份分析");
    await expect(page.getByTestId("analysis-switch-0")).toHaveAttribute("aria-pressed", "true");

    const metadata = page.getByTestId("report-metadata");
    await metadata.locator("summary").click();
    const firstSnapshot = await metadata.locator("dd").nth(1).innerText();
    await page.getByTestId("analysis-switch-1").click();
    await expect(page.getByTestId("analysis-switch-1")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("analysis-report")).toBeVisible();
    await page.getByTestId("report-metadata").locator("summary").click();
    const secondSnapshot = await page.getByTestId("report-metadata").locator("dd").nth(1).innerText();
    // 每份分析绑定各自独立的事实快照。
    expect(secondSnapshot).not.toBe(firstSnapshot);

    // 切回第一份分析恢复其报告与快照。
    await page.getByTestId("analysis-switch-0").click();
    await page.getByTestId("report-metadata").locator("summary").click();
    await expect(page.getByTestId("report-metadata").locator("dd").nth(1)).toHaveText(firstSnapshot);
  });

  test("存在冲突说法时并列展示各说法并按各版本给出分支", async ({ page }) => {
    await submitCase(
      page,
      "3月2日晚上，张某在城南市场门口殴打李某。李某称自己被打成轻伤，张某称李某只是轻微伤，双方说法不一。",
    );

    const section = page.getByTestId("fact-conflicts");
    await expect(section).toBeVisible();
    await expect(section).toContainText("轻伤");
    await expect(section).toContainText("轻微伤");
    await expect(section).toContainText("并列保留");
    await expect(section).toContainText("未选定任一版本");

    // 两个版本并列展示，且各自给出一条分支。
    await expect(section.locator('[data-testid^="conflict-version-"]')).toHaveCount(2);
    await expect(section.locator('[data-testid^="conflict-branch-"]')).toHaveCount(2);
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
