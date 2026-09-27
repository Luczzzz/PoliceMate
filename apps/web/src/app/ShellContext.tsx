import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ProductShellResponse } from "@policymate/contracts";
import { useJsonResource, type ResourceState } from "../hooks/useJsonResource";

export type ShellState = ResourceState<ProductShellResponse>;

interface ShellContextValue {
  state: ShellState;
  reload: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

/**
 * 首页与入口页从后端读取能力可用状态。页面不得根据文案或点击结果推断可用性。
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const { state, reload } = useJsonResource<ProductShellResponse>("/api/v1/shell");
  const value = useMemo<ShellContextValue>(() => ({ state, reload }), [state, reload]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (value === null) {
    throw new Error("useShell 必须在 ShellProvider 内使用");
  }
  return value;
}
