import { useState } from "react";
import type { DecisiveAnswer, DecisiveAnswerKind, DecisiveQuestion } from "@policymate/contracts";
import { ANSWER_MAX_CHARACTERS, DECISIVE_ANSWER_KIND_LABELS } from "@policymate/contracts";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiFailure } from "../../api/client";
import { useAnalysisFlow } from "../../analysis/AnalysisSessionContext";
import { FailurePanel } from "../../components/FailurePanel";

/**
 * 决定性追问页。
 *
 * 同轮问题集中展示，每题说明为什么需要确认，并允许“不知道、尚未核实、
 * 存在争议”。体验上限：最多三轮、每轮五问、总计十二问。
 */

type AnswerChoice = DecisiveAnswerKind | null;

const NON_VALUE_KINDS: ReadonlyArray<Exclude<DecisiveAnswerKind, "value">> = [
  "unknown",
  "not_verified",
  "disputed",
];

interface DraftAnswer {
  choice: AnswerChoice;
  text: string;
}

function QuestionCard({
  question,
  draft,
  onChange,
  disabled,
}: {
  question: DecisiveQuestion;
  draft: DraftAnswer;
  onChange: (draft: DraftAnswer) => void;
  disabled: boolean;
}) {
  const answered = draft.choice !== null;
  const textTooLong = draft.text.length > ANSWER_MAX_CHARACTERS;
  return (
    <article
      className={`question-card${question.kind === "neutral_safety" ? " question-card--safety" : ""}`}
      data-testid={`question-${question.questionId}`}
      data-priority={question.priority}
    >
      <header className="question-card__head">
        <span className="question-card__topic">{question.topicLabel}</span>
        <span className="question-card__priority">优先级 {question.priority}</span>
        <span className="question-card__order">第 {question.orderInRound} 题</span>
      </header>
      <h3 className="question-card__text">{question.text}</h3>
      <p className="question-card__why">
        <span className="question-card__why-label">为什么需要确认：</span>
        {question.whyItMatters}
      </p>

      <div className="question-card__choices" role="group" aria-label={`回答问题：${question.text}`}>
        <button
          type="button"
          className={`mark-chip${draft.choice === "value" ? " is-selected" : ""}`}
          aria-pressed={draft.choice === "value"}
          onClick={() => onChange({ ...draft, choice: "value" })}
          disabled={disabled}
          data-testid={`question-${question.questionId}-answer-value`}
        >
          {DECISIVE_ANSWER_KIND_LABELS.value}
        </button>
        {NON_VALUE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`mark-chip${draft.choice === kind ? " is-selected" : ""}`}
            aria-pressed={draft.choice === kind}
            onClick={() => onChange({ ...draft, choice: kind })}
            disabled={disabled}
            data-testid={`question-${question.questionId}-answer-${kind}`}
          >
            {DECISIVE_ANSWER_KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      {draft.choice === "value" ? (
        <div>
          <label className="field" htmlFor={`question-text-${question.questionId}`}>
            <span className="field__label">补充说明（最多 2,000 字符）</span>
            <textarea
              id={`question-text-${question.questionId}`}
              className="field__input"
              rows={3}
              value={draft.text}
              onChange={(event) => onChange({ ...draft, text: event.target.value })}
              disabled={disabled}
              data-testid={`question-${question.questionId}-text`}
            />
          </label>
          <p className={`field__note${textTooLong ? " case-input__error" : ""}`}>
            {draft.text.length.toLocaleString("zh-Hans-CN")} / {ANSWER_MAX_CHARACTERS.toLocaleString("zh-Hans-CN")} 字符
            {textTooLong ? "：已超出上限，请精简" : ""}
          </p>
        </div>
      ) : null}

      <p className="visually-hidden" aria-live="polite">
        {answered ? "已选择回答方式" : "尚未选择回答方式"}
      </p>
    </article>
  );
}

export function DecisiveQuestionsPage() {
  const { status, refresh, advanceRound } = useAnalysisFlow();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Record<string, DraftAnswer>>({});
  const [submitting, setSubmitting] = useState(false);
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
  if (state.stage !== "collecting_answers" || state.questions.length === 0) {
    return <Navigate to="/analysis/review" replace />;
  }

  const answeredCount = state.questions.filter((question) => {
    const draft = drafts[question.questionId];
    return draft !== undefined && draft.choice !== null;
  }).length;

  const allAnswered = answeredCount === state.questions.length;
  const anyTextTooLong = state.questions.some((question) => {
    const draft = drafts[question.questionId];
    return draft?.choice === "value" && draft.text.length > ANSWER_MAX_CHARACTERS;
  });

  const buildAnswers = (): DecisiveAnswer[] =>
    state.questions.map((question) => {
      const draft = drafts[question.questionId];
      if (draft === undefined || draft.choice === null) {
        throw new Error("unanswered");
      }
      return {
        questionId: question.questionId,
        kind: draft.choice,
        text: draft.choice === "value" ? draft.text : null,
      };
    });

  const submitRound = async () => {
    if (submitting || !allAnswered || anyTextTooLong) return;
    setSubmitting(true);
    setError(null);
    try {
      const nextState = await advanceRound(buildAnswers());
      setDrafts({});
      if (nextState.stage === "collecting_answers" && nextState.questions.length > 0) {
        // 下一轮问题已在页面中渲染。
        return;
      }
      navigate("/analysis/review");
    } catch (caughtError) {
      const apiFailure =
        caughtError instanceof ApiFailure
          ? caughtError
          : new ApiFailure("server", "服务暂时不可用，请稍后重试。");
      setError(apiFailure.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page page--reading analysis-page" data-testid="decisive-questions-page">
      <header className="subpage-header">
        <Link className="back-link" to="/analysis/facts">
          返回事实确认
        </Link>
        <h1 className="page-title">决定性追问</h1>
        <p className="page-lead">
          只询问会实质影响定性、分流、受立案、证据或风险的问题。允许回答“不知道”“尚未核实”或“存在争议”，不必猜测。
        </p>
      </header>

      <p className="analysis-progress" data-testid="round-progress">
        第 {state.roundsCompleted + 1} 轮 / 最多 {state.roundLimit} 轮 · 本轮 {state.questions.length} 题（每轮最多 {state.perRoundLimit} 题）·
        已问 {state.answers.length + state.questions.length} / 总计最多 {state.totalQuestionLimit} 题
      </p>

      {error !== null ? (
        <p className="case-input__error" role="alert" data-testid="questions-error">
          {error}
        </p>
      ) : null}

      <div className="question-list" data-testid="question-list">
        {state.questions.map((question) => (
          <QuestionCard
            key={question.questionId}
            question={question}
            draft={drafts[question.questionId] ?? { choice: null, text: "" }}
            onChange={(draft) => setDrafts((prev) => ({ ...prev, [question.questionId]: draft }))}
            disabled={submitting}
          />
        ))}
      </div>

      <div className="analysis-actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => void submitRound()}
          disabled={!allAnswered || anyTextTooLong || submitting}
          data-testid="submit-round"
        >
          {submitting ? "正在提交本轮回答…" : "提交本轮回答"}
        </button>
      </div>
      <p className="field__note">
        达到追问上限（{state.roundLimit} 轮 / {state.totalQuestionLimit} 题）仍有缺口时，系统会停止追问并保留不足状态，不会反复追问。
      </p>
    </div>
  );
}
