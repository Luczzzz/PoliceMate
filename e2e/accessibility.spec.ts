import { expect, test, type Page } from "@playwright/test";
import { reachReport } from "./report-flow";

/**
 * 可访问性与现场可读性验收（规格 15.2）。
 *
 * 覆盖系统字体放大、屏幕阅读器读取顺序、键盘焦点顺序、对比度、
 * 非颜色状态与减少动态效果。全部通过移动浏览器黑盒驱动。
 */

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/fixtures/reset");
});

/** 计算元素文字相对其有效背景的对比度（WCAG 相对亮度）。 */
async function contrastRatio(page: Page, selector: string): Promise<number> {
  return page.evaluate((query) => {
    const element = document.querySelector(query);
    if (element === null) throw new Error(`缺少元素 ${query}`);
    const parse = (value: string): [number, number, number, number] => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (match === null) throw new Error(`无法解析颜色 ${value}`);
      const parts = match[1].split(",").map((part) => Number(part.trim()));
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    };
    const luminance = ([r, g, b]: [number, number, number, number]): number => {
      const channel = (raw: number) => {
        const value = raw / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    let background: [number, number, number, number] = [255, 255, 255, 1];
    let node: Element | null = element;
    while (node !== null) {
      const candidate = parse(getComputedStyle(node).backgroundColor);
      if (candidate[3] >= 1) {
        background = candidate;
        break;
      }
      node = node.parentElement;
    }
    const foreground = parse(getComputedStyle(element).color);
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  }, selector);
}

test("系统字体放大到 200% 时关键内容不被截断且仍可操作", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("primary-entries")).toBeVisible();

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });

  // 关键内容与入口仍完整可见。
  await expect(page.getByTestId("entry-action-caseAnalysis")).toBeVisible();
  await expect(page.getByTestId("entry-action-documentExamples")).toBeVisible();
  await expect(page.locator("h1")).toBeVisible();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  // 关键点击目标不被文字放大挤没，仍满足约 44×44。
  for (const id of ["entry-action-caseAnalysis", "entry-action-documentExamples"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("屏幕阅读器可依次读取总体状态、主判断与固定六模块索引", async ({ page }) => {
  await reachReport(page);

  const order = await page.evaluate(() => {
    const findByTestId = (id: string): Element | null =>
      document.querySelector(`[data-testid="${id}"]`);
    const status = findByTestId("report-status");
    const headline = findByTestId("report-headline");
    const index = findByTestId("report-module-index");
    if (status === null || headline === null || index === null) {
      return { ok: false, reason: "缺少报告关键元素" };
    }
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const indexLinks = [...index.querySelectorAll("a")].map((link) =>
      link.getAttribute("href") ?? "",
    );
    const moduleIds = [
      ...[...document.querySelectorAll(".report-module")].map((section) => section.id),
    ].filter((id) => id !== "");
    return {
      ok:
        before(status, headline) &&
        before(headline, index) &&
        indexLinks.length === 6 &&
        indexLinks.every((href, position) => href === `#${moduleIds[position]}`),
      reason: `status→headline→index=${before(status, headline) && before(headline, index)}；索引=${indexLinks.join(",")}；模块=${moduleIds.join(",")}`,
    };
  });
  expect(order.ok, order.reason).toBe(true);

  // 索引条目具有明确可访问名称，并可跳转到对应模块。
  const firstLink = page.getByTestId("report-index-preliminary_qualification");
  await expect(firstLink).toHaveText(/初步定性/);
});

test("键盘焦点顺序与视觉阅读顺序一致且焦点可见", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("primary-entries")).toBeVisible();

  // 第一个可聚焦元素是跳转链接，且具有可见焦点样式。
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => document.activeElement?.className ?? "");
  expect(first).toContain("skip-link");

  const outline = await page.evaluate(() => {
    const element = document.activeElement;
    if (element === null) return { style: "", width: "" };
    const computed = getComputedStyle(element);
    return { style: computed.outlineStyle, width: computed.outlineWidth };
  });
  expect(outline.style).not.toBe("none");

  // 焦点继续按阅读顺序进入两个主入口。
  const focused: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Tab");
    focused.push(
      await page.evaluate(() => {
        const element = document.activeElement;
        return element?.getAttribute("data-testid") ?? element?.textContent?.trim() ?? "";
      }),
    );
  }
  expect(focused.some((value) => value.includes("entry-action-caseAnalysis"))).toBe(true);
  expect(focused.some((value) => value.includes("entry-action-documentExamples"))).toBe(true);
});

test("正文与关键状态达到最小对比度且状态不只依赖颜色", async ({ page }) => {
  await reachReport(page);

  const statusRatio = await contrastRatio(page, '[data-testid="report-status"]');
  expect(statusRatio).toBeGreaterThanOrEqual(3);
  const headlineRatio = await contrastRatio(page, '[data-testid="report-headline"]');
  expect(headlineRatio).toBeGreaterThanOrEqual(3);

  // 状态使用文字，不只依赖颜色；入口状态同样带文字。
  await expect(page.getByTestId("report-status")).not.toHaveText("");
  await page.goto("/");
  await expect(page.getByTestId("entry-status-documentExamples")).toContainText("服务可用");
});

test("减少动态效果设置下不依赖动画完成任务", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("primary-entries")).toBeVisible();

  const duration = await page.evaluate(() => {
    const button = document.querySelector(".button");
    if (button === null) return "missing";
    return getComputedStyle(button).transitionDuration;
  });
  // 减少动态效果时过渡时长被压到接近 0（不是 140ms 等常规时长）。
  expect(duration).not.toBe("missing");
  const seconds = duration
    .split(",")
    .map((part) => part.trim())
    .map((part) => (part.endsWith("ms") ? Number(part.slice(0, -2)) / 1000 : Number(part.slice(0, -1))));
  expect(Math.max(...seconds)).toBeLessThanOrEqual(0.002);

  // 入口任务不依赖动画完成：点击后直接进入入口页。
  await page.getByTestId("entry-action-caseAnalysis").click();
  await expect(page.getByTestId("case-input")).toBeVisible();
});
