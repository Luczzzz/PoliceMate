import { useState } from "react";
import type { AnalysisReport, ReportModule, ReportDocumentTask } from "@policymate/contracts";
import {
  REPORT_BASIS_CONFIRMATION_LABELS,
  reportHasUnconfirmedBasis,
} from "@policymate/contracts";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiFailure } from "../../api/client";
import { useAnalysisFlow } from "../../analysis/AnalysisSessionContext";
import { ClearAnalysisButton } from "../../components/ClearAnalysisButton";
import { FailurePanel } from "../../components/FailurePanel";
import { ReportBasisLinks } from "../../components/ReportBasisLinks";
import { EvidenceChecklistWorkbench, InterviewPointsWorkbench } from "../../components/ReportWorkbench";
import { formatBeijingDateTime } from "../../util/datetime";

const REPORT_BOUNDARY_STATEMENT =
  "本报告是程序辅助工具输出，不构成案件定性、受立案决定、处罚建议或法律结论；请结合现行规范、正式案卷和官方系统核验。";

function documentTaskState(task: ReportDocumentTask) {
  return {
    reportTask: {
      taskId: task.taskId,
      title: task.title,
      procedureCategory: task.procedureCategory,
      stageId: task.stageId,
      applicableRoles: task.applicableRoles,
      caseTags: task.caseTags,
    },
  };
}

function GenericModule({ module }: { module: ReportModule }) {
  return (
    <section
      id={`report-module-${module.id}`}
      className="report-module"
      data-testid={`report-module-${module.id}`}
      data-workbench="none"
    >
      <h2>
        {module.label} <small>{module.status}</small>
      </h2>
      {module.summary ? <p>{module.summary}</p> : null}
      <ul>
        {module.items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
      {module.traceLinks.length > 0 ? (
        <ReportBasisLinks moduleId={module.id} traceLinks={module.traceLinks} />
      ) : null}
      {module.failureReason ? <p role="alert">{module.failureReason}</p> : null}
    </section>
  );
}

function ReportModuleSection({ module }: { module: ReportModule }) {
  if (module.id === "evidence_checklist") {
    return <EvidenceChecklistWorkbench module={module} />;
  }
  if (module.id === "interview_points") {
    return <InterviewPointsWorkbench module={module} />;
  }
  return <GenericModule module={module} />;
}

function DocumentTaskCard({ task }: { task: ReportDocumentTask }) {
  return (
    <li className="document-task" data-testid={`document-task-${task.taskId}`}>
      <h3 className="document-task__title">{task.title}</h3>
      <p className="document-task__description">{task.description}</p>
      <p className="document-task__meta">
        {task.procedureCategoryLabel} · {task.stageLabel}
        {task.applicableRoles.length > 0 ? ` · 适用对象：${task.applicableRoles.join("、")}` : ""}
      </p>
      <p className="field__note">{task.boundaryStatement}</p>
      <Link
        className="button button--secondary"
        to="/documents"
        state={documentTaskState(task)}
        data-testid={`document-task-open-${task.taskId}`}
      >
        查看候选文书范例
      </Link>
    </li>
  );
}

function ReportModuleIndex({ modules }: { modules: ReportModule[] }) {
  return (
    <nav className="report-index" aria-label="六模块索引" data-testid="report-module-index">
      <h2>报告模块</h2>
      <ul>
        {modules.map((module) => (
          <li key={module.id}>
            <a href={`#report-module-${module.id}`} data-testid={`report-index-${module.id}`}>
              {module.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ReportBody({
  report,
  pendingModification,
  onModify,
  modifying,
  modifyError,
}: {
  report: AnalysisReport;
  pendingModification: boolean;
  onModify: () => void;
  modifying: boolean;
  modifyError: string | null;
}) {
  return (
    <div className="report-body" data-testid="analysis-report">
      <header className="report-header">
        <p className="status-badge" data-testid="report-status">
          {report.statusLabel}
        </p>
        <h1 className="page-title" data-testid="report-headline">{report.headline}</h1>
        <dl className="detail-list">
          <div>
            <dt>生成时间</dt>
            <dd>{formatBeijingDateTime(report.generatedAt)}</dd>
          </div>
          <div>
            <dt>事实快照</dt>
            <dd>
              v{report.snapshotVersion} · {report.snapshotHash}
            </dd>
          </div>
          <div>
            <dt>内容发布批次</dt>
            <dd>{report.contentReleaseId}</dd>
          </div>
          <div>
            <dt>工作流版本</dt>
            <dd>{report.workflowVersion}</dd>
          </div>
          <div>
            <dt>契约版本</dt>
            <dd>{report.contractVersion}</dd>
          </div>
        </dl>
      </header>

      {reportHasUnconfirmedBasis(report) ? (
        <section
          className="unconfirmed-basis-notice"
          role="status"
          data-testid="unconfirmed-basis-notice"
        >
          <h2>存在{REPORT_BASIS_CONFIRMATION_LABELS.system_extracted_unconfirmed}的依据</h2>
          <p>
            本报告部分依据为系统从案情中提取、尚未经民警确认。相关结论仅供核验方向，请先对照原始表述核对，确认后再据此判断。
          </p>
        </section>
      ) : null}

      {pendingModification ? (
        <section className="modification-banner" role="status" data-testid="modification-pending">
          <h2>修改尚未应用</h2>
          <p>
            你正在补充或修改事实。这些修改尚未形成新的事实快照，因此当前报告仍然有效；确认新快照后，本报告及其临时标记、筛选和折叠状态会立即失效。
          </p>
          <Link className="button button--primary" to="/analysis/modify" data-testid="continue-modification">
            继续补充或修改事实
          </Link>
        </section>
      ) : (
        <div className="analysis-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={onModify}
            disabled={modifying}
            data-testid="begin-modification"
          >
            {modifying ? "正在进入修改…" : "补充或修改事实"}
          </button>
          <ClearAnalysisButton testId="clear-analysis-report" />
        </div>
      )}
      {modifyError !== null ? (
        <p className="case-input__error" role="alert" data-testid="modify-error">
          {modifyError}
        </p>
      ) : null}

      {report.factLimitations.length > 0 ? (
        <section className="expected-note">
          <h2>事实限制</h2>
          <ul>
            {report.factLimitations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>参与者 × 行为摘要</h2>
        {report.participantBehaviorSummary.length === 0 ? (
          <p>当前没有可结构化展示的参与者—行为组合。</p>
        ) : (
          <ul>
            {report.participantBehaviorSummary.map((item, index) => (
              <li key={index}>
                <strong>
                  {item.participant} × {item.behavior}
                </strong>
                ：{item.note}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReportModuleIndex modules={report.modules} />

      {report.modules.map((module) => (
        <ReportModuleSection key={module.id} module={module} />
      ))}

      <section className="document-tasks" aria-labelledby="document-tasks-title" data-testid="document-tasks">
        <h2 id="document-tasks-title">文书任务</h2>
        <p className="field__note">
          文书任务只使用程序类别、办理阶段、适用对象和案情标签筛选候选范例，不代入案情事实，也不自动选择唯一范例。
        </p>
        {report.documentTasks.length === 0 ? (
          <p>当前报告没有可展示的文书任务。</p>
        ) : (
          <ul className="document-task-list">
            {report.documentTasks.map((task) => (
              <DocumentTaskCard key={task.taskId} task={task} />
            ))}
          </ul>
        )}
      </section>

      <p className="field__note">{REPORT_BOUNDARY_STATEMENT}</p>
    </div>
  );
}

export function AnalysisReportPage() {
  const { status, report, refresh, generateReport, beginModification } = useAnalysisFlow();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [modifying, setModifying] = useState(false);
  const [modifyError, setModifyError] = useState<string | null>(null);

  if (status.kind === "idle") return <Navigate to="/analysis" replace />;
  if (status.kind === "failed")
    return (
      <div className="page page--reading">
        <FailurePanel failure={status.failure} onRetry={() => void refresh()} testId="analysis-failure" />
        <Link className="button button--secondary" to="/analysis">
          返回案情输入
        </Link>
      </div>
    );
  if (status.kind !== "ready")
    return (
      <p className="loading-text" role="status">
        正在读取本次分析状态…
      </p>
    );

  const state = status.state;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      await generateReport();
    } catch (caught) {
      setError(caught instanceof ApiFailure ? caught : new ApiFailure("server", "报告生成失败，请稍后重试。"));
    } finally {
      setLoading(false);
    }
  };

  const modify = async () => {
    setModifying(true);
    setModifyError(null);
    try {
      await beginModification();
      navigate("/analysis/modify");
    } catch (caught) {
      setModifyError(
        caught instanceof ApiFailure ? caught.message : "暂时无法进入补充或修改事实，请稍后重试。",
      );
    } finally {
      setModifying(false);
    }
  };

  return (
    <div className="page page--reading analysis-page">
      <header className="subpage-header">
        <Link className="back-link" to="/analysis">
          重新输入案情
        </Link>
        <p className="page-lead">
          报告只绑定当前已确认事实快照。任何迟到、取消或版本不匹配的响应都不会覆盖当前页面。
        </p>
      </header>
      {report ? (
        <ReportBody
          report={report}
          pendingModification={state.modification !== null}
          onModify={() => void modify()}
          modifying={modifying}
          modifyError={modifyError}
        />
      ) : (
        <section className="snapshot-panel">
          <h1>生成六模块分析报告</h1>
          <p>后端将校验事实引用、当前有效法源、状态和跨模块解释链路；关键校验失败时不会展示半成品。</p>
          <button
            className="button button--primary"
            type="button"
            onClick={() => void run()}
            disabled={loading}
            data-testid="generate-report"
          >
            {loading ? "正在生成并校验…" : "生成完整报告"}
          </button>
          {error ? (
            <p role="alert" className="case-input__error">
              {error.message}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
