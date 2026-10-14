import { expect, test, type Page } from "@playwright/test";

/**
 * 流式纯文本分析（ADR-0015）：案情输入框 + 一个结果文本框，文字逐段出现。
 * 由独立的流式实例（PM_REPORT_FORMAT=stream）驱动，替身行为用 streamMode 控制。
 */

const CASE_TEXT = "叶某昨晚酒后在东门烧烤将李某打伤，双方因上菜顺序起争执。";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

async function open(page: Page): Promise<void> {
  await page.goto("/analysis");
  await expect(page.getByTestId("stream-analysis")).toBeVisible();
}

async function submit(page: Page): Promise<void> {
  await page.getByTestId("stream-case-input").fill(CASE_TEXT);
  await page.getByTestId("stream-submit").click();
}

test("提交后文字逐段出现在同一个文本框，完成后显示固定声明并可复制", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await expect(page.getByTestId("stream-copy")).toBeDisabled();
  await submit(page);

  // 逐段：先看到第一小节，此时还没有最后一小节，也还没有声明。
  await expect(page.getByTestId("stream-output")).toContainText("案件定性");
  await expect(page.getByTestId("stream-output")).not.toContainText("法律条文原文节选");
  await expect(page.getByTestId("stream-status")).toContainText("正在生成");
  await expect(page.getByTestId("stream-copy")).toBeDisabled();

  await expect(page.getByTestId("stream-output")).toContainText("法律条文原文节选", { timeout: 10_000 });
  await expect(page.getByTestId("stream-disclaimer")).toContainText("不构成正式法律意见");
  await expect(page.getByTestId("stream-status")).toHaveCount(0);
  await expect(page.getByTestId("stream-copy")).toBeEnabled();

  await page.getByTestId("stream-copy").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("案件定性");
  expect(copied).toContain("法律条文原文节选");
  await expect(page.getByTestId("stream-retention-hint")).toContainText("刷新");
});

test("点击停止：保留已出文字，标明不完整，复制禁用，可重新生成", async ({ page, request }) => {
  await request.post("/api/test/fixtures", { data: { streamMode: "slow" } });
  await open(page);
  await submit(page);
  await expect(page.getByTestId("stream-output")).toContainText("案件定性");
  await page.getByTestId("stream-stop").click();

  await expect(page.getByTestId("stream-status")).toContainText("已停止，内容不完整");
  await expect(page.getByTestId("stream-output")).toContainText("案件定性");
  await expect(page.getByTestId("stream-copy")).toBeDisabled();
  await expect(page.getByTestId("stream-stop")).toHaveCount(0);

  await request.post("/api/test/fixtures", { data: { streamMode: "normal" } });
  await page.getByTestId("stream-regenerate").click();
  await expect(page.getByTestId("stream-output")).toContainText("法律条文原文节选", { timeout: 10_000 });
  await expect(page.getByTestId("stream-copy")).toBeEnabled();
});

test("上游中途失败：保留已出文字，标明生成中断，不自动重试，复制禁用", async ({ page, request }) => {
  await request.post("/api/test/fixtures", { data: { streamMode: "fail_midway" } });
  await open(page);
  await submit(page);
  await expect(page.getByTestId("stream-status")).toContainText("生成中断，内容不完整");
  await expect(page.getByTestId("stream-output")).toContainText("案件定性");
  await expect(page.getByTestId("stream-output")).not.toContainText("法律条文原文节选");
  await expect(page.getByTestId("stream-copy")).toBeDisabled();
  await expect(page.getByTestId("stream-regenerate")).toBeVisible();
  await expect(page.getByTestId("stream-disclaimer")).toBeVisible();
});

test("分析服务不可用时入口失败关闭，不显示输入框", async ({ page, request }) => {
  await request.post("/api/test/fixtures", { data: { difyAvailable: false } });
  await page.goto("/analysis");
  await expect(page.getByTestId("capability-unavailable")).toBeVisible();
  await expect(page.getByTestId("stream-case-input")).toHaveCount(0);
});
