import { useState } from "react";
import type { AnalysisReport } from "@policymate/contracts";
import { Link, Navigate } from "react-router-dom";
import { ApiFailure } from "../../api/client";
import { useAnalysisFlow } from "../../analysis/AnalysisSessionContext";
import { FailurePanel } from "../../components/FailurePanel";

function ReportBody({ report }: { report: AnalysisReport }) {
  return <div className="report-body" data-testid="analysis-report">
    <header className="report-header">
      <p className="status-badge" data-testid="report-status">{report.statusLabel}</p>
      <h1 className="page-title">{report.headline}</h1>
      <dl className="detail-list"><div><dt>生成时间</dt><dd>{report.generatedAt}</dd></div><div><dt>事实快照</dt><dd>v{report.snapshotVersion} · {report.snapshotHash}</dd></div><div><dt>内容发布批次</dt><dd>{report.contentReleaseId}</dd></div><div><dt>工作流版本</dt><dd>{report.workflowVersion}</dd></div><div><dt>契约版本</dt><dd>{report.contractVersion}</dd></div></dl>
    </header>
    {report.factLimitations.length > 0 ? <section className="expected-note"><h2>事实限制</h2><ul>{report.factLimitations.map((item, index) => <li key={index}>{item}</li>)}</ul></section> : null}
    <section><h2>参与者 × 行为摘要</h2>{report.participantBehaviorSummary.length === 0 ? <p>当前没有可结构化展示的参与者—行为组合。</p> : <ul>{report.participantBehaviorSummary.map((item, index) => <li key={index}><strong>{item.participant} × {item.behavior}</strong>：{item.note}</li>)}</ul>}</section>
    {report.modules.map((module) => <section key={module.id} className="report-module" data-testid={`report-module-${module.id}`}><h2>{module.label} <small>{module.status}</small></h2>{module.summary ? <p>{module.summary}</p> : null}<ul>{module.items.map((item, index) => <li key={index}>{item}</li>)}</ul>{module.traceLinks.length > 0 ? <details><summary>查看可解释链路（{module.traceLinks.length}）</summary>{module.traceLinks.map((trace, index) => <div key={index} className="trace-link"><p>事实：{trace.factIds.join("、")} → 条件：{trace.condition} → {trace.conditionStatus}</p><p>判断：{trace.judgment}</p>{trace.basis ? <p>依据：{trace.basis.title} {trace.basis.article}（{trace.basis.issuingAuthority}，{trace.basis.status}）</p> : null}</div>)}</details> : null}{module.failureReason ? <p role="alert">{module.failureReason}</p> : null}</section>)}
    <p className="field__note">本报告是程序辅助工具输出，不构成案件定性、受立案决定、处罚建议或法律结论；请结合现行规范、正式案卷和官方系统核验。</p>
  </div>;
}

export function AnalysisReportPage() {
  const { status, refresh, generateReport } = useAnalysisFlow();
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  if (status.kind === "idle") return <Navigate to="/analysis" replace />;
  if (status.kind === "failed") return <div className="page page--reading"><FailurePanel failure={status.failure} onRetry={() => void refresh()} testId="analysis-failure" /><Link className="button button--secondary" to="/analysis/review">返回分析前确认</Link></div>;
  if (status.kind !== "ready") return <p className="loading-text" role="status">正在读取本次分析状态…</p>;
  if (status.state.stage !== "snapshot_confirmed") return <Navigate to="/analysis/review" replace />;
  const run = async () => { setLoading(true); setError(null); try { setReport(await generateReport()); } catch (caught) { setError(caught instanceof ApiFailure ? caught : new ApiFailure("server", "报告生成失败，请稍后重试。")); } finally { setLoading(false); } };
  return <div className="page page--reading analysis-page"><header className="subpage-header"><Link className="back-link" to="/analysis/review">返回分析前确认</Link><p className="page-lead">报告只绑定当前已确认事实快照。任何迟到、取消或版本不匹配的响应都不会覆盖当前页面。</p></header>{report ? <ReportBody report={report} /> : <section className="snapshot-panel"><h1>生成六模块分析报告</h1><p>后端将校验事实引用、当前有效法源、状态和跨模块解释链路；关键校验失败时不会展示半成品。</p><button className="button button--primary" type="button" onClick={() => void run()} disabled={loading} data-testid="generate-report">{loading ? "正在生成并校验…" : "生成完整报告"}</button>{error ? <p role="alert" className="case-input__error">{error.message}</p> : null}</section>}</div>;
}
