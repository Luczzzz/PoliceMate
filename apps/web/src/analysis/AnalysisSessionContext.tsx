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
  AnalysisReport,
  AnalysisSessionState,
  AnalysisSubmissionResponse,
  ReviseFactRequest,
} from "@policymate/contracts";
import { ApiFailure, requestJson } from "../api/client";

/**
 * 案情分析会话状态。
 *
 * 会话标识、报告与临时工作台状态只存在于当前浏览器标签页的内存中：
 * 不写入 URL、localStorage/sessionStorage，也不形成可恢复历史。
 * 刷新或关闭标签页后，本次分析即不可恢复（符合产品规格的生命周期）。
 */
export type AnalysisFlowStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ready"; state: AnalysisSessionState }
  | { kind: "failed"; failure: ApiFailure };

/** 会话空闲上限：与产品规格一致（30 分钟不可恢复）。 */
export const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
/**
 * 提交案情一次请求内完成提取与报告生成：提取最多 30 秒、报告最多 90 秒
 * （均含一次自动重试），客户端留出传输余量。
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
  /** 当前有效的六模块报告；仅在绑定的事实快照仍有效时保留。 */
  report: AnalysisReport | null;
  /** 正在进行的长任务（真实阶段 + 已等待时间由界面计算）。 */
  pendingOperation: PendingOperation | null;
  start: (caseText: string) => Promise<AnalysisSessionState>;
  refresh: () => Promise<void>;
  addFact: (statement: string) => Promise<AnalysisSessionState>;
  reviseFact: (
    factId: string,
    request: ReviseFactRequest,
  ) => Promise<AnalysisSessionState>;
  confirmSnapshot: () => Promise<AnalysisSessionState>;
  beginModification: () => Promise<AnalysisSessionState>;
  discardModification: () => Promise<AnalysisSessionState>;
  generateReport: () => Promise<AnalysisReport>;
  /** 取消在途请求：迟到响应会被拒绝，不写回页面。 */
  cancel: () => void;
  clear: () => Promise<void>;
  dismissSessionGone: () => void;
}

const AnalysisFlowContext = createContext<AnalysisFlowContextValue | null>(null);

function extractSessionGone(failure: ApiFailure): boolean {
  return failure.status === 404;
}

export function AnalysisFlowProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AnalysisFlowStatus>({ kind: "idle" });
  const [sessionGone, setSessionGone] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  /** 在途请求代次：清除、取消或新快照后递增，迟到响应不得写回。 */
  const epochRef = useRef(0);

  const applyState = useCallback((state: AnalysisSessionState) => {
    sessionIdRef.current = state.sessionId;
    setHasSession(true);
    setStatus({ kind: "ready", state });
    return state;
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
      setStatus((prev) => (prev.kind === "ready" ? prev : { kind: "busy" }));
      try {
        const result = await action(controller.signal);
        if (epochRef.current !== epoch) {
          throw new ApiFailure("cancelled", "请求已取消。");
        }
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
          setStatus({ kind: "idle" });
          setSessionGone(true);
        } else {
          setStatus({ kind: "failed", failure });
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
    if (report === null || status.kind !== "ready") return;
    const state = status.state;
    const snapshot = state.snapshot;
    const stageAllowsReport = state.stage === "snapshot_confirmed" || state.stage === "modifying_facts";
    const valid = stageAllowsReport && snapshot.snapshotHash === report.snapshotHash;
    if (!valid) setReport(null);
  }, [report, status]);

  const start = useCallback(
    (caseText: string) =>
      run("提取候选事实并生成报告", async (signal) => {
        setSessionGone(false);
        setReport(null);
        const submission = await requestJson<AnalysisSubmissionResponse>(
          "/api/v1/analysis/sessions",
          {
            method: "POST",
            body: { caseText },
            timeoutMs: SUBMISSION_REQUEST_TIMEOUT_MS,
            signal,
          },
        );
        setReport(submission.report);
        return applyState(submission.state);
      }),
    [applyState, run],
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
    (statement: string) => {
      const sessionId = sessionIdRef.current;
      return mutate("新增事实", `/api/v1/analysis/sessions/${sessionId}/facts`, "POST", {
        statement,
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

  const confirmSnapshot = useCallback(() => {
    const sessionId = sessionIdRef.current;
    // 形成新快照会废弃依赖旧快照的在途工作与迟到响应。
    invalidateInFlight();
    return run("确认事实快照并重新生成报告", async (signal) => {
      const submission = await requestJson<AnalysisSubmissionResponse>(
        `/api/v1/analysis/sessions/${sessionId}/snapshot`,
        { method: "POST", body: {}, timeoutMs: SUBMISSION_REQUEST_TIMEOUT_MS, signal },
      );
      setReport(submission.report);
      return applyState(submission.state);
    });
  }, [applyState, invalidateInFlight, run]);

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
    if (sessionId === null || status.kind !== "ready") {
      throw new ApiFailure("server", "请先形成事实快照后再生成报告。", { status: 409 });
    }
    const requestId = crypto.randomUUID();
    const snapshot = status.state.snapshot;
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
      setReport(created);
      return created;
    });
  }, [run, status]);

  const cancel = useCallback(() => {
    invalidateInFlight();
    setStatus((prev) => (prev.kind === "busy" ? { kind: "idle" } : prev));
  }, [invalidateInFlight]);

  const clear = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    invalidateInFlight();
    sessionIdRef.current = null;
    setHasSession(false);
    setStatus({ kind: "idle" });
    setSessionGone(false);
    setReport(null);
    if (sessionId !== null) {
      try {
        await requestJson(`/api/v1/analysis/sessions/${sessionId}`, { method: "DELETE" });
      } catch {
        // 清除失败不阻断本地重置：服务端会话会随空闲过期失效。
      }
    }
  }, [invalidateInFlight]);

  const dismissSessionGone = useCallback(() => setSessionGone(false), []);

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
      sessionId: sessionIdRef.current,
      sessionGone,
      report,
      pendingOperation,
      start,
      refresh,
      addFact,
      reviseFact,
      confirmSnapshot,
      beginModification,
      discardModification,
      generateReport,
      cancel,
      clear,
      dismissSessionGone,
    }),
    [
      status,
      sessionGone,
      report,
      pendingOperation,
      start,
      refresh,
      addFact,
      reviseFact,
      confirmSnapshot,
      beginModification,
      discardModification,
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
