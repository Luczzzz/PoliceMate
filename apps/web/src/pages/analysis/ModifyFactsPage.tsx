import { useState } from "react";
import type { CandidateFact, FactCategory } from "@policymate/contracts";
import { FACT_CATEGORY_LABELS, FACT_STATUS_LABELS } from "@policymate/contracts";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiFailure } from "../../api/client";
import { useAnalysisFlow } from "../../analysis/AnalysisSessionContext";
import { FailurePanel } from "../../components/FailurePanel";

/**
 * 补充或修改事实页。
 *
 * 修改以当前事实快照为起点：在确认新快照前，旧报告仍然可见并显示
 * “修改尚未应用”，民警可以放弃修改。确认新快照后，旧报告及其全部临时
 * 状态立即失效，系统在同一请求内生成绑定新快照的报告。
 *
 * 两种事实版本都不能排除时，必须记录为争议事实，系统不静默选择其中一个。
 */

function RevisionEditor({
  fact,
  disabled,
  onReplace,
  onDispute,
}: {
  fact: CandidateFact;
  disabled: boolean;
  onReplace: (statement: string) => void;
  onDispute: (statement: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState(fact.statement);
  const canSubmit = statement.trim() !== "" && !disabled;

  return (
    <div className="revision-editor">
      <button
        type="button"
        className="button button--muted"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        disabled={disabled}
        data-testid={`revision-open-${fact.factId}`}
      >
        {open ? "收起修改" : "修改这条事实"}
      </button>
      {open ? (
        <div className="revision-editor__panel">
          <label className="field" htmlFor={`revision-input-${fact.factId}`}>
            <span className="field__label">新的表述</span>
            <textarea
              id={`revision-input-${fact.factId}`}
              className="field__input"
              rows={3}
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              data-testid={`revision-input-${fact.factId}`}
            />
          </label>
          <div className="analysis-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => onReplace(statement)}
              disabled={!canSubmit}
              data-testid={`revision-replace-${fact.factId}`}
            >
              用新版本替代旧版本
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => onDispute(statement)}
              disabled={!canSubmit}
              data-testid={`revision-dispute-${fact.factId}`}
            >
              两版本都不能排除，记为争议事实
            </button>
          </div>
          <p className="field__note">
            替代旧版本后，旧版本退出本次分析；记为争议事实后，两个版本都会保留为争议事实，报告不会替你选择。
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ModifyFactsPage() {
  const {
    status,
    report,
    refresh,
    addFact,
    setFactStatus,
    reviseFact,
    confirmSnapshot,
    discardModification,
  } = useAnalysisFlow();
  const navigate = useNavigate();
  const location = useLocation();
  const gapSupplement =
    (location.state as
      | { gapSupplement?: { gapId: string; factCategory: FactCategory; description: string } }
      | null
      | undefined)?.gapSupplement ?? null;
  const [newFact, setNewFact] = useState("");
  const [newFactCategory, setNewFactCategory] = useState<FactCategory>(
    gapSupplement?.factCategory ?? "other",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status.kind === "idle") return <Navigate to="/analysis" replace />;
  if (status.kind === "failed")
    return (
      <div className="page page--reading">
        <FailurePanel failure={status.failure} onRetry={() => void refresh()} testId="analysis-failure" />
        <Link className="button button--secondary" to="/analysis/report">
          返回报告
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
  if (state.stage !== "modifying_facts") {
    // 确认修改后阶段会立即变化；由这里的重定向接管跳转，避免竞态。
    return <Navigate to="/analysis/report" replace />;
  }

  const activeFacts = state.facts.filter((fact) => !fact.excluded);
  const excludedFacts = state.facts.filter((fact) => fact.excluded);

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof ApiFailure ? caught.message : "服务暂时不可用，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (
      !window.confirm(
        "确认新的事实快照？确认后旧报告及其临时标记、筛选和折叠状态会立即失效，系统将基于新快照生成新报告。",
      )
    ) {
      return;
    }
    await run(async () => {
      await confirmSnapshot();
      navigate("/analysis/report");
    });
  };

  const discard = async () => {
    await run(async () => {
      await discardModification();
      navigate("/analysis/report");
    });
  };

  return (
    <div className="page page--reading analysis-page" data-testid="modify-facts-page">
      <header className="subpage-header">
        <Link className="back-link" to="/analysis/report">
          返回当前有效报告
        </Link>
        <h1 className="page-title">补充或修改事实</h1>
        <p className="page-lead">
          修改以当前事实快照为起点。确认新快照前，旧报告仍然有效并显示“修改尚未应用”；你也可以放弃修改。
        </p>
      </header>

      <section className="modification-banner" role="status" data-testid="modification-unapplied">
        <h2>修改尚未应用</h2>
        <p>
          以下修改尚未形成新的事实快照，不会改变当前有效报告
          {report ? `（快照 v${report.snapshotVersion}）` : ""}。确认新快照后，旧报告及其临时状态立即失效。
        </p>
      </section>

      {error !== null ? (
        <p className="case-input__error" role="alert" data-testid="modify-action-error">
          {error}
        </p>
      ) : null}

      <section className="fact-list" aria-label="当前事实（可修改）" data-testid="modify-fact-list">
        {activeFacts.map((fact) => (
          <article
            className="fact-card"
            key={fact.factId}
            data-testid={`modify-fact-${fact.factId}`}
            data-status={fact.status}
          >
            <header className="fact-card__head">
              <span className="fact-card__category">{fact.categoryLabel}</span>
              <span className="fact-card__source">{fact.statusLabel}</span>
              {fact.replacesFactId !== null ? (
                <span className="fact-card__source">替代 {fact.replacesFactId}</span>
              ) : null}
            </header>
            <p className="fact-card__statement">{fact.statement}</p>
            <p className="fact-card__original">
              <span className="fact-card__original-label">原始表述：</span>
              {fact.originalWording}
            </p>
            <div
              className="workbench-marks"
              role="group"
              aria-label={`${fact.categoryLabel}事实状态`}
              data-testid={`fact-status-${fact.factId}`}
            >
              {(["confirmed", "denied", "unknown", "disputed"] as const).map((nextStatus) => (
                <button
                  key={nextStatus}
                  type="button"
                  className={`mark-chip${fact.status === nextStatus ? " is-selected" : ""}`}
                  aria-pressed={fact.status === nextStatus}
                  disabled={busy}
                  onClick={() => void run(() => setFactStatus(fact.factId, nextStatus))}
                  data-testid={`fact-status-${nextStatus}-${fact.factId}`}
                >
                  {FACT_STATUS_LABELS[nextStatus]}
                </button>
              ))}
            </div>
            <RevisionEditor
              fact={fact}
              disabled={busy}
              onReplace={(statement) => void run(() => reviseFact(fact.factId, { statement, resolution: "replace" }))}
              onDispute={(statement) => void run(() => reviseFact(fact.factId, { statement, resolution: "dispute" }))}
            />
          </article>
        ))}
      </section>

      {excludedFacts.length > 0 ? (
        <section className="fact-list fact-list--excluded" aria-label="已排除事实" data-testid="modify-excluded-facts">
          <h2 className="section-heading__title">已排除（不纳入本次分析）</h2>
          {excludedFacts.map((fact) => (
            <article className="fact-card is-excluded" key={fact.factId} data-testid={`modify-excluded-${fact.factId}`}>
              <p className="fact-card__statement">{fact.statement}</p>
              <p className="field__note">已排除：仅表示不纳入本次分析，不代表确认该事实没有发生。</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="add-fact" aria-labelledby="modify-add-fact-title" data-testid="modify-add-fact">
        <h2 id="modify-add-fact-title" className="section-heading__title">
          新增事实
        </h2>
        <label className="field" htmlFor="modify-add-fact-category">
          <span className="field__label">补充到哪个事实类别（用于补齐决定性缺口）</span>
          <select
            id="modify-add-fact-category"
            className="field__input"
            value={newFactCategory}
            onChange={(event) => setNewFactCategory(event.target.value as FactCategory)}
            data-testid="modify-add-fact-category"
          >
            {(Object.keys(FACT_CATEGORY_LABELS) as FactCategory[]).map((category) => (
              <option key={category} value={category}>
                {FACT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="modify-add-fact-input">
          <span className="field__label">用一句话补充（提交后即作为你确认的事实纳入分析）</span>
          <textarea
            id="modify-add-fact-input"
            className="field__input"
            rows={3}
            value={newFact}
            onChange={(event) => setNewFact(event.target.value)}
            data-testid="modify-add-fact-input"
          />
        </label>
        <button
          type="button"
          className="button button--secondary"
          onClick={() =>
            void run(async () => {
              await addFact(newFact, newFactCategory, gapSupplement?.gapId);
              setNewFact("");
            })
          }
          disabled={busy || newFact.trim() === ""}
          data-testid="modify-add-fact-submit"
        >
          新增事实
        </button>
      </section>

      <div className="analysis-actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => void confirm()}
          disabled={busy}
          data-testid="confirm-modification"
        >
          {busy ? "正在处理…" : "确认修改，形成新事实快照并重新分析"}
        </button>
        <button
          type="button"
          className="button button--muted"
          onClick={() => void discard()}
          disabled={busy}
          data-testid="discard-modification"
        >
          放弃修改
        </button>
      </div>
    </div>
  );
}
