import { CONTRACT_VERSION } from "@policymate/contracts";

/** 客户端可区分的失败类型；用于映射到具体的用户可见状态。 */
export type ApiFailureKind = "offline" | "timeout" | "server" | "contract" | "malformed";

interface ApiFailureOptions {
  code?: string | null;
  requestId?: string | null;
  status?: number | null;
}

export class ApiFailure extends Error {
  readonly kind: ApiFailureKind;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly status: number | null;

  constructor(kind: ApiFailureKind, message: string, options: ApiFailureOptions = {}) {
    super(message);
    this.name = "ApiFailure";
    this.kind = kind;
    this.code = options.code ?? null;
    this.requestId = options.requestId ?? null;
    this.status = options.status ?? null;
  }
}

const DEFAULT_TIMEOUT_MS = 8000;

interface ErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
    requestId?: unknown;
  };
}

function extractEnvelope(body: unknown): { code: string | null; message: string | null; requestId: string | null } {
  if (body === null || typeof body !== "object") {
    return { code: null, message: null, requestId: null };
  }
  const envelope = body as ErrorEnvelope;
  const error = envelope.error;
  if (error === undefined || error === null || typeof error !== "object") {
    return { code: null, message: null, requestId: null };
  }
  return {
    code: typeof error.code === "string" ? error.code : null,
    message: typeof error.message === "string" ? error.message : null,
    requestId: typeof error.requestId === "string" ? error.requestId : null,
  };
}

/**
 * 同源读取 JSON。所有请求都携带契约版本；响应版本不兼容时停止解析，
 * 不猜测字段含义。
 */
export async function getJson<T>(
  path: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const forwardAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(path, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-pm-contract-version": CONTRACT_VERSION,
      },
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch {
    if (externalSignal?.aborted === true) {
      throw new ApiFailure("offline", "请求已取消。");
    }
    if (controller.signal.aborted) {
      throw new ApiFailure("timeout", "请求超时，请检查网络后重试。");
    }
    throw new ApiFailure("offline", "网络不可用，请检查网络连接后重试。");
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const envelope = extractEnvelope(body);
    const status = response.status;
    const kind: ApiFailureKind =
      status === 409 && envelope.code === "contract_incompatible" ? "contract" : "server";
    throw new ApiFailure(kind, envelope.message ?? "服务暂时不可用，请稍后重试。", {
      code: envelope.code,
      requestId: envelope.requestId,
      status,
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiFailure("malformed", "响应无法解析，请刷新页面后重试。");
  }

  const contractVersion =
    body !== null && typeof body === "object"
      ? (body as { contractVersion?: unknown }).contractVersion
      : undefined;
  if (typeof contractVersion !== "string" || contractVersion !== CONTRACT_VERSION) {
    throw new ApiFailure("contract", "契约版本不兼容，请刷新或更新页面。");
  }

  return body as T;
}
