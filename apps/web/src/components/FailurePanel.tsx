import { ApiFailure } from "../api/client";
import { StatusPanel, type StatusVariant } from "./StatusPanel";

interface FailureCopy {
  variant: StatusVariant;
  title: string;
  impact: string;
  nextStep: string;
}

/** 把后端/网络失败映射为具体、可执行的用户可见状态。 */
export function describeFailure(failure: ApiFailure): FailureCopy {
  switch (failure.kind) {
    case "offline":
      return {
        variant: "offline",
        title: "网络不可用",
        impact: "无法从 PoliceMate 后端读取当前状态，页面内容可能不是最新的。",
        nextStep: "请检查网络连接后重试。已加载的本地内容仍可查看。",
      };
    case "timeout":
      return {
        variant: "service",
        title: "服务响应超时",
        impact: "后端在预期时间内没有返回结果，当前状态未知。",
        nextStep: "请稍后重试；若持续超时，请通过“使用与数据说明”中的联系方式反馈。",
      };
    case "contract":
      return {
        variant: "contract",
        title: "需要更新页面",
        impact: "客户端与后端的契约版本不一致，为避免误读字段，已停止解析响应。",
        nextStep: "请刷新页面；若仍提示不兼容，请使用最新的试行地址。",
      };
    case "malformed":
    case "server":
      return {
        variant: "service",
        title: "服务暂时不可用",
        impact: "当前无法读取入口状态，未获得任何未经验证的结果。",
        nextStep: "请稍后重试；若持续失败，请通过“使用与数据说明”中的联系方式反馈。",
      };
  }
}

export interface FailurePanelProps {
  failure: ApiFailure;
  onRetry: () => void;
  testId?: string;
}

export function FailurePanel({ failure, onRetry, testId }: FailurePanelProps) {
  const copy = describeFailure(failure);

  return (
    <StatusPanel
      variant={copy.variant}
      title={copy.title}
      impact={copy.impact}
      nextStep={copy.nextStep}
      testId={testId ?? "shell-failure"}
      action={
        <button type="button" className="button button--primary" onClick={onRetry} data-testid="retry">
          重试
        </button>
      }
      extra={
        failure.requestId === null ? undefined : (
          <p className="status-panel__note" data-testid="request-id">
            排查用请求编号（不含案情内容）：{failure.requestId}
          </p>
        )
      }
    />
  );
}
