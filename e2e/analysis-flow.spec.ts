import { expect, test, type Page } from "@playwright/test";

/**
 * 案情分析主流程：候选事实确认、模糊值、独立事项、追问上限、
 * 紧急提示和分析前确认。全部通过移动浏览器黑盒驱动 H5 → PoliceMate 后端。
 */

const NORMAL_TEXT = "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。";
const VAGUE_TEXT = "年初，王某偷走室友现金一千多元。王某三十多岁。";
const INDEPENDENT_TEXT =
  "3月2日，张某在城南市场殴打李某。另外，3月8日王某报案称电动车在火车站门口被盗。";
const URGENT_TEXT = "今天凌晨，刘某持刀闯入前女友家中扬言伤人。";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

function acceptNextDialog(page: Page): void {
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
}

async function gotoInput(page: Page): Promise<void> {
  await page.goto("/analysis");
  await expect(page.getByTestId("case-input")).toBeVisible();
}

async function startAnalysis(page: Page, text: string): Promise<void> {
  await gotoInput(page);
  await page.getByTestId("case-text-input").fill(text);
  await page.getByTestId("case-input-submit").click();
  await page.waitForURL(/\/analysis\/facts$/);
  await expect(page.getByTestId("fact-list")).toBeVisible();
}

/** 标记某一类别的第一条事实。 */
async function markCategory(
  page: Page,
  category: string,
  status: "confirmed" | "denied" | "unknown" | "disputed",
): Promise<void> {
  const card = page.locator(`[data-testid="fact-list"] [data-category="${category}"]`).first();
  await card.getByTestId(new RegExp(`fact-mark-.*-${status}`)).click();
  await expect(card).toHaveAttribute("data-status", status);
}

/** 回答当前轮全部问题并提交；等待进入下一轮或分析前确认页。 */
async function answerRound(
  page: Page,
  kind: "unknown" | "value",
  text = "已核实的情况说明。",
): Promise<void> {
  const before = await page.getByTestId("round-progress").innerText();
  const questions = page.locator('[data-testid="question-list"] .question-card');
  const count = await questions.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const card = questions.nth(index);
    await card.getByTestId(kind === "value" ? /-answer-value$/ : /-answer-unknown$/).click();
    if (kind === "value") {
      await card.locator("textarea").fill(text);
    }
  }
  await expect(page.getByTestId("submit-round")).toBeEnabled();
  await page.getByTestId("submit-round").click();
  await Promise.race([
    page.getByTestId("pre-analysis-page").waitFor({ state: "visible", timeout: 30_000 }),
    page
      .locator('[data-testid="round-progress"]', { hasNotText: before })
      .waitFor({ state: "visible", timeout: 30_000 }),
  ]);
}

/** 从事实确认开始，一直回答到进入分析前确认页。 */
async function runRoundsUntilReview(page: Page, kind: "unknown" | "value" = "unknown"): Promise<void> {
  await page.getByTestId("start-questions").click();
  await expect(page.getByTestId("decisive-questions-page")).toBeVisible();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await page.getByTestId("pre-analysis-page").count()) > 0) return;
    await answerRound(page, kind);
  }
  await expect(page.getByTestId("pre-analysis-page")).toBeVisible();
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

test.describe("候选事实确认", () => {
  test("逐项标记确认、否认、未知、争议；系统不默认确认任何事实", async ({ page }) => {
    await startAnalysis(page, NORMAL_TEXT);

    const cards = page.locator('[data-testid="fact-list"] .fact-card');
    const total = await cards.count();
    expect(total).toBeGreaterThan(0);
    for (let index = 0; index < total; index += 1) {
      await expect(cards.nth(index)).toHaveAttribute("data-status", "candidate");
    }

    await markCategory(page, "time", "confirmed");
    await markCategory(page, "place", "denied");
    await markCategory(page, "result", "unknown");
    await markCategory(page, "behavior", "disputed");

    await expect(page.getByTestId("fact-progress")).toContainText("已确认 1");
    await expect(page.getByTestId("fact-progress")).toContainText("待标记候选");
  });

  test("新增遗漏事实并作为已确认事实纳入分析", async ({ page }) => {
    await startAnalysis(page, NORMAL_TEXT);
    await page.getByTestId("add-fact-input").fill("人员甲目前已在逃，暂未到案。");
    await page.getByTestId("add-fact-submit").click();

    const added = page.locator('[data-testid="fact-list"] [data-category="other"]');
    await expect(added).toHaveCount(1);
    await expect(added).toHaveAttribute("data-status", "confirmed");
    await expect(added).toContainText("民警补充");
  });

  test("删除候选事实只表示不纳入本次分析", async ({ page }) => {
    await startAnalysis(page, NORMAL_TEXT);

    const participant = page
      .locator('[data-testid="fact-list"] [data-category="participant"]')
      .first();
    const cardTestId = await participant.getAttribute("data-testid");
    await participant.getByTestId(/fact-exclude-/).click();

    const excludedSection = page.getByTestId("excluded-facts");
    await expect(excludedSection).toBeVisible();
    const excludedCard = excludedSection.locator(`[data-testid="${cardTestId}"]`);
    await expect(excludedCard).toHaveAttribute("data-status", "excluded");
    await expect(excludedCard).toContainText("不代表确认该事实没有发生");

    await excludedCard.getByRole("button", { name: "重新纳入本次分析" }).click();
    await expect(page.getByTestId("excluded-facts")).toHaveCount(0);
  });
});

test.describe("模糊值", () => {
  test("模糊时间、金额、年龄保留原始表述、规范化范围和精确程度", async ({ page }) => {
    await startAnalysis(page, VAGUE_TEXT);

    const timeValue = page
      .locator('[data-testid="fact-list"] [data-category="time"]')
      .first()
      .locator('[data-testid^="fact-value-"]');
    await expect(timeValue).toContainText("年初");
    await expect(timeValue).toContainText("1月1日 ～ 2月末");
    await expect(timeValue).toContainText("范围值");

    const amountValue = page
      .locator('[data-testid="fact-list"] [data-category="amount"]')
      .first()
      .locator('[data-testid^="fact-value-"]');
    await expect(amountValue).toContainText("一千多元");
    await expect(amountValue).toContainText("1000");
    await expect(amountValue).toContainText("（无上限）");
    await expect(amountValue).toContainText("不完整范围");

    const ageValue = page
      .locator('[data-testid="fact-list"] [data-category="age"]')
      .first()
      .locator('[data-testid^="fact-value-"]');
    await expect(ageValue).toContainText("三十多岁");
    await expect(ageValue).toContainText("30 ～ 39");
    await expect(ageValue).toContainText("范围值");
  });

  test("人员使用中性代号并保留原文对照", async ({ page }) => {
    await startAnalysis(page, VAGUE_TEXT);
    const participants = page.locator('[data-testid="fact-list"] [data-category="participant"]');
    await expect(participants.first()).toContainText("人员甲");
    await expect(participants.first()).toContainText("王某");
    await expect(participants.nth(1)).toContainText("人员乙");
    await expect(participants.nth(1)).toContainText("室友");
  });
});

test.describe("独立事项", () => {
  test("检测到彼此独立的事项时提示拆分分析；连续案情不提示", async ({ page }) => {
    await startAnalysis(page, INDEPENDENT_TEXT);

    const banner = page.getByTestId("split-matters");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("建议拆分分析");
    await expect(banner).toContainText("拆分为多次分析");

    acceptNextDialog(page);
    await page.getByTestId("clear-analysis").click();
    await page.waitForURL(/\/analysis$/);

    await startAnalysis(page, NORMAL_TEXT);
    await expect(page.getByTestId("split-matters")).toHaveCount(0);
  });
});

test.describe("决定性追问", () => {
  test("每题解释为什么需要确认，并允许不知道、尚未核实和存在争议", async ({ page }) => {
    await startAnalysis(page, NORMAL_TEXT);
    await page.getByTestId("start-questions").click();
    await expect(page.getByTestId("decisive-questions-page")).toBeVisible();

    const firstQuestion = page.locator(".question-card").first();
    await expect(firstQuestion.locator(".question-card__why")).toContainText("为什么需要确认");
    for (const kind of ["unknown", "not_verified", "disputed"]) {
      await expect(firstQuestion.getByTestId(new RegExp(`-answer-${kind}$`))).toBeVisible();
    }
  });

  test("追问最多三轮、每轮最多五问、总计最多十二问，达上限后保留不足状态", async ({ page }) => {
    await startAnalysis(page, NORMAL_TEXT);
    await page.getByTestId("start-questions").click();
    await expect(page.getByTestId("decisive-questions-page")).toBeVisible();

    const askedIds = new Set<string>();
    let rounds = 0;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if ((await page.getByTestId("pre-analysis-page").count()) > 0) break;
      rounds += 1;
      const questions = page.locator('[data-testid="question-list"] .question-card');
      const count = await questions.count();
      expect(count).toBeLessThanOrEqual(5);
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const id = await questions.nth(index).getAttribute("data-testid");
        askedIds.add(id ?? "");
        await questions.nth(index).getByTestId(/-answer-unknown$/).click();
      }
      const before = await page.getByTestId("round-progress").innerText();
      await page.getByTestId("submit-round").click();
      await expect
        .poll(
          async () => {
            if ((await page.getByTestId("pre-analysis-page").count()) > 0) return "review";
            // 页面切换期间 round-progress 可能短暂消失；不能在 poll 回调里用无上限的
            // innerText 等待，否则回调会挂住直到 poll 超时。
            const progress = page.getByTestId("round-progress");
            if ((await progress.count()) === 0) return before;
            return progress.innerText({ timeout: 2_000 }).catch(() => before);
          },
          { timeout: 15_000 },
        )
        .not.toBe(before);
    }

    expect(rounds).toBeLessThanOrEqual(3);
    expect(askedIds.size).toBeLessThanOrEqual(12);

    await expect(page.getByTestId("pre-analysis-page")).toBeVisible();
    await expect(page.getByTestId("limit-note")).toContainText("追问已达到上限");
    await expect(page.getByTestId("gap-list")).toContainText("剩余决定性缺口");
    await expect(page.getByTestId("expected-note")).toContainText("条件不足");
  });
});

test.describe("报告前紧急核验提示", () => {
  test("已确认的紧急风险事实触发报告前核验提示", async ({ page }) => {
    await startAnalysis(page, URGENT_TEXT);
    await markCategory(page, "behavior", "confirmed");
    await runRoundsUntilReview(page);

    const prompt = page.getByTestId("urgent-prompts").getByTestId("urgent-prompt-personal_safety");
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("报告前核验提示");
    await expect(prompt).toContainText("触发的已确认事实");
    await expect(prompt).toContainText("持刀");
    await expect(prompt).toContainText("需要立即人工核验");
    await expect(prompt).toContainText("不构成自动处置");
  });

  test("未经确认的危险关键词只触发中性安全问题，不显示紧急结论", async ({ page }) => {
    await startAnalysis(page, URGENT_TEXT);
    // 不确认任何事实，直接开始追问。
    await page.getByTestId("start-questions").click();
    await expect(page.getByTestId("decisive-questions-page")).toBeVisible();

    // 第一轮包含中性安全核实问题，但不出现已认定的紧急结论。
    const safetyQuestion = page.locator(".question-card--safety");
    await expect(safetyQuestion).toHaveCount(1);
    await expect(safetyQuestion).toContainText("紧急危险");
    await expect(page.getByTestId("decisive-questions-page")).not.toContainText("触发的已确认事实");

    await answerRound(page, "unknown");
    if ((await page.getByTestId("pre-analysis-page").count()) === 0) {
      await expect(page.locator(".question-card--safety")).toHaveCount(0);
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if ((await page.getByTestId("pre-analysis-page").count()) > 0) break;
      await answerRound(page, "unknown");
    }

    await expect(page.getByTestId("pre-analysis-page")).toBeVisible();
    await expect(page.getByTestId("urgent-prompts")).toHaveCount(0);
  });
});

test.describe("分析前确认", () => {
  test("分别展示确认、否认、未知和争议事实、缺口及预期限制，确认后形成不可变快照", async ({ page }) => {
    await startAnalysis(page, NORMAL_TEXT);
    await markCategory(page, "time", "confirmed");
    await markCategory(page, "place", "denied");
    await markCategory(page, "result", "unknown");
    await markCategory(page, "behavior", "disputed");
    await page.getByTestId("add-fact-input").fill("双方系邻里关系。");
    await runRoundsUntilReview(page);

    await expect(page.getByTestId("summary-group-confirmed")).toBeVisible();
    await expect(page.getByTestId("summary-group-denied")).toBeVisible();
    await expect(page.getByTestId("summary-group-unknown")).toBeVisible();
    await expect(page.getByTestId("summary-group-disputed")).toBeVisible();
    await expect(page.getByTestId("gap-list")).toContainText("剩余决定性缺口");
    await expect(page.getByTestId("expected-note")).toContainText("预期限制");

    acceptNextDialog(page);
    await page.getByTestId("confirm-snapshot").click();

    await expect(page.getByTestId("snapshot-panel")).toBeVisible();
    await expect(page.getByTestId("snapshot-version")).toHaveText("v1");
    const hash = await page.getByTestId("snapshot-hash").innerText();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // 快照锁定后事实页只读。
    await page.locator(".back-link", { hasText: "返回事实确认" }).click();
    await expect(page.getByTestId("analysis-locked")).toContainText("已确认并锁定");
    await expect(page.getByTestId("start-questions")).toHaveCount(0);
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
    await page.waitForURL(/\/analysis\/facts$/);

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
