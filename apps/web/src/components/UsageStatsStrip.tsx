import type { UsageStatsResponse } from "@policymate/contracts";
import { useJsonResource } from "../hooks/useJsonResource";

const NUMBER_FORMAT = new Intl.NumberFormat("zh-Hans-CN");

/**
 * 首页匿名使用统计条。
 *
 * 只显示后端累加的今日与累计入口受理次数。它不是个人历史、热门排行或行为分析，
 * 不提供点击、筛选或下钻；读取失败时显示占位而不阻断首页其他内容。
 */
export function UsageStatsStrip() {
  const { state } = useJsonResource<UsageStatsResponse>("/api/v1/usage-stats", {
    timeoutMs: 6000,
  });
  const ready = state.status === "ready";
  const unavailable = state.status === "error";

  return (
    <section className="usage-stats" aria-labelledby="usage-stats-title" data-testid="usage-stats">
      <div className="usage-stats__intro">
        <h2 className="usage-stats__title" id="usage-stats-title">
          试行使用情况
        </h2>
        <p className="usage-stats__note">
          {unavailable ? "使用统计暂不可用，不影响其他入口。" : "三个入口的受理次数，不含任何案情内容。"}
        </p>
      </div>
      <dl className="usage-stats__figures" aria-busy={state.status === "loading"}>
        <div className="usage-stat">
          <dt className="usage-stat__label">今日使用</dt>
          <dd className="usage-stat__value" data-testid="usage-today">
            {ready ? NUMBER_FORMAT.format(state.data.today) : "—"}
          </dd>
        </div>
        <span className="usage-stats__divider" aria-hidden="true" />
        <div className="usage-stat">
          <dt className="usage-stat__label">累计使用</dt>
          <dd className="usage-stat__value" data-testid="usage-total">
            {ready ? NUMBER_FORMAT.format(state.data.total) : "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
