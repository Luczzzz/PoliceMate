import type { LegalSourceStatus, ReportTraceLink } from "@policymate/contracts";

const SOURCE_STATUS_LABELS: Record<LegalSourceStatus, string> = {
  current: "现行有效",
  future: "尚未生效",
  superseded: "已被替代",
  repealed: "已废止",
  uncertain: "效力待核实",
};

const CONDITION_LABELS: Record<ReportTraceLink["conditionStatus"], string> = {
  satisfied: "条件满足",
  not_satisfied: "条件不满足",
  unknown: "尚待核实",
  conflicting: "存在争议",
};

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
    <details className="report-basis">
      <summary>事实与法律依据（{traceLinks.length} 条链路）</summary>
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
          <dl className="trace-link__details">
            <div><dt>适用条件</dt><dd>{trace.condition} · {CONDITION_LABELS[trace.conditionStatus]}</dd></div>
            <div><dt>核验判断</dt><dd>{trace.judgment}</dd></div>
          </dl>
          {trace.basis ? (
            <p>
              依据：{trace.basis.title} {trace.basis.article}（{trace.basis.issuingAuthority}，
              {SOURCE_STATUS_LABELS[trace.basis.status]}）
            </p>
          ) : null}
        </div>
      ))}
    </details>
  );
}
