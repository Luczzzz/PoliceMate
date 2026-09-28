import { expect, test, type Page } from "@playwright/test";

/**
 * 报告临时工作台、补充或修改事实、报告失效与文书任务候选跳转。
 *
 * 全部通过移动浏览器黑盒驱动 H5 → PoliceMate 后端；临时标记与筛选只存在于
 * 当前标签页内存，不写入事实快照、URL、存储或后端。
 */

const TEXT = "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

async function startAndConfirmFacts(page: Page): Promise<void> {
  await page.goto("/analysis");
  await page.getByTestId("case-text-input").fill(TEXT);
  await page.getByTestId("case-input-submit").click();
  await page.waitForURL(/\/analysis\/facts$/);
  const timeCard = page.locator('[data-testid="fact-list"] [data-category="time"]').first();
  await timeCard.getByTestId(/fact-mark-.*-confirmed/).click();
  await expect(timeCard).toHaveAttribute("data-status", "confirmed");
}

async function answerRound(page: Page): Promise<void> {
  const before = await page.getByTestId("round-progress").innerText();
  const questions = page.locator('[data-testid="question-list"] .question-card');
  const count = await questions.count();
  for (let index = 0; index < count; index += 1) {
    const card = questions.nth(index);
    await card.getByTestId(/-answer-value$/).click();
    await card.locator("textarea").fill("已核实的情况说明。");
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

async function answerAllRounds(page: Page): Promise<void> {
  await page.getByTestId("start-questions").click();
  await expect(page.getByTestId("decisive-questions-page")).toBeVisible();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await page.getByTestId("pre-analysis-page").count()) > 0) return;
    await answerRound(page);
  }
  await expect(page.getByTestId("pre-analysis-page")).toBeVisible();
}

async function confirmSnapshotAndGenerate(page: Page): Promise<void> {
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("confirm-snapshot").click();
  await expect(page.getByTestId("snapshot-panel")).toBeVisible();
  await page.getByTestId("go-report").click();
  await page.waitForURL(/\/analysis\/report$/);
  await page.getByTestId("generate-report").click();
  await expect(page.getByTestId("analysis-report")).toBeVisible({ timeout: 20_000 });
}

/** 从报告进入修改后的再分析：回答问题并在分析前确认页重新确认快照。 */
async function reanalyzeAfterModification(page: Page): Promise<void> {
  if ((await page.getByTestId("decisive-questions-page").count()) > 0) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if ((await page.getByTestId("pre-analysis-page").count()) > 0) return;
      await answerRound(page);
    }
  }
  await confirmSnapshotAndGenerate(page);
}

async function reachReport(page: Page): Promise<void> {
  await startAndConfirmFacts(page);
  await answerAllRounds(page);
  await confirmSnapshotAndGenerate(page);
}

test.describe("报告临时工作台", () => {
  test("展开折叠、两个可同时存在的临时标记、筛选 X/Y 与清除筛选", async ({ page }) => {
    await reachReport(page);

    // 证据清单与询问要点都以结构化项目呈现。
    await expect(page.getByTestId("report-module-evidence_checklist")).toBeVisible();
    await expect(page.getByTestId("report-module-interview_points")).toBeVisible();
    await expect(page.getByTestId("workbench-boundary-evidence")).toContainText("不代表证据已经取得");

    // 两个标记同时存在。
    await page.getByTestId("workbench-reviewed-ev-01").click();
    await page.getByTestId("workbench-focus-ev-01").click();
    await expect(page.getByTestId("workbench-reviewed-ev-01")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("workbench-focus-ev-01")).toHaveAttribute("aria-pressed", "true");
    // 筛选前隐藏计数，仅显示全部。
    await expect(page.getByTestId("workbench-count-evidence")).toHaveCount(0);

    // 按临时标记筛选：只改变可见性，显示 X/Y 和清除筛选。
    await page.getByTestId("workbench-filter-mark-reviewed-evidence").click();
    await expect(page.getByTestId("workbench-count-evidence")).toHaveText("当前显示 1 项，共 3 项");
    await expect(page.getByTestId("workbench-item-ev-02")).toHaveCount(0);
    await page.getByTestId("workbench-clear-evidence").click();
    await expect(page.getByTestId("workbench-item-ev-02")).toBeVisible();

    // 证据清单可按优先级与当前掌握状态筛选。
    await page.getByTestId("workbench-filter-priority-high-evidence").click();
    await expect(page.getByTestId("workbench-count-evidence")).toHaveText("当前显示 1 项，共 3 项");
    await page.getByTestId("workbench-filter-status-unknown-evidence").click();
    await expect(page.getByTestId("workbench-count-evidence")).toHaveText("当前显示 0 项，共 3 项");
    await page.getByTestId("workbench-clear-evidence").click();

    // 询问要点可按询问对象角色筛选。
    await page.getByTestId("workbench-filter-role-suspect-interview").click();
    await expect(page.getByTestId("workbench-count-interview")).toHaveText("当前显示 1 项，共 3 项");
    await page.getByTestId("workbench-item-iv-02").waitFor({ state: "detached" });
    await page.getByTestId("workbench-clear-interview").click();
    await expect(page.getByTestId("workbench-item-iv-02")).toBeVisible();

    // 折叠与展开。
    await page.getByTestId("workbench-collapse-evidence").click();
    await expect(page.getByTestId("workbench-list-evidence")).toHaveCount(0);
    await page.getByTestId("workbench-collapse-evidence").click();
    await expect(page.getByTestId("workbench-list-evidence")).toBeVisible();
  });

  test("标记与筛选不写入 URL、不触发后端请求、不改变报告结论", async ({ page }) => {
    await reachReport(page);
    const headline = await page.getByTestId("analysis-report").locator("h1").innerText();
    const urlBefore = page.url();

    const mutations: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/api/")) {
        mutations.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.getByTestId("workbench-reviewed-ev-01").click();
    await page.getByTestId("workbench-focus-iv-01").click();
    await page.getByTestId("workbench-filter-mark-focus-evidence").click();

    expect(page.url()).toBe(urlBefore);
    expect(page.url()).not.toMatch(/reviewed|focus|filter/);
    expect(mutations).toHaveLength(0);
    await expect(page.getByTestId("analysis-report").locator("h1")).toHaveText(headline);

    // 不提供完成率、自由备注、附件、导出、打印、分享等被禁止的临时工作台能力。
    const body = await page.getByTestId("analysis-report").innerText();
    for (const forbidden of ["完成率", "备注", "附件", "导出", "打印", "分享", "拖拽"]) {
      expect(body).not.toContain(forbidden);
    }
  });

  test("同一报告有效时在页面间往返保留临时标记", async ({ page }) => {
    await reachReport(page);
    await page.getByTestId("workbench-reviewed-ev-01").click();
    await expect(page.getByTestId("workbench-reviewed-ev-01")).toHaveAttribute("aria-pressed", "true");

    // 产品内导航（不刷新页面）后返回报告，临时标记随当前有效报告保留。
    await page.getByRole("link", { name: "返回分析前确认" }).click();
    await page.waitForURL(/\/analysis\/review$/);
    await page.getByTestId("go-report").click();
    await page.waitForURL(/\/analysis\/report$/);
    await expect(page.getByTestId("analysis-report")).toBeVisible();
    await expect(page.getByTestId("workbench-reviewed-ev-01")).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("补充或修改事实与报告失效", () => {
  test("修改确认前旧报告可见并显示“修改尚未应用”，放弃修改可恢复", async ({ page }) => {
    await reachReport(page);
    await page.getByTestId("workbench-reviewed-ev-01").click();

    await page.getByTestId("begin-modification").click();
    await page.waitForURL(/\/analysis\/modify$/);
    await expect(page.getByTestId("modification-unapplied")).toContainText("修改尚未应用");

    // 新增事实；确认前旧报告仍可见并显示“修改尚未应用”。
    await page.getByTestId("modify-add-fact-input").fill("双方此前存在邻里纠纷。");
    await page.getByTestId("modify-add-fact-submit").click();
    await expect(page.getByTestId("modify-fact-list")).toContainText("双方此前存在邻里纠纷");

    // 产品内导航回报告：旧报告仍可见并显示“修改尚未应用”。
    await page.getByRole("link", { name: "返回当前有效报告" }).click();
    await page.waitForURL(/\/analysis\/report$/);
    await expect(page.getByTestId("analysis-report")).toBeVisible();
    await expect(page.getByTestId("modification-pending")).toContainText("修改尚未应用");
    await page.getByTestId("continue-modification").click();
    await page.waitForURL(/\/analysis\/modify$/);

    // 放弃修改：恢复进入修改前的事实与快照，旧报告保持有效。
    await page.getByTestId("discard-modification").click();
    await page.waitForURL(/\/analysis\/report$/);
    await expect(page.getByTestId("analysis-report")).toBeVisible();
    await expect(page.getByTestId("begin-modification")).toBeVisible();
    // 同一份旧报告的临时标记随报告一起保留（未确认修改不使旧报告失效）。
    await expect(page.getByTestId("workbench-reviewed-ev-01")).toHaveAttribute("aria-pressed", "true");
  });

  test("替代或争议事实必须由民警显式选择，确认新快照后旧报告失效且状态不迁移", async ({ page }) => {
    await reachReport(page);
    const oldSnapshotLabel = await page.getByTestId("analysis-report").locator("dd").nth(1).innerText();
    await page.getByTestId("workbench-reviewed-ev-01").click();
    await page.getByTestId("workbench-focus-ev-01").click();
    await page.getByTestId("workbench-filter-priority-high-evidence").click();
    await page.getByTestId("workbench-collapse-evidence").click();

    await page.getByTestId("begin-modification").click();
    await page.waitForURL(/\/analysis\/modify$/);

    // 创建替代事实项：进入修改后才出现修改入口。
    const firstFact = page.locator('[data-testid="modify-fact-list"] .fact-card').first();
    const factTestId = await firstFact.getAttribute("data-testid");
    await firstFact.getByTestId(/revision-open-/).click();
    await firstFact.getByTestId(/revision-input-/).fill("修正后的表述。");
    await firstFact.getByTestId(/revision-replace-/).click();
    await expect(page.getByTestId("modify-fact-list")).toContainText("修正后的表述");

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("confirm-modification").click();
    await page.waitForURL(/\/analysis\/(questions|review)$/);
    expect(factTestId).not.toBeNull();

    await reanalyzeAfterModification(page);

    // 旧报告已失效：新报告绑定到新的事实快照。
    const newSnapshotLabel = await page.getByTestId("analysis-report").locator("dd").nth(1).innerText();
    expect(newSnapshotLabel).not.toBe(oldSnapshotLabel);
    // 新报告不得按项目 ID、文本或相似度迁移旧临时标记。
    await expect(page.getByTestId("workbench-reviewed-ev-01")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("workbench-focus-ev-01")).toHaveAttribute("aria-pressed", "false");
    // 旧报告的筛选与折叠状态一并重置（默认显示全部且展开）。
    await expect(page.getByTestId("workbench-count-evidence")).toHaveCount(0);
    await expect(page.getByTestId("workbench-list-evidence")).toBeVisible();
    await expect(page.getByTestId("workbench-empty-evidence")).toHaveCount(0);
  });
});

test.describe("报告文书任务候选跳转", () => {
  test("只按结构化条件筛选候选，展示差异与选择前需核验，不自动选择唯一范例", async ({ page }) => {
    await reachReport(page);

    await expect(page.getByTestId("document-tasks")).toBeVisible();
    await page.getByTestId("document-task-open-task-reception-register").click();
    await page.waitForURL(/\/documents$/);

    await expect(page.getByTestId("task-candidates-count")).toContainText("候选变体");
    await expect(page.getByTestId("task-selection-boundary")).toContainText("不代表必须制作");
    const candidates = page.getByTestId("task-candidate-list").locator(".task-candidate");
    await expect(candidates).toHaveCount(2);
    await expect(page.getByTestId("task-candidate-doc-test-reception-register")).toContainText("选择前需核验");
    await expect(page.getByTestId("task-candidate-doc-test-reception-register")).toContainText("差异说明");
    // URL 不含任何案情事实或筛选标签。
    expect(page.url()).not.toMatch(/受案|接报|案情/);

    // 仍可返回分类浏览，未自动进入某个唯一范例详情。
    await page.getByTestId("task-back-to-browse").click();
    await expect(page.getByTestId("documents-index")).toBeVisible();
  });
});
