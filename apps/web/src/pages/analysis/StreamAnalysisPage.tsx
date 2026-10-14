import { useEffect, useMemo, useRef, useState } from "react";
import { CASE_TEXT_MAX_CHARACTERS, STREAM_ANALYSIS_DISCLAIMER, countCharacters } from "@policymate/contracts";
import { ApiFailure, streamAnalysis, type StreamAnalysisOutcome } from "../../api/client";
import { CapabilityGate } from "../../components/CapabilityGate";
import { InlineFailure } from "../../components/InlineFailure";

/**
 * 流式纯文本分析页（ADR-0015）：案情输入框 + 一个结果文本框，文字逐段出现。
 *
 * 输出未经系统校验，生成完整后才可复制；中断、停止或触顶时保留已出文字并
 * 标明不完整，复制禁用，由民警手动重新生成。文本只在本页内存里，刷新即丢。
 */
type Phase = "idle" | "streaming" | "complete" | "truncated" | "interrupted" | "stopped";

const INCOMPLETE_LABEL: Partial<Record<Phase, string>> = {
  streaming: "正在生成…",
  truncated: "输出已达上限，内容不完整",
  interrupted: "生成中断，内容不完整",
  stopped: "已停止，内容不完整",
};

export function StreamAnalysisPage() {
  const [caseText, setCaseText] = useState("");
  const [output, setOutput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [outcome, setOutcome] = useState<StreamAnalysisOutcome | null>(null);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const characterCount = useMemo(() => countCharacters(caseText), [caseText]);
  const overLimit = characterCount > CASE_TEXT_MAX_CHARACTERS;
  const empty = caseText.trim() === "";
  const streaming = phase === "streaming";

  const run = async () => {
    if (overLimit || empty || streaming) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setOutput("");
    setFailure(null);
    setOutcome(null);
    setCopied(null);
    setPhase("streaming");
    try {
      const result = await streamAnalysis(caseText, (text) => setOutput((current) => current + text), controller.signal);
      setOutcome(result);
      setPhase(result.status === "complete" ? "complete" : result.status === "truncated" ? "truncated" : "interrupted");
    } catch (error) {
      if (error instanceof ApiFailure && error.kind === "cancelled") {
        setPhase("stopped");
      } else if (error instanceof ApiFailure && error.status !== null) {
        // 开流前被拒绝：没有任何输出。
        setFailure(error);
        setPhase("idle");
      } else {
        setPhase("interrupted");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  };

  const incomplete = phase === "truncated" || phase === "interrupted" || phase === "stopped";
  const statusLabel = INCOMPLETE_LABEL[phase];

  return (
    <CapabilityGate
      capability="caseAnalysis"
      title="案情分析"
      intro="输入脱敏后的案情，分析结果将实时生成在下方文本框中。"
      icon="analysis"
      command="案情描述 → 分析结果"
    >
      <div className="stream-analysis" data-testid="stream-analysis">
        <section className="deidentification-notice" data-testid="deidentification-notice" role="note">
          <h2 className="deidentification-notice__title">提交前请确认</h2>
          <ul className="deidentification-notice__list">
            <li>请勿输入姓名、身份证号、手机号、精确住址等真实身份信息；本产品不做自动脱敏，提交前请自行完成脱敏。</li>
            <li>提交内容将经 PoliceMate 后端发送至大模型处理。</li>
            <li>分析结果由模型生成，法条与事实未经系统校验，请务必自行核对。</li>
          </ul>
        </section>

        <label className="field" htmlFor="stream-case-input">
          <span className="field__label">案情描述</span>
          <textarea
            id="stream-case-input"
            className="field__input case-input__textarea"
            rows={7}
            value={caseText}
            onChange={(event) => setCaseText(event.target.value)}
            placeholder="请描述大致时间、地点、相关人员、主要行为、结果和当前未知事项。"
            data-testid="stream-case-input"
          />
        </label>
        <p className={`case-input__count${overLimit ? " case-input__count--over" : ""}`} aria-live="polite">
          已输入 {characterCount.toLocaleString("zh-Hans-CN")} / {CASE_TEXT_MAX_CHARACTERS.toLocaleString("zh-Hans-CN")} 字符
          {overLimit ? "：已超出上限，请精简后提交" : ""}
        </p>
        {failure !== null ? <InlineFailure failure={failure} testId="stream-failure" /> : null}

        <div className="stream-analysis__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void run()}
            disabled={overLimit || empty || streaming}
            data-testid="stream-submit"
          >
            提交分析
          </button>
          {streaming ? (
            <button type="button" className="button" onClick={() => controllerRef.current?.abort()} data-testid="stream-stop">
              停止
            </button>
          ) : null}
        </div>

        <section className="stream-analysis__result" aria-label="分析结果">
            <header className="stream-analysis__result-head">
              <h2 className="stream-analysis__title">分析结果</h2>
              <button type="button" className="button" onClick={() => void copy()} disabled={phase !== "complete"} data-testid="stream-copy">
                复制结果
              </button>
            </header>
            {statusLabel !== undefined ? (
              <p className="stream-analysis__status" role="status" data-testid="stream-status">{statusLabel}</p>
            ) : null}
            <pre className="stream-analysis__output" data-testid="stream-output">{output}</pre>
            {phase === "idle" ? <p className="field__note">提交后，分析结果会逐段显示在这里。</p> : null}
            {copied !== null ? (
              <p className="field__note" role="status">{copied === "ok" ? "已复制" : "复制失败，请长按文本手动复制"}</p>
            ) : null}
            {incomplete ? (
              <button type="button" className="button" onClick={() => void run()} data-testid="stream-regenerate">
                重新生成
              </button>
            ) : null}
            {phase !== "idle" && !streaming ? (
              <p className="stream-analysis__disclaimer" data-testid="stream-disclaimer">
                {outcome?.disclaimer ?? STREAM_ANALYSIS_DISCLAIMER}
              </p>
            ) : null}
        </section>
        <p className="field__note" data-testid="stream-retention-hint">
          分析内容只保留在当前页面，刷新或关闭页面后不可恢复，服务器也不保存；需要留存请在生成完成后点击“复制结果”。
        </p>
      </div>
    </CapabilityGate>
  );
}
