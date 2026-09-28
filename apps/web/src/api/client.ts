import { CONTRACT_VERSION, PROTECTED_API_PREFIXES } from "@policymate/contracts";

/** 客户端可区分的失败类型；用于映射到具体的用户可见状态。 */
export type ApiFailureKind =
  | "offline"
  | "timeout"
  | "server"
  | "contract"
  | "malformed"
  | "throttled"
  | "too_large"
  | "cancelled"
  | "disabled";

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
const TOKEN_HEADER = "x-pm-anonymous-token";

/** 需要短期匿名令牌的接口前缀；令牌只用于限制未授权流量。 */
const PROTECTED_PREFIXES = PROTECTED_API_PREFIXES;

function needsToken(path: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

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

function kindForStatus(status: number, code: string | null): ApiFailureKind {
  if (status === 429 || code === "rate_limited") return "throttled";
  if (status === 413 || code === "request_too_large") return "too_large";
  if (status === 400 && code === "invalid_input") return "too_large";
  if (code === "feature_disabled") return "disabled";
  if (status === 409 && code === "contract_incompatible") return "contract";
  return "server";
}

/**
 * 短期匿名令牌只保存在当前页面内存。H5 不直接连接 Dify，令牌也不编码
 * 案情或身份；页面刷新后重新获取。
 */
let anonymousToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

/** 清除内存中的匿名令牌；用于令牌过期后的重试。 */
export function resetAnonymousToken(): void {
  anonymousToken = null;
  tokenPromise = null;
}

async function fetchAnonymousToken(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("/api/v1/anonymous-tokens", {
      method: "POST",
      headers: {
        accept: "application/json",
        "x-pm-contract-version": CONTRACT_VERSION,
      },
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch {
    throw controller.signal.aborted
      ? new ApiFailure("timeout", "建立匿名访问授权超时，请稍后重试。")
      : new ApiFailure("offline", "网络不可用，无法建立匿名访问授权。");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new ApiFailure("server", "无法建立匿名访问授权，请稍后重试。", {
      status: response.status,
    });
  }
  const body: unknown = await response.json();
  const token = (body as { token?: unknown }).token;
  if (typeof token !== "string" || token === "") {
    throw new ApiFailure("malformed", "匿名访问授权响应无效，请刷新页面后重试。");
  }
  return token;
}

async function ensureAnonymousToken(): Promise<string> {
  if (anonymousToken !== null) return anonymousToken;
  if (tokenPromise === null) {
    tokenPromise = fetchAnonymousToken()
      .then((token) => {
        anonymousToken = token;
        return token;
      })
      .finally(() => {
        tokenPromise = null;
      });
  }
  return tokenPromise;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * 同源请求 JSON。所有请求都携带契约版本；响应版本不兼容时停止解析，
 * 不猜测字段含义。受保护接口携带短期匿名令牌，令牌过期时自动重取并重试一次。
 */
export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const protectedPath = needsToken(path);
  const token = protectedPath ? await ensureAnonymousToken() : null;

  try {
    return await dispatch<T>(path, options, token);
  } catch (error) {
    if (
      protectedPath &&
      error instanceof ApiFailure &&
      error.status === 401 &&
      error.code === "token_invalid"
    ) {
      resetAnonymousToken();
      const refreshed = await ensureAnonymousToken();
      return dispatch<T>(path, options, refreshed);
    }
    throw error;
  }
}

async function dispatch<T>(path: string, options: RequestOptions, token: string | null): Promise<T> {
  const method = options.method ?? "GET";
  const controller = new AbortController();
  const externalSignal = options.signal;
  const forwardAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        accept: "application/json",
        "x-pm-contract-version": CONTRACT_VERSION,
        ...(token === null ? {} : { [TOKEN_HEADER]: token }),
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch {
    if (externalSignal?.aborted === true) {
      throw new ApiFailure("cancelled", "请求已取消。");
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
    throw new ApiFailure(kindForStatus(status, envelope.code), envelope.message ?? "服务暂时不可用，请稍后重试。", {
      code: envelope.code,
      requestId: envelope.requestId,
      status,
    });
  }

  if (response.status === 204) {
    return undefined as T;
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

/** 同源读取 JSON（GET）。 */
export async function getJson<T>(
  path: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  return requestJson<T>(path, options);
}
