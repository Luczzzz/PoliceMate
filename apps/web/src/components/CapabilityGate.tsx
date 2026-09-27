import type { ReactNode } from "react";
import type { CapabilityId } from "@policymate/contracts";
import { Link } from "react-router-dom";
import { useShell } from "../app/ShellContext";
import { FailurePanel } from "./FailurePanel";
import { Icon, type IconName } from "./Icon";
import { StatusPanel } from "./StatusPanel";

export interface CapabilityGateProps {
  capability: CapabilityId;
  title: string;
  intro: string;
  icon: IconName;
  command: string;
  children: ReactNode;
}

/**
 * 能力入口门控。可用状态只来自后端外壳响应，页面不得根据文案或点击结果推断。
 * 不可用时在渲染任何内容前显示“功能暂不可用”，避免出现空入口。
 */
export function CapabilityGate({
  capability,
  title,
  intro,
  icon,
  command,
  children,
}: CapabilityGateProps) {
  const { state, reload } = useShell();

  const header = (
    <header className="subpage-header">
      <Link className="back-link" to="/">
        <Icon name="arrowLeft" size={18} />
        返回首页
      </Link>
      <span className="subpage-mark" aria-hidden="true">
        <Icon name={icon} size={42} strokeWidth={1.4} />
      </span>
      <h1 className="page-title">{title}</h1>
      <p className="page-lead">{intro}</p>
      <div className="command-tag">
        <code>{command}</code>
      </div>
    </header>
  );

  if (state.status === "loading") {
    return (
      <div className="page page--reading" data-testid="capability-loading">
        {header}
        <p className="loading-text" role="status">
          正在读取入口状态…
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="page page--reading">
        {header}
        <FailurePanel failure={state.failure} onRetry={reload} testId="capability-failure" />
      </div>
    );
  }

  const availability = state.data.entries[capability];
  if (!availability.available) {
    return (
      <div className="page page--reading">
        {header}
        <StatusPanel
          variant="unavailable"
          title="功能暂不可用"
          impact={`“${title}”当前无法进入，页面不会加载任何未经验证的内容。`}
          nextStep="请稍后返回首页重试；若持续不可用，请通过“使用与数据说明”中的联系方式反馈。"
          testId="capability-unavailable"
          extra={
            <p className="status-panel__note" data-testid="capability-unavailable-reason">
              原因：{availability.reason ?? "该入口当前不可用。"}
            </p>
          }
          action={
            <Link className="button button--primary" to="/">
              返回首页
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page page--reading" data-testid={`capability-${capability}`}>
      {header}
      {children}
    </div>
  );
}
