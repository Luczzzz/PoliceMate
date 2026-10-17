import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACCIDENT_LIABILITY_ANSWER_MAX_CHARACTERS,
  ACCIDENT_LIABILITY_CASE_MAX_CHARACTERS,
  ACCIDENT_LIABILITY_DISCLAIMER,
  countCharacters,
  type AccidentLiabilitySessionState,
} from "@policymate/contracts";
import {
  ApiFailure,
  answerAccidentLiability,
  clearAccidentLiabilitySession,
  createAccidentLiabilitySession,
  requestAccidentLiabilityReport,
} from "../api/client";
import { CapabilityGate } from "../components/CapabilityGate";
import { InlineFailure } from "../components/InlineFailure";

/**
 * 交通事故责任认定辅助页（ADR-0016）。
 *
 * 先提交脱敏的事故概况，模型据此逐轮追问；民警可随时要求直接生成研判报告。
 * 产物是一段纯文本研判意见，不是《道路交通事故认定书》。会话只保留在当前
 * 页面内存里，刷新或关闭页面后不可恢复，服务器也不长期保存问答内容。
 */
export function AccidentLiabilityPage() {
  const [caseText, setCaseText] = useState("");
  const [answer, setAnswer] = useState("");
  const [session, setSession] = useState<AccidentLiabilitySessionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const caseCount = useMemo(() => countCharacters(caseText), [caseText]);
  const answerCount = useMemo(() => countCharacters(answer), [answer]);
  const caseOverLimit = caseCount > ACCIDENT_LIABILITY_CASE_MAX_CHARACTERS;
  const answerOverLimit = answerCount > ACCIDENT_LIABILITY_ANSWER_MAX_CHARACTERS;

  const failureNotice = failure === null ? null : (
    <InlineFailure failure={failure} testId="accident-failure" />
  );

  const run = async (action: (signal: AbortSignal) => Promise<AccidentLiabilitySessionState>): Promise<boolean> => {
    if (busy) return false;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setFailure(null);
    setCopied(null);
    try {
      setSession(await action(controller.signal));
      return true;
    } catch (error) {
      setFailure(
        error instanceof ApiFailure ? error : new ApiFailure("server", "服务暂时不可用，请稍后重试。"),
      );
      return false;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setBusy(false);
    }
  };

  const start = () => {
    if (caseText.trim() === "" || caseOverLimit) return;
    void run((signal) => createAccidentLiabilitySession(caseText, signal));
  };

  const submitAnswer = () => {
    if (session === null || answer.trim() === "" || answerOverLimit) return;
    const text = answer;
    // 失败时保留输入，便于重试；成功后清空，等待下一轮追问。
    void run((signal) => answerAccidentLiability(session.sessionId, text, signal)).then((ok) => {
      if (ok) setAnswer("");
    });
  };

  const generateNow = () => {
    if (session === null) return;
    void run((signal) => requestAccidentLiabilityReport(session.sessionId, signal));
  };

  const restart = () => {
    const current = session;
    controllerRef.current?.abort();
    setSession(null);
    setCaseText("");
    setAnswer("");
    setFailure(null);
    setCopied(null);
    if (current !== null) {
      void clearAccidentLiabilitySession(current.sessionId).catch(() => undefined);
    }
  };

  const copyReport = async () => {
    if (session?.report == null) return;
    try {
      await navigator.clipboard.writeText(session.report);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  };

  const deidentificationNotice = (
    <section className="deidentification-notice" role="note" data-testid="accident-deidentification-notice">
      <h2 className="deidentification-notice__title">提交前请确认</h2>
      <ul className="deidentification-notice__list">
        <li>请勿输入姓名、身份证号、手机号、车牌号、精确地点等真实身份信息；本产品不做自动脱敏，提交前请自行完成脱敏。</li>
        <li>提交内容将经 PoliceMate 后端发送至大模型处理，服务端只在简短内存中保留本次问答，不做长期保存。</li>
        <li>研判意见由模型边对话边生成，责任划分与法条未经系统校验，请务必自行核对；它不构成官方责任认定。</li>
      </ul>
    </section>
  );

  return (
    <CapabilityGate
      capability="accidentLiability"
      title="交通事故责任认定"
      intro="先描述事故概况，系统会就关键事实逐轮追问；信息足够或你主动要求时，给出纯文本研判意见。"
      icon="traffic"
      command="事故概况 → 逐轮追问 → 研判报告"
    >
      <div className="accident-liability" data-testid="accident-liability">
        {deidentificationNotice}

        {session === null ? (
          <section className="accident-liability__compose" data-testid="accident-compose">
            <label className="field" htmlFor="accident-case-input">
              <span className="field__label">事故概况</span>
              <textarea
                id="accident-case-input"
                className="field__input case-input__textarea"
                rows={7}
                value={caseText}
                onChange={(event) => setCaseText(event.target.value)}
                placeholder="请描述大致时间、地点、涉及的车辆和人员、通行方向与主要行为、有无人员伤亡或财产损失，以及尚未确认的事项。"
                data-testid="accident-case-input"
              />
            </label>
            <p className={`case-input__count${caseOverLimit ? " case-input__count--over" : ""}`} aria-live="polite">
              已输入 {caseCount.toLocaleString("zh-Hans-CN")} / {ACCIDENT_LIABILITY_CASE_MAX_CHARACTERS.toLocaleString("zh-Hans-CN")} 字符
              {caseOverLimit ? "：已超出上限，请精简后提交" : ""}
            </p>
            {failureNotice}
            <div className="accident-liability__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={start}
                disabled={busy || caseOverLimit || caseText.trim() === ""}
                data-testid="accident-start"
              >
                {busy ? "正在生成第一个问题…" : "开始问答"}
              </button>
            </div>
          </section>
        ) : null}

        {session !== null ? (
          <section className="accident-liability__dialog" aria-label="事故问答记录">
            <ol className="accident-turns" data-testid="accident-turns">
              {session.turns.map((turn) => (
                <li
                  key={turn.turnId}
                  className={`accident-turn accident-turn--${turn.speaker}`}
                  data-testid={`accident-turn-${turn.speaker}`}
                >
                  <span className="accident-turn__who">{turn.speaker === "officer" ? "民警" : "系统追问"}</span>
                  <p className="accident-turn__text">{turn.text}</p>
                </li>
              ))}
            </ol>

            {failureNotice}

            {session.stage === "questioning" ? (
              <div className="accident-liability__answer">
                <label className="field" htmlFor="accident-answer-input">
                  <span className="field__label">回答追问</span>
                  <textarea
                    id="accident-answer-input"
                    className="field__input case-input__textarea"
                    rows={3}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="只补充追问涉及的事实；不确定的写“待核实”，不要编造。"
                    data-testid="accident-answer-input"
                  />
                </label>
                <p className={`case-input__count${answerOverLimit ? " case-input__count--over" : ""}`} aria-live="polite">
                  已输入 {answerCount.toLocaleString("zh-Hans-CN")} / {ACCIDENT_LIABILITY_ANSWER_MAX_CHARACTERS.toLocaleString("zh-Hans-CN")} 字符
                  {answerOverLimit ? "：已超出上限，请精简后提交" : ""}
                </p>
                <div className="accident-liability__actions">
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={submitAnswer}
                    disabled={busy || answerOverLimit || answer.trim() === ""}
                    data-testid="accident-submit-answer"
                  >
                    提交回答
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={generateNow}
                    disabled={busy}
                    data-testid="accident-generate-now"
                  >
                    直接生成研判意见
                  </button>
                </div>
              </div>
            ) : null}

            {session.report !== null ? (
              <section className="accident-liability__report" aria-label="事故责任研判意见">
                <header className="accident-liability__report-head">
                  <h2 className="accident-liability__title">事故责任研判意见</h2>
                  <button type="button" className="button" onClick={() => void copyReport()} data-testid="accident-copy">
                    复制研判意见
                  </button>
                </header>
                <pre className="accident-liability__output" data-testid="accident-report">{session.report}</pre>
                {copied !== null ? (
                  <p className="field__note" role="status">{copied === "ok" ? "已复制" : "复制失败，请长按文本手动复制"}</p>
                ) : null}
                <div className="accident-liability__actions">
                  <button type="button" className="button button--secondary" onClick={restart} data-testid="accident-restart">
                    开始新的问答
                  </button>
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        <p className="field__note" data-testid="accident-retention-hint">
          问答与研判意见只保留在当前页面，刷新或关闭页面后不可恢复；需要留存请在生成后点击“复制研判意见”。
        </p>
        <p className="accident-liability__boundary" data-testid="accident-disclaimer">
          {session?.disclaimer ?? ACCIDENT_LIABILITY_DISCLAIMER}
        </p>
      </div>
    </CapabilityGate>
  );
}
