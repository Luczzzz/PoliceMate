import { expect, type APIRequestContext } from "@playwright/test";
import type { FixtureControlRequest } from "@policymate/contracts";

export type FixturePatch = FixtureControlRequest;

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

/**
 * 直接调用受保护 API 时所需的请求头。浏览器页面会自动携带短期匿名令牌；
 * 测试中的 APIRequestContext 需要显式获取一次。
 */
export async function apiHeaders(
  request: APIRequestContext,
): Promise<Record<string, string>> {
  const response = await request.post("/api/v1/anonymous-tokens", {
    headers: { "x-pm-contract-version": "1.0" },
  });
  expect(response.ok(), `匿名令牌获取失败：${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { token: string };
  return { "x-pm-contract-version": "1.0", "x-pm-anonymous-token": body.token };
}
