import { useEffect, useRef, useState } from "react";
import { useAnalysisFlow } from "../analysis/AnalysisSessionContext";

/** 超过该时长后改用“比平时慢”的文案；不自动中断（硬超时见 AnalysisSessionContext）。 */
export const SLOW_NOTICE_AFTER_SECONDS = 120;

/**
 * 长任务等待弹窗。居中模态，显示后端真实阶段与已等待时间，提供取消入口，
 * 不显示虚假完成百分比；只给“通常需要约 X 秒”的预期，不作承诺。
 */
export function AnalysisProgress() {
  const { pendingOperation, cancel } = useAnalysisFlow();
  const [now, setNow] = useState(() => Date.now());
  const cancelRef = useRef<HTMLButtonElement>(null);
  const active = pendingOperation !== null;

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pendingOperation]);

  useEffect(() => {
    if (active) cancelRef.current?.focus();
  }, [active]);

  if (pendingOperation === null) return null;
  const elapsedSeconds = Math.max(0, Math.floor((now - pendingOperation.startedAt) / 1000));
  const slow = elapsedSeconds >= SLOW_NOTICE_AFTER_SECONDS;

  return (
    <div className="operation-modal" data-testid="analysis-progress-overlay">
      <section
        className="operation-progress"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="analysis-progress-title"
        data-testid="analysis-progress"
      >
        <h2 id="analysis-progress-title" className="operation-progress__title">
          正在生成分析，请稍候
        </h2>
        <div role="status" aria-live="polite">
          <p className="operation-progress__stage" data-testid="analysis-progress-stage">
            当前阶段：{pendingOperation.label}
          </p>
          <p className="operation-progress__elapsed" data-testid="analysis-progress-elapsed">
            已等待 {elapsedSeconds} 秒
          </p>
          <p className="field__note" data-testid="analysis-progress-hint">
            {slow
              ? "比平时慢，系统仍在处理。可以继续等待，也可以取消后稍后重试。"
              : "通常需要一至两分钟，请不要关闭页面。系统只显示真实阶段和已等待时间，不显示百分比。"}
          </p>
        </div>
        <button
          ref={cancelRef}
          type="button"
          className="button button--muted"
          onClick={cancel}
          data-testid="analysis-cancel"
        >
          取消本次请求
        </button>
      </section>
    </div>
  );
}
