import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createUsageStats, isValidUsageTimeZone, usageDate } from "../src/usage-stats";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "policymate-usage-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("匿名使用计数", () => {
  it("只累加今日与累计次数，不保存任何内容或身份标识", () => {
    let now = new Date("2026-10-21T02:00:00.000Z");
    const filePath = join(tempDir(), "usage-stats.json");
    const stats = createUsageStats({ filePath, timeZone: "Asia/Shanghai", now: () => now });

    stats.record();
    stats.record();
    expect(stats.snapshot()).toEqual({ date: "2026-10-21", today: 2, total: 2 });

    const persisted = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    expect(Object.keys(persisted).sort()).toEqual(["day", "dayCount", "total", "version"]);
    expect(persisted).toEqual({ version: 1, total: 2, day: "2026-10-21", dayCount: 2 });
  });

  it("重启后从文件恢复累计次数", () => {
    const filePath = join(tempDir(), "usage-stats.json");
    const first = createUsageStats({ filePath, timeZone: "Asia/Shanghai", now: () => new Date("2026-10-21T02:00:00.000Z") });
    first.record();
    first.record();
    first.record();

    const second = createUsageStats({ filePath, timeZone: "Asia/Shanghai", now: () => new Date("2026-10-21T03:00:00.000Z") });
    expect(second.snapshot()).toEqual({ date: "2026-10-21", today: 3, total: 3 });
    second.record();
    expect(second.snapshot()).toEqual({ date: "2026-10-21", today: 4, total: 4 });
  });

  it("按配置时区跨日重置今日次数，累计次数不清零", () => {
    let now = new Date("2026-10-21T15:59:59.000Z"); // 上海时间 23:59:59
    const stats = createUsageStats({ timeZone: "Asia/Shanghai", now: () => now });
    stats.record();
    expect(stats.snapshot()).toEqual({ date: "2026-10-21", today: 1, total: 1 });

    now = new Date("2026-10-21T16:00:00.000Z"); // 上海时间次日 00:00
    expect(stats.snapshot()).toEqual({ date: "2026-10-22", today: 0, total: 1 });
    stats.record();
    expect(stats.snapshot()).toEqual({ date: "2026-10-22", today: 1, total: 2 });
  });

  it("文件损坏或不存在时从零开始，不影响业务记录", () => {
    const dir = tempDir();
    const stats = createUsageStats({ filePath: join(dir, "missing.json"), timeZone: "Asia/Shanghai" });
    expect(stats.snapshot().total).toBe(0);
    stats.record();
    expect(stats.snapshot().today).toBe(1);
  });

  it("测试控制可以重置计数", () => {
    const stats = createUsageStats({ timeZone: "Asia/Shanghai" });
    stats.record();
    stats.reset();
    expect(stats.snapshot()).toEqual({ date: usageDate(new Date(), "Asia/Shanghai"), today: 0, total: 0 });
  });

  it("拒绝无效时区", () => {
    expect(isValidUsageTimeZone("Asia/Shanghai")).toBe(true);
    expect(isValidUsageTimeZone("Mars/Olympus")).toBe(false);
    expect(() => createUsageStats({ timeZone: "Mars/Olympus" })).toThrow(/时区/);
  });
});
