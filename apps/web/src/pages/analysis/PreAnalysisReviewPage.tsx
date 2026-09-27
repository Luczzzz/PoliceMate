import { useState } from "react";
import type { AnalysisSessionState, CandidateFact, UrgentRiskPrompt } from "@policymate/contracts";
import { FACT_STATUS_LABELS } from "@policymate/contracts";
import { Link, Navigate } from "react-router-dom";
import { ApiFailure } from "../../api/client";
import { useAnalysisFlow } from "../../analysis/AnalysisSessionContext";
import { FailurePanel } from "../../components/FailurePanel";

/**
 * 分析前确认页。
 *
 * 分别展示确认、否认、未知和争议事实、剩余决定性缺口及预期限制；
 * 已确认的紧急风险事实在此触发报告前核验提示。
 * 只有民警主动确认后才形成不可变事实快照。
 */

const STATUS_GROUPS: ReadonlyArray<{ status: CandidateFact["status"]; title: string; hint: string }> = [
  { status: "confirmed", title: "已确认", hint: "这些事实将作为本次分析的输入。" },
  { status: "denied", title: "已否认", hint: "这些事实将用于排除不成立的方向。" },
  { status: "unknown", title: "未知", hint: "这些事实不支撑主结论，只形成缺口或核验事项。" },
  { status: "disputed", title: "存在争议", hint: "这些事实存在不同说法，报告会保留分支，不会替你选择。" },
  { status: "candidate", title: "候选（未标记）", hint: "这些事实未经确认，不能支撑主结论。" },
];

function UrgentPromptCard({ prompt }: { prompt: UrgentRiskPrompt }) {
  return (
    <section className="urgent-prompt" role="alert" data-testid={`urgent-prompt-${prompt.category}`}>
      <h2 className="urgent-prompt__title">报告前核验提示：{prompt.categoryLabel}</h2>
      <div className="urgent-prompt__block">
        <h3>触发的已确认事实</h3>
        <ul>
          {prompt.triggeringStatements.map((statement, index) => (
            <li key={index}>{statement}</li>
          ))}
        </ul>
      </div>
      <div className="urgent-prompt__block">
        <h3>需要立即人工核验</h3>
        <ul>
          {prompt.humanChecks.map((check, index) => (
            <li key={index}>{check}</li>
          ))}
        </ul>
      </div>
      <p className="urgent-prompt__boundary">{prompt.boundaryStatement}</p>
    </section>
  );
}

function FactSummaryRow({ fact }: { fact: CandidateFact }) {
  return (
    <li className="summary-fact" data-testid={`summary-fact-${fact.factId}`} data-status={fact.status}>
      <p className="summary-fact__statement">{fact.statement}</p>
      <p className="summary-fact__original">原始表述：{fact.originalWording}</p>
    </li>
  );
}

export function PreAnalysisReviewPage() {
  const { status, refresh, confirmSnapshot } = useAnalysisFlow();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status.kind === "idle") {
    return <Navigate to="/analysis" replace />;
  }
  if (status.kind === "failed") {
    return (
      <div className="page page--reading">
        <FailurePanel failure={status.failure} onRetry={() => void refresh()} testId="analysis-failure" />
        <Link className="button button--secondary" to="/analysis/facts">
          返回事实确认
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
  if (state.stage === "confirming_facts") {
    return <Navigate to="/analysis/facts" replace />;
  }
  if (state.stage === "collecting_answers") {
    return <Navigate to="/analysis/questions" replace />;
  }

  const activeFacts = state.facts.filter((fact) => !fact.excluded);
  const excludedFacts = state.facts.filter((fact) => fact.excluded);
  const snapshotConfirmed = state.stage === "snapshot_confirmed";

  const confirm = async () => {
    if (confirming || snapshotConfirmed) return;
    if (!window.confirm("确认以上事实摘要并形成事实快照？确认后本次分析的事实与回答将锁定，不能再修改。")) {
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await confirmSnapshot();
    } catch (caughtError) {
      const apiFailure =
        caughtError instanceof ApiFailure
          ? caughtError
          : new ApiFailure("server", "服务暂时不可用，请稍后重试。");
      setError(apiFailure.message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="page page--reading analysis-page" data-testid="pre-analysis-page">
      <header className="subpage-header">
        <Link className="back-link" to="/analysis/facts">
          返回事实确认
        </Link>
        <h1 className="page-title">分析前确认</h1>
        <p className="page-lead">
          请核对本次分析采用的全部事实、剩余缺口和预期限制。只有你主动确认后，才会形成本次分析的不可变事实快照。
        </p>
      </header>

      {state.urgentPrompts.length > 0 ? (
        <div data-testid="urgent-prompts">
          {state.urgentPrompts.map((prompt) => (
            <UrgentPromptCard key={prompt.promptId} prompt={prompt} />
          ))}
        </div>
      ) : null}

      {state.followUpEnded && state.endReason === "limits_reached" ? (
        <p className="limit-note" role="status" data-testid="limit-note">
          追问已达到上限（{state.roundLimit} 轮 / {state.totalQuestionLimit} 题），仍有未解决的缺口；本次分析将在不足状态下进行，不会反复追问。
        </p>
      ) : null}

      {snapshotConfirmed ? (
        <section className="snapshot-panel" role="status" data-testid="snapshot-panel">
          <h2>事实快照已确认</h2>
          <dl className="detail-list">
            <div className="detail-list__row">
              <dt>快照版本</dt>
              <dd data-testid="snapshot-version">v{state.snapshot?.snapshotVersion}</dd>
            </div>
            <div className="detail-list__row">
              <dt>快照哈希</dt>
              <dd className="snapshot-hash" data-testid="snapshot-hash">
                {state.snapshot?.snapshotHash}
              </dd>
            </div>
            <div className="detail-list__row">
              <dt>确认时间</dt>
              <dd>{state.snapshot?.confirmedAt}</dd>
            </div>
          </dl>
          <p>
            事实快照已锁定且不可修改；后续生成分析报告时将绑定该快照版本。未知、争议和候选事实不会直接支撑主结论。
          </p>
        </section>
      ) : null}

      <section className="summary-groups" aria-label="事实摘要">
        {STATUS_GROUPS.map((group) => {
          const facts = activeFacts.filter((fact) => fact.status === group.status);
          if (facts.length === 0) return null;
          return (
            <section
              key={group.status}
              className="summary-group"
              data-testid={`summary-group-${group.status}`}
            >
              <h2 className="summary-group__title">
                {group.title}
                <span className="summary-group__count">{facts.length}</span>
              </h2>
              <p className="summary-group__hint">{group.hint}</p>
              <ul className="summary-group__list">
                {facts.map((fact) => (
                  <FactSummaryRow key={fact.factId} fact={fact} />
                ))}
              </ul>
            </section>
          );
        })}
        {excludedFacts.length > 0 ? (
          <p className="summary-group__hint" data-testid="excluded-summary">
            另有 {excludedFacts.length} 项事实已被排除，不纳入本次分析（删除不代表确认其没有发生）。
          </p>
        ) : null}
      </section>

      <section className="gap-list" aria-labelledby="gap-list-title" data-testid="gap-list">
        <h2 id="gap-list-title" className="section-heading__title">
          剩余决定性缺口（{state.gaps.length}）
        </h2>
        {state.gaps.length === 0 ? (
          <p>当前没有未解决的决定性缺口。</p>
        ) : (
          <ul>
            {state.gaps.map((gap) => (
              <li key={gap.gapId} data-testid={`gap-${gap.gapId}`}>
                <span className="gap-list__topic">{gap.topicLabel}</span>
                {gap.description}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="expected-note" aria-labelledby="expected-note-title" data-testid="expected-note">
        <h2 id="expected-note-title" className="section-heading__title">
          预期限制
        </h2>
        <p>{state.expectedStatusNote}</p>
        <p>未知、争议和候选事实不会直接支撑主结论；分析结果为辅助参考，需结合现行规范和正式案卷核验。</p>
      </section>

      {error !== null ? (
        <p className="case-input__error" role="alert" data-testid="review-error">
          {error}
        </p>
      ) : null}

      {!snapshotConfirmed ? (
        <div className="analysis-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void confirm()}
            disabled={confirming}
            data-testid="confirm-snapshot"
          >
            {confirming ? "正在形成事实快照…" : "确认事实摘要，形成事实快照"}
          </button>
          <Link className="button button--secondary" to="/analysis/facts" data-testid="back-to-facts">
            返回调整事实
          </Link>
        </div>
      ) : null}
      <p className="field__note">
        {FACT_STATUS_LABELS.candidate}、未知和争议事实不会直接支撑主结论；生成分析报告需在快照确认后另行发起。
      </p>
    </div>
  );
}
