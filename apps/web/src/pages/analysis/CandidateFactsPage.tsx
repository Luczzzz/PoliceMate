import { useState } from "react";
import type { AnalysisSessionState, CandidateFact, FactStatus } from "@policymate/contracts";
import { FACT_STATUS_LABELS } from "@policymate/contracts";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiFailure } from "../../api/client";
import { useAnalysisFlow } from "../../analysis/AnalysisSessionContext";
import { ClearAnalysisButton } from "../../components/ClearAnalysisButton";
import { FailurePanel } from "../../components/FailurePanel";

/**
 * 候选事实确认页。
 *
 * 系统不默认确认任何事实；民警逐项标记确认、否认、未知或争议，
 * 可以新增遗漏事实，也可以把候选事实排除出本次分析
 * （删除只表示不纳入，不代表确认其没有发生）。
 */

const MARK_OPTIONS: ReadonlyArray<{ status: FactStatus; label: string }> = [
  { status: "confirmed", label: FACT_STATUS_LABELS.confirmed },
  { status: "denied", label: FACT_STATUS_LABELS.denied },
  { status: "unknown", label: FACT_STATUS_LABELS.unknown },
  { status: "disputed", label: FACT_STATUS_LABELS.disputed },
];

function statusTone(fact: CandidateFact): string {
  if (fact.excluded) return "is-excluded";
  switch (fact.status) {
    case "confirmed":
      return "is-confirmed";
    case "denied":
      return "is-denied";
    case "unknown":
      return "is-unknown";
    case "disputed":
      return "is-disputed";
    default:
      return "is-candidate";
  }
}

function FactCard({
  fact,
  locked,
  onMark,
  onExclude,
  onRestore,
}: {
  fact: CandidateFact;
  locked: boolean;
  onMark: (status: FactStatus) => void;
  onExclude: () => void;
  onRestore: () => void;
}) {
  return (
    <article
      className={`fact-card ${statusTone(fact)}`}
      data-testid={`fact-card-${fact.factId}`}
      data-status={fact.excluded ? "excluded" : fact.status}
      data-category={fact.category}
    >
      <header className="fact-card__head">
        <span className="fact-card__category">{fact.categoryLabel}</span>
        {fact.riskCategory !== null ? (
          <span className="fact-card__risk">含风险表述（待确认）</span>
        ) : null}
        {fact.sourceRound !== null && fact.sourceRound > 0 ? (
          <span className="fact-card__source">第 {fact.sourceRound} 轮追问补充</span>
        ) : null}
        {fact.confirmationMethod === "officer_added" ? (
          <span className="fact-card__source">民警补充</span>
        ) : null}
      </header>

      <p className="fact-card__statement">{fact.statement}</p>
      <p className="fact-card__original">
        <span className="fact-card__original-label">原始表述：</span>
        {fact.originalWording}
      </p>

      {fact.value !== null ? (
        <dl className="fact-card__value" data-testid={`fact-value-${fact.factId}`}>
          <div>
            <dt>原始值</dt>
            <dd>{fact.value.raw}</dd>
          </div>
          <div>
            <dt>规范化范围</dt>
            <dd>
              {fact.value.normalizedMin === null && fact.value.normalizedMax === null
                ? "无法规范化"
                : `${fact.value.normalizedMin ?? "（无下限）"} ～ ${fact.value.normalizedMax ?? "（无上限）"}${
                    fact.value.unit === null ? "" : ` ${fact.value.unit}`
                  }`}
            </dd>
          </div>
          <div>
            <dt>精确程度</dt>
            <dd>{fact.value.precisionLabel}</dd>
          </div>
        </dl>
      ) : null}

      <p className="fact-card__relations">
        {fact.participantRefs.length > 0 ? <span>关联人员：{fact.participantRefs.join("、")}</span> : null}
        {fact.eventRefs.length > 0 ? <span>关联事件：{fact.eventRefs.join("、")}</span> : null}
        {fact.behaviorRefs.length > 0 ? <span>关联行为：{fact.behaviorRefs.join("、")}</span> : null}
      </p>

      {fact.excluded ? (
        <div className="fact-card__excluded-note">
          <p>已排除：仅表示不纳入本次分析，不代表确认该事实没有发生。</p>
          {locked ? null : (
            <button type="button" className="link-button" onClick={onRestore} data-testid={`fact-restore-${fact.factId}`}>
              重新纳入本次分析
            </button>
          )}
        </div>
      ) : (
        <fieldset className="fact-card__marks" disabled={locked}>
          <legend className="visually-hidden">标记事实「{fact.statement}」</legend>
          {MARK_OPTIONS.map((option) => {
            const checked = fact.status === option.status;
            return (
              <button
                key={option.status}
                type="button"
                className={`mark-chip${checked ? " is-selected" : ""}`}
                aria-pressed={checked}
                onClick={() => onMark(option.status)}
                data-testid={`fact-mark-${fact.factId}-${option.status}`}
              >
                {option.label}
              </button>
            );
          })}
          {locked ? null : (
            <button
              type="button"
              className="fact-card__exclude"
              onClick={onExclude}
              data-testid={`fact-exclude-${fact.factId}`}
            >
              不纳入本次分析
            </button>
          )}
        </fieldset>
      )}
    </article>
  );
}

export function CandidateFactsPage() {
  const { status, refresh, setFactStatus, setFactExclusion, addFact, advanceRound } = useAnalysisFlow();
  const navigate = useNavigate();
  const [newFact, setNewFact] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status.kind === "idle") {
    return <Navigate to="/analysis" replace />;
  }
  if (status.kind === "failed") {
    return (
      <div className="page page--reading">
        <FailurePanel failure={status.failure} onRetry={() => void refresh()} testId="analysis-failure" />
        <Link className="button button--secondary" to="/analysis">
          返回案情输入
        </Link>
      </div>
    );
  }
  if (status.kind !== "ready") {
    return (
      <p className="loading-text" role="status" data-testid="analysis-loading">
        正在读取本次分析状态…
      </p>
    );
  }

  const state = status.state;
  const locked = state.stage === "snapshot_confirmed";
  const activeFacts = state.facts.filter((fact) => !fact.excluded);
  const excludedFacts = state.facts.filter((fact) => fact.excluded);

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      const apiFailure =
        error instanceof ApiFailure ? error : new ApiFailure("server", "服务暂时不可用，请稍后重试。");
      setActionError(apiFailure.message);
    } finally {
      setBusy(false);
    }
  };

  const startQuestions = async () => {
    await run(async () => {
      await advanceRound([]);
      navigate("/analysis/questions");
    });
  };

  const submitNewFact = async () => {
    await run(async () => {
      await addFact(newFact);
      setNewFact("");
    });
  };

  const counts = {
    confirmed: activeFacts.filter((fact) => fact.status === "confirmed").length,
    denied: activeFacts.filter((fact) => fact.status === "denied").length,
    unknown: activeFacts.filter((fact) => fact.status === "unknown").length,
    disputed: activeFacts.filter((fact) => fact.status === "disputed").length,
    candidate: activeFacts.filter((fact) => fact.status === "candidate").length,
  };

  return (
    <div className="page page--reading analysis-page" data-testid="candidate-facts-page">
      <header className="subpage-header">
        <Link className="back-link" to="/analysis">
          重新输入案情
        </Link>
        <h1 className="page-title">候选事实确认</h1>
        <p className="page-lead">
          以下事实由系统从你的原始表述中提取，尚未确认。请逐项核对原始表述，标记确认、否认、未知或争议。
        </p>
      </header>

      {locked ? (
        <p className="analysis-locked-note" role="status" data-testid="analysis-locked">
          事实快照已确认并锁定，以下内容为只读；如需调整，请清除本次分析后重新开始。
        </p>
      ) : null}

      {state.independentMatters.detected ? (
        <section className="split-matters" role="alert" data-testid="split-matters">
          <h2>建议拆分分析</h2>
          <p>{state.independentMatters.note}</p>
        </section>
      ) : null}

      <p className="analysis-progress" data-testid="fact-progress">
        已确认 {counts.confirmed} · 否认 {counts.denied} · 未知 {counts.unknown} · 争议 {counts.disputed} ·
        待标记候选 {counts.candidate}（系统不会默认确认任何事实）
      </p>

      {actionError !== null ? (
        <p className="case-input__error" role="alert" data-testid="facts-action-error">
          {actionError}
        </p>
      ) : null}

      <section className="fact-list" aria-label="候选事实列表" data-testid="fact-list">
        {activeFacts.map((fact) => (
          <FactCard
            key={fact.factId}
            fact={fact}
            locked={locked || busy}
            onMark={(mark) => void run(() => setFactStatus(fact.factId, mark))}
            onExclude={() => void run(() => setFactExclusion(fact.factId, true))}
            onRestore={() => void run(() => setFactExclusion(fact.factId, false))}
          />
        ))}
      </section>

      {excludedFacts.length > 0 ? (
        <section className="fact-list fact-list--excluded" aria-label="已排除事实" data-testid="excluded-facts">
          <h2 className="section-heading__title">已排除（不纳入本次分析）</h2>
          {excludedFacts.map((fact) => (
            <FactCard
              key={fact.factId}
              fact={fact}
              locked={locked || busy}
              onMark={() => undefined}
              onExclude={() => undefined}
              onRestore={() => void run(() => setFactExclusion(fact.factId, false))}
            />
          ))}
        </section>
      ) : null}

      {!locked ? (
        <section className="add-fact" aria-labelledby="add-fact-title" data-testid="add-fact">
          <h2 id="add-fact-title" className="section-heading__title">
            系统遗漏了事实？
          </h2>
          <label className="field" htmlFor="add-fact-input">
            <span className="field__label">用一句话补充（提交后即作为你确认的事实纳入分析）</span>
            <textarea
              id="add-fact-input"
              className="field__input"
              rows={3}
              value={newFact}
              onChange={(event) => setNewFact(event.target.value)}
              placeholder="例如：人员甲目前已在逃，暂未到案。"
              data-testid="add-fact-input"
            />
          </label>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void submitNewFact()}
            disabled={newFact.trim() === "" || busy}
            data-testid="add-fact-submit"
          >
            新增事实
          </button>
        </section>
      ) : null}

      <div className="analysis-actions">
        {locked ? (
          <Link className="button button--primary" to="/analysis/review" data-testid="go-review-locked">
            查看已确认的事实快照
          </Link>
        ) : (
          <button
            type="button"
            className="button button--primary"
            onClick={() => void startQuestions()}
            disabled={busy}
            data-testid="start-questions"
          >
            完成事实确认，进入决定性追问
          </button>
        )}
        <ClearAnalysisButton testId="clear-analysis" />
      </div>
      <p className="field__note">
        清除会删除当前标签页与服务端本次会话中的案情、事实和回答，取消进行中的请求，且无法恢复。
      </p>
    </div>
  );
}

export type { AnalysisSessionState };
