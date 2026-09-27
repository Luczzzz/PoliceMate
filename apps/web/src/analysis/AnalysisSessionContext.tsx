import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AdvanceRoundRequest,
  AnalysisSessionState,
  DecisiveAnswer,
  FactStatus,
} from "@policymate/contracts";
import { ApiFailure, requestJson } from "../api/client";

/**
 * 案情分析会话状态。
 *
 * 会话标识与全部状态只存在于当前浏览器标签页的内存中：
 * 不写入 URL、localStorage/sessionStorage，也不形成可恢复历史。
 * 刷新或关闭标签页后，本次分析即不可恢复（符合产品规格的生命周期）。
 */
export type AnalysisFlowStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ready"; state: AnalysisSessionState }
  | { kind: "failed"; failure: ApiFailure };

interface AnalysisFlowContextValue {
  status: AnalysisFlowStatus;
  sessionId: string | null;
  /** 服务端会话已消失（过期/清除）；页面应回到输入页并提示。 */
  sessionGone: boolean;
  start: (caseText: string) => Promise<AnalysisSessionState>;
  refresh: () => Promise<void>;
  setFactStatus: (factId: string, status: FactStatus) => Promise<AnalysisSessionState>;
  setFactExclusion: (factId: string, excluded: boolean) => Promise<AnalysisSessionState>;
  addFact: (statement: string) => Promise<AnalysisSessionState>;
  advanceRound: (answers: DecisiveAnswer[]) => Promise<AnalysisSessionState>;
  confirmSnapshot: () => Promise<AnalysisSessionState>;
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

  const start = useCallback(
    (caseText: string) =>
      run(async () => {
        setSessionGone(false);
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
    (path: string, method: "POST" | "PUT", body?: unknown) =>
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

  const clear = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    setStatus({ kind: "idle" });
    setSessionGone(false);
    if (sessionId !== null) {
      try {
        await requestJson(`/api/v1/analysis/sessions/${sessionId}`, { method: "DELETE" });
      } catch {
        // 清除失败不阻断本地重置：服务端会话会随空闲过期失效。
      }
    }
  }, []);

  const dismissSessionGone = useCallback(() => setSessionGone(false), []);

  const value = useMemo<AnalysisFlowContextValue>(
    () => ({
      status,
      sessionId: sessionIdRef.current,
      sessionGone,
      start,
      refresh,
      setFactStatus,
      setFactExclusion,
      addFact,
      advanceRound,
      confirmSnapshot,
      clear,
      dismissSessionGone,
    }),
    [
      status,
      sessionGone,
      start,
      refresh,
      setFactStatus,
      setFactExclusion,
      addFact,
      advanceRound,
      confirmSnapshot,
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
