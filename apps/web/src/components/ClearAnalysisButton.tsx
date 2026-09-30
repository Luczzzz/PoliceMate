import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAnalysisFlow } from "../analysis/AnalysisSessionContext";

export interface ClearAnalysisButtonProps {
  testId?: string;
  className?: string;
  label?: string;
}

const CLEAR_CONFIRM_TEXT =
  "确定清除本次分析？当前标签页中的案情输入、候选事实、事实快照、报告、临时标记与筛选都会立即删除，且无法恢复。";

/**
 * 清除本次分析。必须先经过二次确认；确认后清除输入、事实、快照、
 * 报告、临时工作台状态、当前位置与会话标识，并取消在途请求。
 */
export function ClearAnalysisButton({
  testId = "clear-analysis",
  className = "button button--muted",
  label = "清除本次分析",
}: ClearAnalysisButtonProps) {
  const { clear } = useAnalysisFlow();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const requestClear = async () => {
    if (!window.confirm(CLEAR_CONFIRM_TEXT)) return;
    setBusy(true);
    try {
      await clear();
      navigate("/analysis", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={() => void requestClear()}
      disabled={busy}
      data-testid={testId}
    >
      {busy ? "正在清除…" : label}
    </button>
  );
}
