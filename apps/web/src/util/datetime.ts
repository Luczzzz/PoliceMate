/**
 * 用户可见时间格式。
 *
 * 规格 3.5：用户可见时间按北京时间（UTC+8）展示，并在可能混淆时明确时区。
 * 解析失败时原样返回，避免把无效时间静默显示为某个时点。
 */
export function formatBeijingDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const formatted = new Intl.DateTimeFormat("zh-Hans-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${formatted}（北京时间）`;
}
