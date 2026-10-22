export interface Identity {
  userId: string;       // 内部ID（sha256的前16位）
  username: string;     // 用户名（如"张三"、"police_001"）
  tokenIssuedAt: number;
  tokenExpiresAt: number;
}

export interface ClaimIdentityRequest {
  username: string;
}

export interface ClaimIdentityResponse {
  userId: string;
  token: string;        // 会话令牌，客户端需要保存到 localStorage
}

export interface AuthError {
  error: string;
  code: 'invalid_username' | 'server_error';
}
