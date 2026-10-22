import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { UserSchedule, ScheduleEntry } from "./types";

export class UserSchedulesManager {
  private readonly dataDir: string;
  private readonly cache = new Map<string, UserSchedule>();

  constructor(dataDir: string) {
    this.dataDir = resolve(dataDir, "user-schedules");
    mkdirSync(this.dataDir, { recursive: true });
  }

  /**
   * 获取用户的排班表。
   */
  getSchedule(userId: string): UserSchedule {
    // 先查缓存
    if (this.cache.has(userId)) {
      return this.cache.get(userId)!;
    }

    // 从文件读取
    try {
      const filePath = resolve(this.dataDir, `${userId}.json`);
      const content = readFileSync(filePath, "utf8");
      const data = JSON.parse(content) as UserSchedule;
      this.cache.set(userId, data);
      return data;
    } catch {
      // 新用户，返回空排班表
      const schedule: UserSchedule = {
        userId,
        schedules: [],
        updatedAt: new Date().toISOString(),
      };
      this.cache.set(userId, schedule);
      return schedule;
    }
  }

  /**
   * 添加或更新某一天的排班。
   */
  setSchedule(userId: string, date: string, entry: ScheduleEntry): UserSchedule {
    // 验证日期格式
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Invalid date format. Use YYYY-MM-DD");
    }

    const schedule = this.getSchedule(userId);

    // 找到该日期的现有条目，或创建新条目
    const existingIndex = schedule.schedules.findIndex((s) => s.date === date);
    if (existingIndex >= 0) {
      schedule.schedules[existingIndex] = entry;
    } else {
      schedule.schedules.push(entry);
    }

    // 按日期排序
    schedule.schedules.sort((a, b) => a.date.localeCompare(b.date));
    schedule.updatedAt = new Date().toISOString();

    this.save(schedule);
    return schedule;
  }

  /**
   * 删除某一天的排班。
   */
  deleteSchedule(userId: string, date: string): UserSchedule {
    const schedule = this.getSchedule(userId);
    schedule.schedules = schedule.schedules.filter((s) => s.date !== date);
    schedule.updatedAt = new Date().toISOString();

    this.save(schedule);
    return schedule;
  }

  /**
   * 获取某月的排班。
   */
  getScheduleByMonth(userId: string, month: string): ScheduleEntry[] {
    // month 格式：YYYY-MM
    const schedule = this.getSchedule(userId);
    return schedule.schedules.filter((s) => s.date.startsWith(month));
  }

  /**
   * 保存到文件。
   */
  private save(schedule: UserSchedule): void {
    const filePath = resolve(this.dataDir, `${schedule.userId}.json`);
    writeFileSync(filePath, JSON.stringify(schedule, null, 2), "utf8");
    this.cache.set(schedule.userId, schedule);
  }
}
