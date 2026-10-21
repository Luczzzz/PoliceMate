import { expect, test } from "@playwright/test";
import { resetFixture, setFixture } from "./helpers";

const caseText = "昨天傍晚在城南路口，一辆小客车与一辆电动自行车相撞，骑车人受轻伤。";

test.beforeEach(async ({ request }) => {
  await resetFixture(request);
});
test.describe("交通事故责任认定辅助", () => {
  test("从首页进入，提交事故概况后得到第一个追问", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("entry-accidentLiability")).toHaveAttribute("data-available", "true");
    await page.getByTestId("entry-action-accidentLiability").click();

    await expect(page).toHaveURL(/\/accident-liability$/);
    await expect(page.getByTestId("capability-accidentLiability")).toBeVisible();
    await expect(page.getByTestId("accident-deidentification-notice")).toBeVisible();

    await page.getByTestId("accident-case-input").fill(caseText);
    await page.getByTestId("accident-start").click();

    await expect(page.getByTestId("accident-turns")).toBeVisible();
    await expect(page.getByTestId("accident-turn-officer")).toContainText("小客车");
    await expect(page.getByTestId("accident-turn-assistant")).toContainText("信号灯");
    await expect(page.getByTestId("accident-answer-input")).toBeVisible();
    await expect(page.getByTestId("accident-report")).toHaveCount(0);
  });

  test("回答追问后生成研判意见，四个小节与固定边界声明齐备", async ({ page }) => {
    await page.goto("/accident-liability");
    await page.getByTestId("accident-case-input").fill(caseText);
    await page.getByTestId("accident-start").click();
    await expect(page.getByTestId("accident-answer-input")).toBeVisible();

    await page.getByTestId("accident-answer-input").fill("小客车直行，电动自行车左转，路口有信号灯。");
    await page.getByTestId("accident-submit-answer").click();

    const report = page.getByTestId("accident-report");
    await expect(report).toBeVisible();
    for (const section of ["【责任认定】", "法律依据", "程序要点", "关键事实"]) {
      await expect(report).toContainText(section);
    }
    await expect(page.getByTestId("accident-disclaimer")).toContainText("不构成正式法律意见");
    await expect(page.getByTestId("accident-disclaimer")).toContainText("道路交通事故认定书");
    // 完整问答记录随报告保留。
    await expect(page.getByTestId("accident-turns")).toContainText("信号灯");
    // 报告生成后不再提供追问输入。
    await expect(page.getByTestId("accident-answer-input")).toHaveCount(0);

    // 竖屏无横向滚动。
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test("民警可以随时主动要求直接生成研判意见", async ({ page }) => {
    await page.goto("/accident-liability");
    await page.getByTestId("accident-case-input").fill(caseText);
    await page.getByTestId("accident-start").click();
    await expect(page.getByTestId("accident-answer-input")).toBeVisible();

    await page.getByTestId("accident-generate-now").click();
    await expect(page.getByTestId("accident-report")).toBeVisible();
    await expect(page.getByTestId("accident-copy")).toBeVisible();
  });

  test("服务不可用时入口失败关闭，直接访问也显示暂不可用", async ({ page, request }) => {
    await setFixture(request, { analysisAvailable: false });
    await page.goto("/");

    await expect(page.getByTestId("entry-accidentLiability")).toHaveAttribute("data-available", "false");
    await expect(page.getByTestId("entry-reason-accidentLiability")).toBeVisible();

    await page.goto("/accident-liability");
    await expect(page.getByTestId("capability-unavailable")).toBeVisible();
    await expect(page.getByTestId("capability-unavailable-reason")).toContainText("分析服务");
  });

  test("等待回答时显示与案情分析同构的弹窗：真实阶段、已等待秒数与取消", async ({ page, request }) => {
    await setFixture(request, { accidentMode: "slow" });
    await page.goto("/accident-liability");
    await page.getByTestId("accident-case-input").fill(caseText);
    await page.getByTestId("accident-start").click();

    const progress = page.getByTestId("accident-progress");
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute("role", "alertdialog");
    await expect(page.getByTestId("accident-progress-stage")).toContainText("正在分析事故概况");
    await expect(page.getByTestId("accident-progress-elapsed")).toContainText("已等待");

    // 取消后按“已取消”展示，不是失败；输入不清空，可直接重试。
    await page.getByTestId("accident-progress-cancel").click();
    await expect(page.getByTestId("accident-progress")).toHaveCount(0);
    await expect(page.getByTestId("accident-cancelled")).toBeVisible();
    await expect(page.getByTestId("accident-failure")).toHaveCount(0);
    await expect(page.getByTestId("accident-case-input")).toHaveValue(caseText);

    // 重试成功，弹窗自行关闭。
    await setFixture(request, { accidentMode: "normal" });
    await page.getByTestId("accident-start").click();
    await expect(page.getByTestId("accident-answer-input")).toBeVisible();
    await expect(page.getByTestId("accident-progress")).toHaveCount(0);
  });

  test("生成研判意见时弹窗显示对应阶段", async ({ page, request }) => {
    await page.goto("/accident-liability");
    await page.getByTestId("accident-case-input").fill(caseText);
    await page.getByTestId("accident-start").click();
    await expect(page.getByTestId("accident-answer-input")).toBeVisible();

    await setFixture(request, { accidentMode: "slow" });
    await page.getByTestId("accident-generate-now").click();
    await expect(page.getByTestId("accident-progress-stage")).toContainText("正在生成研判意见");
    await expect(page.getByTestId("accident-report")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("accident-progress")).toHaveCount(0);
  });
});
