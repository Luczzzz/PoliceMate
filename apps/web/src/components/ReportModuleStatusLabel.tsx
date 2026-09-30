import type { ReportModuleStatus } from "@policymate/contracts";

const LABELS: Record<ReportModuleStatus, string> = {
  present: "供核验",
  not_applicable: "不适用",
  insufficient_facts: "事实不足",
  basis_unavailable: "依据不可用",
  conflicting: "存在争议",
  generation_failed: "生成失败",
};

export function ReportModuleStatusLabel({ status }: { status: ReportModuleStatus }) {
  return <span className={`report-module__status report-module__status--${status}`}>{LABELS[status]}</span>;
}
