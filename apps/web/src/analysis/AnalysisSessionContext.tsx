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
  AdvanceRoundRequest,
  AnalysisReport,
  AnalysisSessionState,
  DecisiveAnswer,
  FactStatus,
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

interface AnalysisFlowContextValue {
  status: AnalysisFlowStatus;
  sessionId: string | null;
  /** 服务端会话已消失（过期/清除）；页面应回到输入页并提示。 */
  sessionGone: boolean;
  /** 当前有效的六模块报告；仅在绑定的事实快照仍有效时保留。 */
  report: AnalysisReport | null;
  start: (caseText: string) => Promise<AnalysisSessionState>;
  refresh: () => Promise<void>;
  setFactStatus: (factId: string, status: FactStatus) => Promise<AnalysisSessionState>;
  setFactExclusion: (factId: string, excluded: boolean) => Promise<AnalysisSessionState>;
  addFact: (statement: string) => Promise<AnalysisSessionState>;
  reviseFact: (
    factId: string,
    request: ReviseFactRequest,
  ) => Promise<AnalysisSessionState>;
  advanceRound: (answers: DecisiveAnswer[]) => Promise<AnalysisSessionState>;
  confirmSnapshot: () => Promise<AnalysisSessionState>;
  beginModification: () => Promise<AnalysisSessionState>;
  discardModification: () => Promise<AnalysisSessionState>;
  generateReport: () => Promise<AnalysisReport>;
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
  const sessionIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const applyState = useCallback((state: AnalysisSessionState) => {
    sessionIdRef.current = state.sessionId;
    setStatus({ kind: "ready", state });
    return state;
  }, []);

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      if (busyRef.current) {
        throw new ApiFailure("server", "上一次请求仍在处理中，请稍候。");
      }
      busyRef.current = true;
      setStatus((prev) => (prev.kind === "ready" ? prev : { kind: "busy" }));
      try {
        return await action();
      } catch (error) {
        const failure =
          error instanceof ApiFailure
            ? error
            : new ApiFailure("server", "服务暂时不可用，请稍后重试。");
        if (extractSessionGone(failure)) {
          sessionIdRef.current = null;
          setStatus({ kind: "idle" });
          setSessionGone(true);
        } else {
          setStatus({ kind: "failed", failure });
        }
        throw failure;
      } finally {
        busyRef.current = false;
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
    const valid =
      snapshot !== null && stageAllowsReport && snapshot.snapshotHash === report.snapshotHash;
    if (!valid) setReport(null);
  }, [report, status]);

  const start = useCallback(
    (caseText: string) =>
      run(async () => {
        setSessionGone(false);
        setReport(null);
        const state = await requestJson<AnalysisSessionState>("/api/v1/analysis/sessions", {
          method: "POST",
          body: { caseText },
          timeoutMs: 15_000,
        });
        return applyState(state);
      }),
    [applyState, run],
  );

  const refresh = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (sessionId === null) return;
    await run(async () => {
      const state = await requestJson<AnalysisSessionState>(
        `/api/v1/analysis/sessions/${sessionId}`,
        { method: "GET" },
      );
      return applyState(state);
    });
  }, [applyState, run]);

  const mutate = useCallback(
    (path: string, method: "POST" | "PUT" | "DELETE", body?: unknown) =>
      run(async () => {
        const state = await requestJson<AnalysisSessionState>(path, { method, body });
        return applyState(state);
      }),
    [applyState, run],
  );

  const setFactStatus = useCallback(
    (factId: string, status: FactStatus) => {
      const sessionId = sessionIdRef.current;
      return mutate(`/api/v1/analysis/sessions/${sessionId}/facts/${factId}/status`, "POST", {
        status,
      });
    },
    [mutate],
  );

  const setFactExclusion = useCallback(
    (factId: string, excluded: boolean) => {
      const sessionId = sessionIdRef.current;
      return mutate(`/api/v1/analysis/sessions/${sessionId}/facts/${factId}/exclusion`, "PUT", {
        excluded,
      });
    },
    [mutate],
  );

  const addFact = useCallback(
    (statement: string) => {
      const sessionId = sessionIdRef.current;
      return mutate(`/api/v1/analysis/sessions/${sessionId}/facts`, "POST", { statement });
    },
    [mutate],
  );

  const reviseFact = useCallback(
    (factId: string, request: ReviseFactRequest) => {
      const sessionId = sessionIdRef.current;
      return mutate(
        `/api/v1/analysis/sessions/${sessionId}/facts/${factId}/revision`,
        "POST",
        request,
      );
    },
    [mutate],
  );

  const advanceRound = useCallback(
    (answers: DecisiveAnswer[]) => {
      const sessionId = sessionIdRef.current;
      return mutate(`/api/v1/analysis/sessions/${sessionId}/rounds`, "POST", {
        answers,
      } satisfies AdvanceRoundRequest);
    },
    [mutate],
  );

  const confirmSnapshot = useCallback(() => {
    const sessionId = sessionIdRef.current;
    return mutate(`/api/v1/analysis/sessions/${sessionId}/snapshot`, "POST", {});
  }, [mutate]);

  const beginModification = useCallback(() => {
    const sessionId = sessionIdRef.current;
    return mutate(`/api/v1/analysis/sessions/${sessionId}/modifications`, "POST", {});
  }, [mutate]);

  const discardModification = useCallback(() => {
    const sessionId = sessionIdRef.current;
    return mutate(`/api/v1/analysis/sessions/${sessionId}/modifications`, "DELETE");
  }, [mutate]);

  const generateReport = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (sessionId === null || status.kind !== "ready" || status.state.snapshot === null) {
      throw new ApiFailure("server", "请先确认事实快照后再生成报告。", { status: 409 });
    }
    const requestId = crypto.randomUUID();
    const snapshot = status.state.snapshot;
    return run(async () => {
      const created = await requestJson<AnalysisReport>(`/api/v1/analysis/sessions/${sessionId}/report`, {
        method: "POST",
        body: { contractVersion: "1.0", requestId, snapshotVersion: snapshot.snapshotVersion, snapshotHash: snapshot.snapshotHash },
        timeoutMs: 30_000,
      });
      if (created.requestId !== requestId || created.snapshotHash !== snapshot.snapshotHash) {
        throw new ApiFailure("contract", "报告响应与当前事实快照不匹配，已丢弃。", { status: 409 });
      }
      setReport(created);
      return created;
    });
  }, [run, status]);

  const clear = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
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
  }, []);

  const dismissSessionGone = useCallback(() => setSessionGone(false), []);

  /**
   * 空闲 30 分钟后会话不可恢复：清除事实、报告、临时标记、筛选与折叠状态。
   * 任意用户交互重置计时；计时器只在会话仍然存在时运行。
   */
  useEffect(() => {
    if (status.kind !== "ready" && status.kind !== "busy") return;
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
  }, [status.kind, clear]);

  const value = useMemo<AnalysisFlowContextValue>(
    () => ({
      status,
      sessionId: sessionIdRef.current,
      sessionGone,
      report,
      start,
      refresh,
      setFactStatus,
      setFactExclusion,
      addFact,
      reviseFact,
      advanceRound,
      confirmSnapshot,
      beginModification,
      discardModification,
      generateReport,
      clear,
      dismissSessionGone,
    }),
    [
      status,
      sessionGone,
      report,
      start,
      refresh,
      setFactStatus,
      setFactExclusion,
      addFact,
      reviseFact,
      advanceRound,
      confirmSnapshot,
      beginModification,
      discardModification,
      generateReport,
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
