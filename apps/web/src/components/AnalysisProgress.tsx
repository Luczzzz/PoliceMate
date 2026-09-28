import { useEffect, useState } from "react";
import { useAnalysisFlow } from "../analysis/AnalysisSessionContext";

/**
 * 长任务真实进度。只显示后端显式阶段名称与已等待时间，提供取消入口，
 * 不显示虚假完成百分比。
 */
export function AnalysisProgress() {
  const { pendingOperation, cancel } = useAnalysisFlow();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (pendingOperation === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pendingOperation]);

  if (pendingOperation === null) return null;
  const elapsedSeconds = Math.max(0, Math.floor((now - pendingOperation.startedAt) / 1000));

  return (
    <section
      className="operation-progress"
      aria-label="本次请求处理进度"
      data-testid="analysis-progress"
    >
      <div role="status" aria-live="polite">
        <p className="operation-progress__stage" data-testid="analysis-progress-stage">
          当前阶段：{pendingOperation.label}
        </p>
        <p className="operation-progress__elapsed" data-testid="analysis-progress-elapsed">
          已等待 {elapsedSeconds} 秒
        </p>
        <p className="field__note">系统只显示真实处理阶段和已等待时间，不显示百分比。</p>
      </div>
      <button
        type="button"
        className="button button--muted"
        onClick={cancel}
        data-testid="analysis-cancel"
      >
        取消本次请求
      </button>
    </section>
  );
}
