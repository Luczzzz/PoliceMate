import type { ReportTraceLink } from "@policymate/contracts";

/**
 * 报告可解释链路与依据事实明细。
 *
 * 每条依据事实展示确认状态标签、类别、结构化陈述与原始表述；确认状态只取
 * 契约字段 `confirmationLabel`，页面不自行拼写（ADR-0008 第 2 点）。
 * 通用模块与临时工作台共用同一渲染，避免两处口径漂移。
 */
export function ReportBasisLinks({
  moduleId,
  traceLinks,
}: {
  moduleId: string;
  traceLinks: ReportTraceLink[];
}) {
  if (traceLinks.length === 0) return null;
  return (
    <details>
      <summary>查看可解释链路（{traceLinks.length}）</summary>
      {traceLinks.map((trace, traceIndex) => (
        <div key={traceIndex} className="trace-link">
          {trace.factReferences.length > 0 ? (
            <ul className="basis-list" data-testid={`basis-list-${moduleId}-${traceIndex}`}>
              {trace.factReferences.map((reference) => (
                <li
                  key={reference.factId}
                  className="basis-fact"
                  data-testid={`basis-fact-${moduleId}-${traceIndex}-${reference.factId}`}
                  data-confirmation={reference.confirmation}
                >
                  <span
                    className="basis-fact__confirmation"
                    data-testid={`basis-confirmation-${moduleId}-${traceIndex}-${reference.factId}`}
                  >
                    {reference.confirmationLabel}
                  </span>
                  <span className="basis-fact__category">{reference.categoryLabel}</span>
                  <span className="basis-fact__statement">{reference.statement}</span>
                  <span className="basis-fact__original">原文：{reference.originalWording}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>事实：{trace.factIds.join("、")}</p>
          )}
          <p>
            条件：{trace.condition} → {trace.conditionStatus}
          </p>
          <p>判断：{trace.judgment}</p>
          {trace.basis ? (
            <p>
              依据：{trace.basis.title} {trace.basis.article}（{trace.basis.issuingAuthority}，
              {trace.basis.status}）
            </p>
          ) : null}
        </div>
      ))}
    </details>
  );
}
