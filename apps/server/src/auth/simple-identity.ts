import { createHash, randomBytes } from "node:crypto";
import type { Identity, ClaimIdentityResponse } from "./types";

export class SimpleIdentityService {
  private readonly sessions = new Map<string, Identity>();

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly tokenTtlMs: number = 365 * 24 * 60 * 60 * 1000, // 1年
  ) {}

  /**
   * 申领用户身份。同一个用户名总是返回相同的userId，
   * 但每次调用都会生成新的令牌。
   */
  claimIdentity(username: string): ClaimIdentityResponse {
    // 验证用户名
    if (!this.isValidUsername(username)) {
      throw new Error("Invalid username format");
    }

    // 从用户名生成稳定的userId
    const userId = this.generateUserId(username);

    // 生成新的会话令牌
    const token = randomBytes(24).toString("base64url");
    const now = this.clock();

    this.sessions.set(token, {
      userId,
      username,
      tokenIssuedAt: now,
      tokenExpiresAt: now + this.tokenTtlMs,
    });

    return { userId, token };
  }

  /**
   * 验证令牌并返回身份信息。
   */
  verify(token: unknown): Identity | null {
    if (typeof token !== "string" || token === "") {
      return null;
    }

    const identity = this.sessions.get(token);
    if (!identity) {
      return null;
    }

    // 检查过期
    if (identity.tokenExpiresAt <= this.clock()) {
      this.sessions.delete(token);
      return null;
    }

    return identity;
  }

  /**
   * 生成稳定的userId。同一个用户名总是生成相同的userId。
   */
  private generateUserId(username: string): string {
    return createHash("sha256").update(username).digest("hex").slice(0, 16);
  }

  /**
   * 验证用户名格式。
   * 规则：2-50个字符，允许中文、字母、数字、下划线、中划线。
   */
  private isValidUsername(username: string): boolean {
    if (typeof username !== "string") return false;
    if (username.length < 2 || username.length > 50) return false;
    // 允许中文、字母、数字、下划线、中划线
    const pattern = /^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/;
    return pattern.test(username);
  }

  /**
   * 清理过期令牌（可定期调用）。
   */
  prune(): void {
    const now = this.clock();
    for (const [token, identity] of this.sessions) {
      if (identity.tokenExpiresAt <= now) {
        this.sessions.delete(token);
      }
    }
  }

  /**
   * 测试用：获取会话数。
   */
  sessionCount(): number {
    return this.sessions.size;
  }
}

// 进程级单例
export const defaultIdentityService = new SimpleIdentityService();
