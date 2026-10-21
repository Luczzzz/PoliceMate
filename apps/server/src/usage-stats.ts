import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * 首页匿名使用计数。
 *
 * 只保存“累计次数、当前日期、当日次数”三个数字和一个日期；不保存请求编号、
 * 令牌、IP、案情、事实、报告或页面轨迹，因而不构成个人使用历史或行为分析。
 * 文件不可写时退回进程内存计数，分析接口本身不受影响。
 */

export const DEFAULT_USAGE_TIME_ZONE = "Asia/Shanghai";

export interface UsageSnapshot {
  /** 配置时区下的当前日期（YYYY-MM-DD）。 */
  date: string;
  today: number;
  total: number;
}

export interface UsageStats {
  readonly timeZone: string;
  readonly persisted: boolean;
  record(): void;
  snapshot(): UsageSnapshot;
  /** 仅用于测试控制接口；普通运行路径不调用。 */
  reset(): void;
}

interface UsageFile {
  version: 1;
  total: number;
  day: string;
  dayCount: number;
}

export interface UsageStatsOptions {
  /** `null` 表示只保存在进程内存；未提供时同样不落盘。 */
  filePath?: string | null;
  timeZone?: string;
  now?: () => Date;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidUsageTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** 按指定时区计算日期，避免服务器 UTC 时区把“今日”算错。 */
export function usageDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function createUsageStats(options: UsageStatsOptions = {}): UsageStats {
  const timeZone = options.timeZone ?? DEFAULT_USAGE_TIME_ZONE;
  if (!isValidUsageTimeZone(timeZone)) {
    throw new Error(`无效的使用统计时区：${timeZone}`);
  }
  const now = options.now ?? (() => new Date());
  const filePath = options.filePath === undefined || options.filePath === null
    ? null
    : resolve(options.filePath);

  let total = 0;
  let day = usageDate(now(), timeZone);
  let dayCount = 0;
  let warned = false;

  if (filePath !== null) {
    try {
      const raw: unknown = JSON.parse(readFileSync(filePath, "utf8"));
      if (
        raw !== null &&
        typeof raw === "object" &&
        (raw as UsageFile).version === 1 &&
        isNonNegativeInteger((raw as UsageFile).total) &&
        isNonNegativeInteger((raw as UsageFile).dayCount) &&
        typeof (raw as UsageFile).day === "string" &&
        DAY_PATTERN.test((raw as UsageFile).day)
      ) {
        const parsed = raw as UsageFile;
        total = parsed.total;
        day = parsed.day;
        dayCount = parsed.dayCount;
      }
    } catch (error) {
      // 文件不存在是正常起点；其他读取失败只提示一次，不阻断服务。
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !warned) {
        console.warn("[policymate-server] 使用统计文件无法读取，改为内存计数。");
        warned = true;
      }
    }
  }

  const roll = () => {
    const today = usageDate(now(), timeZone);
    if (today !== day) {
      day = today;
      dayCount = 0;
    }
  };

  const persist = () => {
    if (filePath === null) return;
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${process.pid}.tmp`;
      const payload: UsageFile = { version: 1, total, day, dayCount };
      writeFileSync(temporary, `${JSON.stringify(payload)}\n`, "utf8");
      renameSync(temporary, filePath);
    } catch {
      // 统计不是业务前置条件：落盘失败时保留内存计数，不把异常抛给分析请求。
      if (!warned) {
        console.warn("[policymate-server] 使用统计文件无法写入，改为内存计数。");
        warned = true;
      }
    }
  };

  return {
    timeZone,
    persisted: filePath !== null,
    record(): void {
      roll();
      total += 1;
      dayCount += 1;
      persist();
    },
    snapshot(): UsageSnapshot {
      roll();
      return { date: day, today: dayCount, total };
    },
    reset(): void {
      total = 0;
      day = usageDate(now(), timeZone);
      dayCount = 0;
      persist();
    },
  };
}
