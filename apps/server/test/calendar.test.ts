import { describe, it, expect } from "vitest";
import { SimpleIdentityService } from "../src/auth/simple-identity";
import { DeadlineRulesManager } from "../src/calendar/deadline-rules";
import { CaseDeadlinesManager } from "../src/calendar/case-deadlines";
import { UserSchedulesManager } from "../src/calendar/user-schedules";
import { CalendarEngine } from "../src/calendar/engine";
import { resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

describe("Calendar and Identity", () => {
  it("should claim and verify identity", () => {
    const service = new SimpleIdentityService();
    const result = service.claimIdentity("张三");

    expect(result.userId).toBeDefined();
    expect(result.token).toBeDefined();

    // 同一用户名生成相同的userId
    const result2 = service.claimIdentity("张三");
    expect(result2.userId).toBe(result.userId);
    expect(result2.token).not.toBe(result.token); // 但令牌不同

    // 验证令牌
    const identity = service.verify(result.token);
    expect(identity).not.toBeNull();
    expect(identity?.username).toBe("张三");
  });

  it("should reject invalid usernames", () => {
    const service = new SimpleIdentityService();

    expect(() => service.claimIdentity("a")).toThrow(); // 过短
    expect(() => service.claimIdentity("")).toThrow(); // 空
    expect(() => service.claimIdentity("a@b#c")).toThrow(); // 非法字符
  });

  it("should manage case deadlines", () => {
    const tmpDir = mkdtempSync("/tmp/calendar-test-");
    try {
      const rulesPath = resolve(__dirname, "../src/content/deadline-rules.json");
      const rulesManager = new DeadlineRulesManager(rulesPath);
      const deadlinesManager = new CaseDeadlinesManager(tmpDir, rulesManager);

      // 创建案件期限
      const deadline = deadlinesManager.create(
        "case_001",
        "user_001",
        "2024-10-15",
        "administrative",
      );

      expect(deadline.caseId).toBe("case_001");
      expect(deadline.userId).toBe("user_001");
      expect(deadline.stages.length).toBeGreaterThan(0);

      // 查询案件期限
      const fetched = deadlinesManager.get("case_001");
      expect(fetched).toEqual(deadline);

      // 查询用户的所有案件
      const userDeadlines = deadlinesManager.getByUserId("user_001");
      expect(userDeadlines).toContainEqual(deadline);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should manage user schedules", () => {
    const tmpDir = mkdtempSync("/tmp/schedule-test-");
    try {
      const schedulesManager = new UserSchedulesManager(tmpDir);

      // 设置排班
      const schedule = schedulesManager.setSchedule("user_001", "2024-10-16", {
        date: "2024-10-16",
        type: "full_day",
        note: "正常值班",
      });

      expect(schedule.userId).toBe("user_001");
      expect(schedule.schedules).toHaveLength(1);

      // 查询某月排班
      const monthSchedules = schedulesManager.getScheduleByMonth("user_001", "2024-10");
      expect(monthSchedules).toHaveLength(1);
      expect(monthSchedules[0].note).toBe("正常值班");

      // 删除排班
      const updated = schedulesManager.deleteSchedule("user_001", "2024-10-16");
      expect(updated.schedules).toHaveLength(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should generate calendar data", () => {
    const tmpDir = mkdtempSync("/tmp/calendar-engine-test-");
    try {
      const rulesPath = resolve(__dirname, "../src/content/deadline-rules.json");
      const rulesManager = new DeadlineRulesManager(rulesPath);
      const deadlinesManager = new CaseDeadlinesManager(tmpDir, rulesManager);
      const schedulesManager = new UserSchedulesManager(tmpDir);
      const engine = new CalendarEngine(deadlinesManager, schedulesManager);

      const userId = "user_001";
      deadlinesManager.create("case_001", userId, "2024-10-15", "administrative");
      schedulesManager.setSchedule(userId, "2024-10-16", {
        date: "2024-10-16",
        type: "full_day",
      });

      // 查询期限日历
      const deadlineCalendar = engine.getCalendar(userId, "2024-10", "deadlines");
      expect(deadlineCalendar.view).toBe("deadlines");
      expect(deadlineCalendar.items.length).toBeGreaterThan(0);

      // 查询排班日历
      const scheduleCalendar = engine.getCalendar(userId, "2024-10", "schedules");
      expect(scheduleCalendar.view).toBe("schedules");
      expect(scheduleCalendar.items).toHaveLength(1);
      expect(scheduleCalendar.items[0].type).toBe("schedule");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
