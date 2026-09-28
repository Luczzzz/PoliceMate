import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { EvidenceHoldingStatus, EvidencePriority } from "@policymate/contracts";
import { useAnalysisFlow } from "./AnalysisSessionContext";

/**
 * 报告临时工作台状态。
 *
 * 状态挂在路由之上、只存在于当前标签页内存：同一份报告有效时，模块切换或
 * 返回首页后再次进入报告可以保留标记；报告失效或形成新报告时立即重置，
 * 不按项目 ID、文本或相似度迁移。
 */

export type MarkFilter = "all" | "reviewed" | "focus";

export interface EvidenceFilters {
  mark: MarkFilter;
  priority: EvidencePriority | null;
  holdingStatus: EvidenceHoldingStatus | null;
}

export interface InterviewFilters {
  mark: MarkFilter;
  role: string | null;
}

interface WorkbenchStore {
  /** 当前工作台绑定的报告标识；变化即重置。 */
  identity: string | null;
  reviewed: string[];
  focus: string[];
  collapsed: Record<string, boolean>;
  evidence: EvidenceFilters;
  interview: InterviewFilters;
}

const EMPTY_EVIDENCE: EvidenceFilters = { mark: "all", priority: null, holdingStatus: null };
const EMPTY_INTERVIEW: InterviewFilters = { mark: "all", role: null };

function emptyStore(identity: string | null): WorkbenchStore {
  return {
    identity,
    reviewed: [],
    focus: [],
    collapsed: {},
    evidence: { ...EMPTY_EVIDENCE },
    interview: { ...EMPTY_INTERVIEW },
  };
}

interface WorkbenchContextValue {
  reviewed: string[];
  focus: string[];
  toggleReviewed: (itemId: string) => void;
  toggleFocus: (itemId: string) => void;
  isCollapsed: (key: string) => boolean;
  toggleCollapsed: (key: string) => void;
  evidenceFilters: EvidenceFilters;
  setEvidenceFilters: (update: Partial<EvidenceFilters>) => void;
  clearEvidenceFilters: () => void;
  interviewFilters: InterviewFilters;
  setInterviewFilters: (update: Partial<InterviewFilters>) => void;
  clearInterviewFilters: () => void;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const { report } = useAnalysisFlow();
  const identity = report?.requestId ?? null;
  const [store, setStore] = useState<WorkbenchStore>(() => emptyStore(identity));

  // 报告标识变化（新报告或报告失效）时立即重置全部临时工作台状态。
  if (store.identity !== identity) {
    setStore(emptyStore(identity));
  }

  const toggleReviewed = useCallback((itemId: string) => {
    setStore((prev) => ({ ...prev, reviewed: toggleValue(prev.reviewed, itemId) }));
  }, []);
  const toggleFocus = useCallback((itemId: string) => {
    setStore((prev) => ({ ...prev, focus: toggleValue(prev.focus, itemId) }));
  }, []);
  const toggleCollapsed = useCallback((key: string) => {
    setStore((prev) => ({ ...prev, collapsed: { ...prev.collapsed, [key]: !prev.collapsed[key] } }));
  }, []);
  const setEvidenceFilters = useCallback((update: Partial<EvidenceFilters>) => {
    setStore((prev) => ({ ...prev, evidence: { ...prev.evidence, ...update } }));
  }, []);
  const clearEvidenceFilters = useCallback(() => {
    setStore((prev) => ({ ...prev, evidence: { ...EMPTY_EVIDENCE } }));
  }, []);
  const setInterviewFilters = useCallback((update: Partial<InterviewFilters>) => {
    setStore((prev) => ({ ...prev, interview: { ...prev.interview, ...update } }));
  }, []);
  const clearInterviewFilters = useCallback(() => {
    setStore((prev) => ({ ...prev, interview: { ...EMPTY_INTERVIEW } }));
  }, []);

  const value = useMemo<WorkbenchContextValue>(
    () => ({
      reviewed: store.reviewed,
      focus: store.focus,
      toggleReviewed,
      toggleFocus,
      isCollapsed: (key: string) => store.collapsed[key] === true,
      toggleCollapsed,
      evidenceFilters: store.evidence,
      setEvidenceFilters,
      clearEvidenceFilters,
      interviewFilters: store.interview,
      setInterviewFilters,
      clearInterviewFilters,
    }),
    [
      store.reviewed,
      store.focus,
      store.collapsed,
      store.evidence,
      store.interview,
      toggleReviewed,
      toggleFocus,
      toggleCollapsed,
      setEvidenceFilters,
      clearEvidenceFilters,
      setInterviewFilters,
      clearInterviewFilters,
    ],
  );

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchContextValue {
  const value = useContext(WorkbenchContext);
  if (value === null) {
    throw new Error("useWorkbench 必须在 WorkbenchProvider 内使用");
  }
  return value;
}
