import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type StatusVariant =
  | "offline"
  | "service"
  | "contract"
  | "unavailable"
  | "not_found"
  | "page_error";

const SYMBOLS: Record<StatusVariant, IconName> = {
  offline: "wifiOff",
  service: "alert",
  contract: "refresh",
  unavailable: "alert",
  not_found: "help",
  page_error: "alert",
};

const ALERT_VARIANTS: ReadonlySet<StatusVariant> = new Set([
  "offline",
  "service",
  "contract",
  "page_error",
]);

export interface StatusPanelProps {
  variant: StatusVariant;
  title: string;
  impact: string;
  nextStep: string;
  action?: ReactNode;
  extra?: ReactNode;
  testId?: string;
}

/**
 * 通用状态面板。关键状态同时使用文字、符号和颜色表达，不只依赖颜色；
 * 每个状态都必须说明影响和可执行的下一步。
 */
export function StatusPanel({
  variant,
  title,
  impact,
  nextStep,
  action,
  extra,
  testId,
}: StatusPanelProps) {
  return (
    <section
      className={`status-panel status-panel--${variant}`}
      data-testid={testId ?? `status-${variant}`}
      data-variant={variant}
      role={ALERT_VARIANTS.has(variant) ? "alert" : "status"}
      aria-live={ALERT_VARIANTS.has(variant) ? "assertive" : "polite"}
    >
      <span className="status-panel__symbol" aria-hidden="true">
        <Icon name={SYMBOLS[variant]} size={23} />
      </span>
      <h2 className="status-panel__title">{title}</h2>
      <dl className="status-panel__detail">
        <dt>影响</dt>
        <dd>{impact}</dd>
        <dt>下一步</dt>
        <dd>{nextStep}</dd>
      </dl>
      {extra}
      {action ? <div className="status-panel__actions">{action}</div> : null}
    </section>
  );
}
