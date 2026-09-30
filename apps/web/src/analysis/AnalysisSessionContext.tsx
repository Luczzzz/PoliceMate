import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AnalysisIntakeResponse,
  AnalysisReport,
  AnalysisSessionState,
  AnalysisSubmissionResponse,
  FactCategory,
  FactStatus,
  GapAnswer,
  ReviseFactRequest,
} from "@policymate/contracts";
import { ApiFailure, requestJson } from "../api/client";

/**
 * 案情分析会话状态。
 *
 * 一次提交可能因输入包含互不相关的事项而拆成多份分析；每份分析有独立会话
 * 标识、独立事实快照与独立报告，前端在当前标签页内切换。会话标识、报告与
 * 临时工作台状态只存在于当前浏览器标签页的内存中：不写入 URL、
 * localStorage/sessionStorage，也不形成可恢复历史。刷新或关闭标签页后，
 * 本次分析即不可恢复（符合产品规格的生命周期）。
 */
export type AnalysisFlowStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ready"; state: AnalysisSessionState }
  | { kind: "failed"; failure: ApiFailure };

/** 会话内保存的一份分析：独立状态与绑定其快照的报告。 */
export interface StoredAnalysis {
  state: AnalysisSessionState;
  /** 报告失效（快照被替换或会话被清除）时为 `null`。 */
  report: AnalysisReport | null;
}

/** 会话空闲上限：与产品规格一致（30 分钟不可恢复）。 */
export const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
/**
 * 提交案情一次请求内完成提取、拆分与报告生成：提取最多 30 秒、每份报告
 * 最多 90 秒（均含一次自动重试），客户端留出传输余量。
 */
export const SUBMISSION_REQUEST_TIMEOUT_MS = 125 * 1000;
/** 单独重新生成报告最多等待 90 秒（含一次自动重试）；客户端留出传输余量。 */
export const REPORT_REQUEST_TIMEOUT_MS = 95 * 1000;

/** 正在进行的真实阶段。只描述真实处理阶段，不显示虚假百分比。 */
export interface PendingOperation {
  label: string;
  startedAt: number;
}

interface AnalysisFlowContextValue {
  status: AnalysisFlowStatus;
  sessionId: string | null;
  /** 服务端会话已消失（过期/清除）；页面应回到输入页并提示。 */
  sessionGone: boolean;
  /** 当前选中分析的有效六模块报告；仅在绑定的事实快照仍有效时保留。 */
  report: AnalysisReport | null;
  /** 本次提交拆出的全部分析；单一连续案情时长度为 1。 */
  analyses: StoredAnalysis[];
  /** 当前选中的分析序号（从 0 开始）。 */
  selectedAnalysisIndex: number;
  /** 在多份分析之间切换。 */
  selectAnalysis: (index: number) => void;
  /** 因新快照而失效的旧报告标识；有值时报告页必须显示失效说明。 */
  supersededReport: { snapshotVersion: number; snapshotHash: string } | null;
  dismissSupersededReport: () => void;
  /** 正在进行的长任务（真实阶段 + 已等待时间由界面计算）。 */
  pendingOperation: PendingOperation | null;
  start: (caseText: string) => Promise<AnalysisSessionState>;
  refresh: () => Promise<void>;
  addFact: (
    statement: string,
    category?: FactCategory,
    resolvesGapId?: string,
  ) => Promise<AnalysisSessionState>;
  /** 逐项标记：确认 / 否认 / 未知 / 争议。 */
  setFactStatus: (
    factId: string,
    status: Exclude<FactStatus, "candidate">,
  ) => Promise<AnalysisSessionState>;
  reviseFact: (
    factId: string,
    request: ReviseFactRequest,
  ) => Promise<AnalysisSessionState>;
  confirmSnapshot: () => Promise<AnalysisSessionState>;
  beginModification: () => Promise<AnalysisSessionState>;
  discardModification: () => Promise<AnalysisSessionState>;
  /** 对决定性缺口回答“未知”或“待核实”，保持分支呈现。 */
  answerGap: (gapId: string, answer: GapAnswer) => Promise<AnalysisReport>;
  generateReport: () => Promise<AnalysisReport>;
  /** 取消在途请求：迟到响应会被拒绝，不写回页面。 */
  cancel: () => void;
  clear: () => Promise<void>;
  dismissSessionGone: () => void;
}

const AnalysisFlowContext = createContext<AnalysisFlowContextValue | null>(null);

type FlowPhase = "idle" | "busy" | "ready" | "failed";

function extractSessionGone(failure: ApiFailure): boolean {
  return failure.status === 404;
}

export function AnalysisFlowProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [analyses, setAnalyses] = useState<StoredAnalysis[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sessionGone, setSessionGone] = useState(false);
  const [supersededReport, setSupersededReport] = useState<
    { snapshotVersion: number; snapshotHash: string } | null
  >(null);
  const [hasSession, setHasSession] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const selectedIndexRef = useRef(0);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  /** 在途请求代次：清除、取消或新快照后递增，迟到响应不得写回。 */
  const epochRef = useRef(0);

  const status = useMemo<AnalysisFlowStatus>(() => {
    if (phase === "busy") return { kind: "busy" };
    if (phase === "failed") {
      return {
        kind: "failed",
        failure: failure ?? new ApiFailure("server", "服务暂时不可用，请稍后重试。"),
      };
    }
    const current = analyses[selectedIndex];
    if (phase === "ready" && current !== undefined) {
      return { kind: "ready", state: current.state };
    }
    return { kind: "idle" };
  }, [phase, failure, analyses, selectedIndex]);

  const report = analyses[selectedIndex]?.report ?? null;
  const sessionId = analyses[selectedIndex]?.state.sessionId ?? null;

  /** 用后端返回的会话状态更新对应的分析（按会话标识定位，避免切走后写错）。 */
  const applyState = useCallback((state: AnalysisSessionState) => {
    // 不在这里改 sessionIdRef：它始终跟随当前选中的分析，由 start / selectAnalysis 维护。
    setHasSession(true);
    setAnalyses((prev) => {
      const index = prev.findIndex((item) => item.state.sessionId === state.sessionId);
      const target = index === -1 ? selectedIndexRef.current : index;
      return prev.map((item, i) => (i === target ? { ...item, state } : item));
    });
    return state;
  }, []);

  /** 只更新对应分析的报告（按会话标识定位，不改变会话状态）。 */
  const applyReport = useCallback((next: AnalysisReport | null) => {
    setAnalyses((prev) => {
      const index =
        next === null
          ? -1
          : prev.findIndex((item) => item.state.sessionId === next.sessionId);
      const target = index === -1 ? selectedIndexRef.current : index;
      return prev.map((item, i) => (i === target ? { ...item, report: next } : item));
    });
  }, []);

  /** 取消当前在途请求，并使所有迟到响应失效。 */
  const invalidateInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    epochRef.current += 1;
    busyRef.current = false;
    setPendingOperation(null);
  }, []);

  const run = useCallback(
    async <T,>(label: string, action: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      if (busyRef.current) {
        throw new ApiFailure("server", "上一次请求仍在处理中，请稍候。");
      }
      busyRef.current = true;
      const epoch = epochRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setPendingOperation({ label, startedAt: Date.now() });
      setPhase((prev) => (prev === "ready" ? prev : "busy"));
      try {
        const result = await action(controller.signal);
        if (epochRef.current !== epoch) {
          throw new ApiFailure("cancelled", "请求已取消。");
        }
        setPhase("ready");
        return result;
      } catch (error) {
        const failure =
          error instanceof ApiFailure
            ? error
            : new ApiFailure("server", "服务暂时不可用，请稍后重试。");
        // 已被取消或清除的请求不得覆盖当前页面状态。
        if (epochRef.current !== epoch) {
          throw failure;
        }
        if (extractSessionGone(failure)) {
          sessionIdRef.current = null;
          setHasSession(false);
          setSessionGone(true);
          setPhase("idle");
        } else {
          setFailure(failure);
          setPhase("failed");
        }
        throw failure;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (epochRef.current === epoch) {
          busyRef.current = false;
          setPendingOperation(null);
        }
      }
    },
    [],
  );

  /**
   * 报告只在其绑定的事实快照仍然有效时保留。
   *
   * “补充或修改事实”阶段旧报告仍可见（显示“修改尚未应用”）；一旦确认新事实
   * 快照，快照哈希改变，旧报告立即失效，不得按 ID、文本或相似度迁移。
   */
  useEffect(() => {
    setAnalyses((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.report === null) return item;
        const stageAllowsReport =
          item.state.stage === "snapshot_confirmed" || item.state.stage === "modifying_facts";
        const valid = stageAllowsReport && item.state.snapshot.snapshotHash === item.report.snapshotHash;
        if (valid) return item;
        changed = true;
        return { ...item, report: null };
      });
      return changed ? next : prev;
    });
  }, [analyses]);

  const selectAnalysis = useCallback(
    (index: number) => {
      if (index < 0 || index >= analyses.length) return;
      selectedIndexRef.current = index;
      setSelectedIndex(index);
      sessionIdRef.current = analyses[index]?.state.sessionId ?? null;
      setSupersededReport(null);
    },
    [analyses],
  );

  const start = useCallback(
    (caseText: string) =>
      run("提取候选事实、拆分事项并生成报告", async (signal) => {
        setSessionGone(false);
        setSupersededReport(null);
        setAnalyses([]);
        selectedIndexRef.current = 0;
        setSelectedIndex(0);
        const intake = await requestJson<AnalysisIntakeResponse>("/api/v1/analysis/sessions", {
          method: "POST",
          body: { caseText },
          timeoutMs: SUBMISSION_REQUEST_TIMEOUT_MS,
          signal,
        });
        const stored: StoredAnalysis[] = intake.analyses.map((analysis) => ({
          state: analysis.state,
          report: analysis.report,
        }));
        if (stored.length === 0) {
          throw new ApiFailure("server", "提交案情后未返回任何分析，请稍后重试。");
        }
        setAnalyses(stored);
        const firstState = stored[0].state;
        sessionIdRef.current = firstState.sessionId;
        setHasSession(true);
        return firstState;
      }),
    [run],
  );

  const refresh = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (sessionId === null) return;
    await run("读取本次分析状态", async (signal) => {
      const state = await requestJson<AnalysisSessionState>(
        `/api/v1/analysis/sessions/${sessionId}`,
        { method: "GET", signal },
      );
      return applyState(state);
    });
  }, [applyState, run]);

  const mutate = useCallback(
    (
      label: string,
      path: string,
      method: "POST" | "PUT" | "DELETE",
      body?: unknown,
      timeoutMs?: number,
    ) =>
      run(label, async (signal) => {
        const state = await requestJson<AnalysisSessionState>(path, {
          method,
          body,
          signal,
          timeoutMs,
        });
        return applyState(state);
      }),
    [applyState, run],
  );

  const addFact = useCallback(
    (statement: string, category?: FactCategory, resolvesGapId?: string) => {
      const sessionId = sessionIdRef.current;
      return mutate("新增事实", `/api/v1/analysis/sessions/${sessionId}/facts`, "POST", {
        statement,
        category,
        resolvesGapId,
      });
    },
    [mutate],
  );

  const reviseFact = useCallback(
    (factId: string, request: ReviseFactRequest) => {
      const sessionId = sessionIdRef.current;
      return mutate(
        "创建替代事实项",
        `/api/v1/analysis/sessions/${sessionId}/facts/${factId}/revision`,
        "POST",
        request,
      );
    },
    [mutate],
  );

  const setFactStatus = useCallback(
    (factId: string, status: Exclude<FactStatus, "candidate">) => {
      const sessionId = sessionIdRef.current;
      return mutate(
        "标记事实状态",
        `/api/v1/analysis/sessions/${sessionId}/facts/${factId}/status`,
        "POST",
        { status },
      );
    },
    [mutate],
  );

  const confirmSnapshot = useCallback(() => {
    const sessionId = sessionIdRef.current;
    const selectedAtStart = selectedIndexRef.current;
    const previousReport = analyses[selectedAtStart]?.report ?? null;
    // 形成新快照会废弃依赖旧快照的在途工作与迟到响应。
    invalidateInFlight();
    return run("确认事实快照并重新生成报告", async (signal) => {
      const submission = await requestJson<AnalysisSubmissionResponse>(
        `/api/v1/analysis/sessions/${sessionId}/snapshot`,
        { method: "POST", body: {}, timeoutMs: SUBMISSION_REQUEST_TIMEOUT_MS, signal },
      );
      // 旧报告立即失效：只保留新报告，并记录旧快照标识供页面提示。
      // 若期间已切走，不在另一份分析上显示旧报告失效提示。
      if (
        previousReport !== null &&
        previousReport.snapshotHash !== submission.report.snapshotHash &&
        selectedIndexRef.current === selectedAtStart
      ) {
        setSupersededReport({
          snapshotVersion: previousReport.snapshotVersion,
          snapshotHash: previousReport.snapshotHash,
        });
      }
      applyReport(submission.report);
      return applyState(submission.state);
    });
  }, [analyses, applyReport, applyState, invalidateInFlight, run]);

  /**
   * 对决定性缺口回答“未知”或“待核实”。
   *
   * 回答不改变事实快照，缺口仍未解决，因此后端返回的新报告必须继续保持
   * 分支呈现；页面直接采用后端报告，不自行推断。
   */
  const answerGap = useCallback(
    (gapId: string, answer: GapAnswer) => {
      const sessionId = sessionIdRef.current;
      return run("记录决定性缺口回答", async (signal) => {
        const submission = await requestJson<AnalysisSubmissionResponse>(
          `/api/v1/analysis/sessions/${sessionId}/gaps/${gapId}/answer`,
          { method: "POST", body: { answer }, timeoutMs: REPORT_REQUEST_TIMEOUT_MS, signal },
        );
        applyReport(submission.report);
        applyState(submission.state);
        return submission.report;
      });
    },
    [applyReport, applyState, run],
  );

  const beginModification = useCallback(() => {
    const sessionId = sessionIdRef.current;
    return mutate(
      "进入补充或修改事实",
      `/api/v1/analysis/sessions/${sessionId}/modifications`,
      "POST",
      {},
    );
  }, [mutate]);

  const discardModification = useCallback(() => {
    const sessionId = sessionIdRef.current;
    return mutate(
      "放弃未确认的修改",
      `/api/v1/analysis/sessions/${sessionId}/modifications`,
      "DELETE",
    );
  }, [mutate]);

  const generateReport = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const current = analyses[selectedIndexRef.current];
    if (sessionId === null || current === undefined) {
      throw new ApiFailure("server", "请先形成事实快照后再生成报告。", { status: 409 });
    }
    const requestId = crypto.randomUUID();
    const snapshot = current.state.snapshot;
    return run("生成并校验完整报告", async (signal) => {
      const created = await requestJson<AnalysisReport>(
        `/api/v1/analysis/sessions/${sessionId}/report`,
        {
          method: "POST",
          body: {
            contractVersion: "1.0",
            requestId,
            snapshotVersion: snapshot.snapshotVersion,
            snapshotHash: snapshot.snapshotHash,
          },
          timeoutMs: REPORT_REQUEST_TIMEOUT_MS,
          signal,
        },
      );
      if (created.requestId !== requestId || created.snapshotHash !== snapshot.snapshotHash) {
        throw new ApiFailure("contract", "报告响应与当前事实快照不匹配，已丢弃。", { status: 409 });
      }
      applyReport(created);
      return created;
    });
  }, [analyses, applyReport, run]);

  const cancel = useCallback(() => {
    invalidateInFlight();
    setPhase((prev) => (prev === "busy" ? "idle" : prev));
  }, [invalidateInFlight]);

  const clear = useCallback(async () => {
    const sessionIds = analyses.map((item) => item.state.sessionId);
    invalidateInFlight();
    sessionIdRef.current = null;
    selectedIndexRef.current = 0;
    setSelectedIndex(0);
    setAnalyses([]);
    setHasSession(false);
    setPhase("idle");
    setFailure(null);
    setSessionGone(false);
    setSupersededReport(null);
    // 清除本次提交拆出的全部分析；失败不阻断本地重置（服务端会话会随空闲过期）。
    for (const sessionId of sessionIds) {
      try {
        await requestJson(`/api/v1/analysis/sessions/${sessionId}`, { method: "DELETE" });
      } catch {
        // 清除失败不阻断本地重置。
      }
    }
  }, [analyses, invalidateInFlight]);

  const dismissSessionGone = useCallback(() => setSessionGone(false), []);
  const dismissSupersededReport = useCallback(() => setSupersededReport(null), []);

  /**
   * 存在未清除案情时设置通用离开提醒。提醒不含案情摘要，也不承诺恢复；
   * 浏览器不显示提醒时产品不承诺恢复任何内容。
   */
  useEffect(() => {
    if (!hasSession) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasSession]);

  /**
   * 空闲 30 分钟后会话不可恢复：清除事实、报告、临时标记、筛选与折叠状态。
   * 任意用户交互重置计时；计时器只在会话仍然存在时运行。
   */
  useEffect(() => {
    if (!hasSession) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void clear();
      }, SESSION_IDLE_TTL_MS);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const event of events) window.addEventListener(event, reset, { passive: true });
    document.addEventListener("visibilitychange", reset);
    reset();
    return () => {
      clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [hasSession, clear]);

  const value = useMemo<AnalysisFlowContextValue>(
    () => ({
      status,
      sessionId,
      sessionGone,
      report,
      analyses,
      selectedAnalysisIndex: selectedIndex,
      selectAnalysis,
      supersededReport,
      dismissSupersededReport,
      pendingOperation,
      start,
      refresh,
      addFact,
      reviseFact,
      setFactStatus,
      confirmSnapshot,
      beginModification,
      discardModification,
      answerGap,
      generateReport,
      cancel,
      clear,
      dismissSessionGone,
    }),
    [
      status,
      sessionId,
      sessionGone,
      report,
      analyses,
      selectedIndex,
      selectAnalysis,
      supersededReport,
      dismissSupersededReport,
      pendingOperation,
      start,
      refresh,
      addFact,
      reviseFact,
      setFactStatus,
      confirmSnapshot,
      beginModification,
      discardModification,
      answerGap,
      generateReport,
      cancel,
      clear,
      dismissSessionGone,
    ],
  );

  return <AnalysisFlowContext.Provider value={value}>{children}</AnalysisFlowContext.Provider>;
}

export function useAnalysisFlow(): AnalysisFlowContextValue {
  const value = useContext(AnalysisFlowContext);
  if (value === null) {
    throw new Error("useAnalysisFlow 必须在 AnalysisFlowProvider 内使用");
  }
  return value;
}
