import { randomBytes } from "node:crypto";

/**
 * 传输层安全边界：短期匿名令牌、来源限制、频率与并发限制。
 *
 * 这些机制只限制未授权流量，不构成身份认证、权限控制或保密访问。
 * 令牌与限流记录只存在于短暂运行内存，不含任何案情内容。
 */

export interface AnonymousTokenRecord {
  token: string;
  issuedAt: number;
  expiresAt: number;
}

/** 短期匿名令牌服务。令牌是随机字符串，不编码案情、身份或权限。 */
export class AnonymousTokenService {
  private readonly tokens = new Map<string, AnonymousTokenRecord>();

  constructor(
    private readonly ttlMs: number = 30 * 60 * 1000,
    private readonly clock: () => number = Date.now,
  ) {}

  issue(): AnonymousTokenRecord {
    this.prune();
    const now = this.clock();
    const record: AnonymousTokenRecord = {
      token: randomBytes(24).toString("base64url"),
      issuedAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.tokens.set(record.token, record);
    return record;
  }

  verify(token: unknown): boolean {
    if (typeof token !== "string" || token === "") return false;
    const record = this.tokens.get(token);
    if (record === undefined) return false;
    if (record.expiresAt <= this.clock()) {
      this.tokens.delete(token);
      return false;
    }
    return true;
  }

  prune(): void {
    const now = this.clock();
    for (const [token, record] of this.tokens) {
      if (record.expiresAt <= now) this.tokens.delete(token);
    }
  }

  size(): number {
    return this.tokens.size;
  }
}

/** 进程级默认令牌服务；真实部署中同一进程即同一服务实例。 */
export const anonymousTokens = new AnonymousTokenService();

/** 固定窗口频率限制。 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly clock: () => number = Date.now,
  ) {}

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = this.clock();
    const window = this.windows.get(key);
    if (window === undefined || now - window.startedAt >= this.windowMs) {
      this.windows.set(key, { startedAt: now, count: 1 });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (window.count >= this.max) {
      return { allowed: false, retryAfterMs: this.windowMs - (now - window.startedAt) };
    }
    window.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
}

/** 并发闸门：同一键的在途数量不得超过上限。 */
export class ConcurrencyGate {
  private readonly active = new Map<string, number>();

  constructor(private readonly max: number) {}

  /** 取得一个并发名额；超过上限时返回 `null`。 */
  tryAcquire(key: string): (() => void) | null {
    const current = this.active.get(key) ?? 0;
    if (current >= this.max) return null;
    this.active.set(key, current + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = (this.active.get(key) ?? 1) - 1;
      if (next <= 0) this.active.delete(key);
      else this.active.set(key, next);
    };
  }
}

/**
 * 来源判定：
 * - 无 `Origin`（非浏览器或同源可达）允许；
 * - 命中配置白名单允许；
 * - 否则要求 `Origin` 的 host 与请求 `Host` 一致（同源部署）。
 */
export function isOriginAllowed(
  origin: string | undefined | null,
  host: string | undefined,
  allowlist: readonly string[],
): boolean {
  if (origin === undefined || origin === null || origin === "") return true;
  if (origin === "null") return false;
  if (allowlist.includes(origin)) return true;
  if (host === undefined) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host;
  } catch {
    return false;
  }
}

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * 只有 http(s) 官方来源链接可以点击。拒绝 `javascript:`、`data:` 等任意协议。
 * 无链接或非法协议返回 `null`，由页面渲染为不可点击文本。
 */
export function sanitizeOfficialUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  try {
    const parsed = new URL(url);
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}
