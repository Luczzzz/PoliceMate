import { useAnalysisFlow } from "../analysis/AnalysisSessionContext";
import { OperationModal } from "./OperationModal";

/** 超过该时长后改用“比平时慢”的文案；不自动中断（硬超时见 AnalysisSessionContext）。 */
export const SLOW_NOTICE_AFTER_SECONDS = 120;

/**
 * 案情分析与支线流程的等待弹窗，把 `AnalysisSessionContext` 的在途操作投影到
 * 通用弹窗上。事故责任认定辅助有自己的在途状态，直接复用 `OperationModal`。
 */
export function AnalysisProgress() {
  const { pendingOperation, cancel } = useAnalysisFlow();
  if (pendingOperation === null) return null;

  return (
    <OperationModal
      title="正在生成分析，请稍候"
      stage={pendingOperation.label}
      startedAt={pendingOperation.startedAt}
      slowNoticeAfterSeconds={SLOW_NOTICE_AFTER_SECONDS}
      onCancel={cancel}
      titleId="analysis-progress-title"
      cancelTestId="analysis-cancel"
    />
  );
}
