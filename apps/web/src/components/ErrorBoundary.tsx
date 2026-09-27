import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { StatusPanel } from "./StatusPanel";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * 页面级异常边界。异常状态只包含通用说明，不包含案情、事实或报告内容，
 * 也不把堆栈暴露给用户。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 仅在开发环境输出，且不得包含任何案情内容。
    if (import.meta.env.DEV) {
      console.error("[policymate] 页面异常", error.message, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="page">
        <StatusPanel
          variant="page_error"
          title="页面出现异常"
          impact="当前页面无法继续显示。页面内的临时内容不会被保存，也不会自动恢复。"
          nextStep="请刷新页面重试；若问题持续出现，请通过“使用与数据说明”中的联系方式反馈，并说明当时的操作步骤。"
          testId="page-error"
          action={
            <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
              刷新页面
            </button>
          }
          extra={
            <p className="status-panel__note">
              <Link className="link-button" to="/">
                返回首页
              </Link>
            </p>
          }
        />
      </div>
    );
  }
}
