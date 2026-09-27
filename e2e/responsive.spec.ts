import { expect, test } from "@playwright/test";
import { resetFixture, setFixture } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetFixture(request);
});

const portraitViewports = [
  { label: "360", width: 360, height: 640 },
  { label: "430", width: 430, height: 932 },
];

for (const viewport of portraitViewports) {
  test(`在 ${viewport.width}×${viewport.height} 竖屏下无横向滚动且主要点击目标不小于 44×44`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await expect(page.getByTestId("primary-entries")).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    for (const id of ["entry-action-caseAnalysis", "entry-action-documentExamples"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}

test("关键状态不只依赖颜色表达", async ({ page, request }) => {
  await setFixture(request, { exampleStatusAll: "withdrawn" });
  await page.goto("/");

  const status = page.getByTestId("entry-status-documentExamples");
  await expect(status).toContainText("暂不可用");
  await expect(status).toContainText("!");
});
