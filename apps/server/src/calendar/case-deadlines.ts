import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseDeadline, CaseDeadlineStage } from "./types";
import type { DeadlineRulesManager } from "./deadline-rules";

export class CaseDeadlinesManager {
  private readonly dataDir: string;
  private readonly cache = new Map<string, CaseDeadline>();

  constructor(
    dataDir: string,
    private readonly rulesManager: DeadlineRulesManager,
  ) {
    this.dataDir = resolve(dataDir, "case-deadlines");
    mkdirSync(this.dataDir, { recursive: true });
  }

  /**
   * 为案件创建期限实例。
   * 根据立案日期和案件类别，自动应用相关规则，生成各阶段期限。
   */
  create(
    caseId: string,
    userId: string,
    caseStartDate: string,
    category: "administrative" | "criminal",
  ): CaseDeadline {
    // 验证日期格式
    if (!/^\d{4}-\d{2}-\d{2}$/.test(caseStartDate)) {
      throw new Error("Invalid date format. Use YYYY-MM-DD");
    }

    // 获取该案件类别的所有规则
    const rules = this.rulesManager.getRulesByCategory(category);

    // 根据规则生成各阶段期限
    const startDateObj = new Date(caseStartDate);
    const stages: CaseDeadlineStage[] = rules.map((rule) => ({
      ruleId: rule.id,
      stageName: rule.stageName,
      dueDate: this.addDays(startDateObj, rule.daysFromStart),
      extended: false,
    }));

    const now = new Date().toISOString();
    const deadline: CaseDeadline = {
      caseId,
      userId,
      caseStartDate,
      category,
      stages,
      createdAt: now,
      updatedAt: now,
    };

    this.save(deadline);
    return deadline;
  }

  /**
   * 获取某个案件的期限。
   */
  get(caseId: string): CaseDeadline | null {
    // 先查缓存
    if (this.cache.has(caseId)) {
      return this.cache.get(caseId)!;
    }

    // 从文件读取
    try {
      const filePath = resolve(this.dataDir, `${caseId}.json`);
      const content = readFileSync(filePath, "utf8");
      const data = JSON.parse(content) as CaseDeadline;
      this.cache.set(caseId, data);
      return data;
    } catch {
      return null;
    }
  }

  /**
   * 获取某个用户负责的所有案件的期限。
   */
  getByUserId(userId: string): CaseDeadline[] {
    const results: CaseDeadline[] = [];

    try {
      const files = readdirSync(this.dataDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const caseId = file.slice(0, -5);
        const deadline = this.get(caseId);
        if (deadline && deadline.userId === userId) {
          results.push(deadline);
        }
      }
    } catch {
      // 目录为空或不存在
    }

    return results;
  }

  /**
   * 标记某个阶段已完成。
   */
  markStageCompleted(caseId: string, ruleId: string): CaseDeadline | null {
    const deadline = this.get(caseId);
    if (!deadline) return null;

    const stage = deadline.stages.find((s) => s.ruleId === ruleId);
    if (!stage) return null;

    stage.completedAt = new Date().toISOString().split("T")[0];
    deadline.updatedAt = new Date().toISOString();

    this.save(deadline);
    this.cache.set(caseId, deadline);

    return deadline;
  }

  /**
   * 延期某个阶段。
   */
  extendStage(caseId: string, ruleId: string, extendDays: number): CaseDeadline | null {
    const deadline = this.get(caseId);
    if (!deadline) return null;

    const stage = deadline.stages.find((s) => s.ruleId === ruleId);
    if (!stage) return null;

    const rule = this.rulesManager.getRule(ruleId);
    if (!rule || !rule.extendable) return null;

    if (rule.maxExtensionDays && extendDays > rule.maxExtensionDays) {
      throw new Error(`Extension exceeds maximum ${rule.maxExtensionDays} days`);
    }

    const currentDueDate = new Date(stage.dueDate);
    stage.dueDate = this.addDays(currentDueDate, extendDays);
    stage.extended = true;
    deadline.updatedAt = new Date().toISOString();

    this.save(deadline);
    this.cache.set(caseId, deadline);

    return deadline;
  }

  /**
   * 保存到文件。
   */
  private save(deadline: CaseDeadline): void {
    const filePath = resolve(this.dataDir, `${deadline.caseId}.json`);
    writeFileSync(filePath, JSON.stringify(deadline, null, 2), "utf8");
  }

  /**
   * 日期加法。
   */
  private addDays(date: Date, days: number): string {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result.toISOString().split("T")[0];
  }
}
