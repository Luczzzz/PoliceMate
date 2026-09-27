import { useCallback, useEffect, useState } from "react";
import { ApiFailure, getJson } from "../api/client";

export type ResourceState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; failure: ApiFailure };

/**
 * 从 PoliceMate 后端读取一个 JSON 资源，并返回一致的可重试状态。
 * 组件卸载或重新加载时取消在途请求，避免迟到响应回写。
 */
export function useJsonResource<T>(
  path: string,
  options: { timeoutMs?: number } = {},
): { state: ResourceState<T>; reload: () => void } {
  const { timeoutMs } = options;
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });

    getJson<T>(path, { signal: controller.signal, timeoutMs })
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const failure =
          error instanceof ApiFailure
            ? error
            : new ApiFailure("server", "服务暂时不可用，请稍后重试。");
        setState({ status: "error", failure });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [path, reloadToken, timeoutMs]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  return { state, reload };
}
