import { useEffect, useRef, useState } from "react";

/**
 * 长任务等待弹窗（展示组件，不持有任何请求状态）。
 *
 * 只显示调用方给出的真实阶段与已等待时间，不显示虚假完成百分比；给“通常需要
 * 多久”的预期而不作承诺。取消入口由调用方注入，取消语义由调用方定义（取消不是失败）。
 */
export interface OperationModalProps {
  /** 弹窗标题；不同入口用不同措辞，但结构一致。 */
  title: string;
  /** 当前阶段文案，必须由调用方给出真实阶段。 */
  stage: string;
  /** 本次请求开始时间戳。 */
  startedAt: number;
  /** 超过该秒数后改用“比平时慢”的文案；不自动中断。 */
  slowNoticeAfterSeconds?: number;
  normalHint?: string;
  slowHint?: string;
  cancelLabel?: string;
  onCancel: () => void;
  /** 无障碍标题 id；同一页面可能出现多个弹窗组件，故由调用方注入。 */
  titleId: string;
  /** 测试标识前缀，默认沿用案情分析的既有标识。 */
  testIdPrefix?: string;
  /** 取消按钮的测试标识；未给出时由前缀推导。 */
  cancelTestId?: string;
}

const DEFAULT_NORMAL_HINT =
  "通常需要一至两分钟，请不要关闭页面。系统只显示真实阶段和已等待时间，不显示百分比。";
const DEFAULT_SLOW_HINT = "比平时慢，系统仍在处理。可以继续等待，也可以取消后稍后重试。";

export function OperationModal({
  title,
  stage,
  startedAt,
  slowNoticeAfterSeconds = 120,
  normalHint = DEFAULT_NORMAL_HINT,
  slowHint = DEFAULT_SLOW_HINT,
  cancelLabel = "取消本次请求",
  onCancel,
  titleId,
  testIdPrefix = "analysis-progress",
  cancelTestId,
}: OperationModalProps) {
  const [now, setNow] = useState(() => Date.now());
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const slow = elapsedSeconds >= slowNoticeAfterSeconds;

  return (
    <div className="operation-modal" data-testid={`${testIdPrefix}-overlay`}>
      <section
        className="operation-progress"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testIdPrefix}
      >
        <h2 id={titleId} className="operation-progress__title">
          {title}
        </h2>
        <div role="status" aria-live="polite">
          <p className="operation-progress__stage" data-testid={`${testIdPrefix}-stage`}>
            当前阶段：{stage}
          </p>
          <p className="operation-progress__elapsed" data-testid={`${testIdPrefix}-elapsed`}>
            已等待 {elapsedSeconds} 秒
          </p>
          <p className="field__note" data-testid={`${testIdPrefix}-hint`}>
            {slow ? slowHint : normalHint}
          </p>
        </div>
        <button
          ref={cancelRef}
          type="button"
          className="button button--muted"
          onClick={onCancel}
          data-testid={cancelTestId ?? `${testIdPrefix}-cancel`}
        >
          {cancelLabel}
        </button>
      </section>
    </div>
  );
}
