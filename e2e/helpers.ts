import { expect, type APIRequestContext } from "@playwright/test";

export interface FixturePatch {
  difyAvailable?: boolean;
  eligibleExampleCount?: number;
}

/** 修改外部边界的确定性替身状态。 */
export async function setFixture(request: APIRequestContext, patch: FixturePatch): Promise<void> {
  const response = await request.post("/api/test/fixtures", { data: patch });
  expect(response.ok(), `替身控制失败：${response.status()}`).toBeTruthy();
}

/** 恢复替身默认状态：分析服务可用、当前批次有一个合格范例。 */
export async function resetFixture(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/test/fixtures/reset");
  expect(response.ok(), `替身重置失败：${response.status()}`).toBeTruthy();
}
