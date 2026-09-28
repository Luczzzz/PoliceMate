import { ApiFailure } from "../api/client";
import { describeFailure } from "./FailurePanel";

export interface InlineFailureProps {
  failure: ApiFailure;
  testId?: string;
}

/**
 * 就地显示失败影响与可执行下一步。网络不可用、请求频繁、内容过长/格式不支持、
 * 契约不兼容、依据不可用、功能禁用和一般服务异常使用各自的状态文案，
 * 不只显示“出错了”。
 */
export function InlineFailure({ failure, testId = "inline-failure" }: InlineFailureProps) {
  const copy = describeFailure(failure);
  return (
    <div
      className={`inline-failure inline-failure--${copy.variant}`}
      data-variant={copy.variant}
      role="alert"
      data-testid={testId}
    >
      <p className="inline-failure__title">{copy.title}</p>
      <p className="inline-failure__detail" data-testid={`${testId}-message`}>
        {failure.message}
      </p>
      <p className="inline-failure__detail">影响：{copy.impact}</p>
      <p className="inline-failure__detail">下一步：{copy.nextStep}</p>
      {failure.requestId === null ? null : (
        <p className="inline-failure__request" data-testid="inline-request-id">
          排查用请求编号（不含案情内容）：{failure.requestId}
        </p>
      )}
    </div>
  );
}
