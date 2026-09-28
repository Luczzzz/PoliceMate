const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * 只有 http(s) 链接可以渲染为可点击链接。非法协议（`javascript:`、`data:` 等）
 * 或无法解析的值返回 `null`，由调用处渲染为不可点击文本。
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  try {
    const parsed = new URL(url, window.location.origin);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}
