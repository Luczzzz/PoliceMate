// ===== 期限规则 =====
export interface DeadlineRule {
  id: string; // 规则ID（如 'penal-investigation-30d'）
  category: "administrative" | "criminal";
  stageName: string; // 阶段名称（如"受案后立案决定"）
  description: string; // 描述
  daysFromStart: number; // 从立案起算的天数
  extendable: boolean; // 是否可延期
  maxExtensionDays?: number; // 最大延期天数
  legalBasis: string; // 法律依据（如"《公安机关办理行政案件程序规定》第X条"）
  status: "trial" | "withdrawn"; // 受治理内容状态
  contentVersion: number; // 内容版本号
}

// ===== 案件期限实例 =====
export interface CaseDeadlineStage {
  ruleId: string;
  stageName: string;
  dueDate: string; // YYYY-MM-DD
  extended: boolean;
  completedAt?: string; // YYYY-MM-DD，标记完成时间
}

export interface CaseDeadline {
  caseId: string;
  userId: string; // 负责民警ID
  caseStartDate: string; // 立案日期（YYYY-MM-DD）
  category: "administrative" | "criminal";
  stages: CaseDeadlineStage[];
  createdAt: string;
  updatedAt: string;
}

// ===== 用户排班 =====
export interface ScheduleEntry {
  date: string; // YYYY-MM-DD
  type: "full_day" | "morning" | "afternoon" | "custom";
  timeRange?: string; // 自定义时段（如"09:00-12:00"）
  note?: string; // 备注
}

export interface UserSchedule {
  userId: string;
  schedules: ScheduleEntry[];
  updatedAt: string;
}

// ===== 日历查询 =====
export interface CalendarItem {
  date: string; // YYYY-MM-DD
  type: "deadline" | "schedule";

  // deadline 字段
  caseId?: string;
  stageName?: string;
  daysRemaining?: number;
  urgency?: "normal" | "warning" | "urgent" | "overdue"; // normal: >7天, warning: 3-7天, urgent: 1-3天, overdue: <=0天

  // schedule 字段
  scheduleType?: "full_day" | "morning" | "afternoon" | "custom";
  timeRange?: string;
  note?: string;
}

export interface CalendarResponse {
  view: "deadlines" | "schedules";
  month: string; // YYYY-MM
  items: CalendarItem[];
}

// ===== API 请求/响应 =====
export interface CreateCaseDeadlineRequest {
  caseId: string;
  caseStartDate: string; // YYYY-MM-DD
  category: "administrative" | "criminal";
}

export interface UpdateScheduleRequest {
  date: string; // YYYY-MM-DD
  type: "full_day" | "morning" | "afternoon" | "custom";
  timeRange?: string;
  note?: string;
}

export interface ApiError {
  error: string;
  code: "not_found" | "invalid_input" | "unauthorized" | "server_error";
}
