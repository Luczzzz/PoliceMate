import type { CaseDeadline, UserSchedule, CalendarItem, CalendarResponse } from "./types";
import type { CaseDeadlinesManager } from "./case-deadlines";
import type { UserSchedulesManager } from "./user-schedules";

export class CalendarEngine {
  constructor(
    public readonly deadlinesManager: CaseDeadlinesManager,
    public readonly schedulesManager: UserSchedulesManager,
  ) {}

  /**
   * 查询日历数据。
   */
  getCalendar(
    userId: string,
    month: string,
    view: "deadlines" | "schedules",
  ): CalendarResponse {
    const items: CalendarItem[] = [];

    if (view === "deadlines") {
      const deadlines = this.deadlinesManager.getByUserId(userId);
      for (const deadline of deadlines) {
        for (const stage of deadline.stages) {
          // 跳过已完成的阶段
          if (stage.completedAt) continue;

          // 只显示该月的期限
          if (!stage.dueDate.startsWith(month)) continue;

          const daysRemaining = this.calculateDaysRemaining(stage.dueDate);
          items.push({
            date: stage.dueDate,
            type: "deadline",
            caseId: deadline.caseId,
            stageName: stage.stageName,
            daysRemaining,
            urgency: this.calculateUrgency(daysRemaining),
          });
        }
      }
    } else if (view === "schedules") {
      const schedules = this.schedulesManager.getScheduleByMonth(userId, month);
      for (const schedule of schedules) {
        items.push({
          date: schedule.date,
          type: "schedule",
          scheduleType: schedule.type,
          timeRange: schedule.timeRange,
          note: schedule.note,
        });
      }
    }

    return {
      view,
      month,
      items: items.sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * 计算剩余天数。
   */
  private calculateDaysRemaining(dueDate: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    const diff = due.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * 计算紧急程度。
   */
  private calculateUrgency(
    daysRemaining: number,
  ): "normal" | "warning" | "urgent" | "overdue" {
    if (daysRemaining <= 0) return "overdue";
    if (daysRemaining <= 3) return "urgent";
    if (daysRemaining <= 7) return "warning";
    return "normal";
  }
}
