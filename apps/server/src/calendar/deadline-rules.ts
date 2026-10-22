import { readFileSync } from "node:fs";
import type { DeadlineRule } from "./types";

export class DeadlineRulesManager {
  private rules: Map<string, DeadlineRule> = new Map();

  constructor(rulesPath: string) {
    this.loadRules(rulesPath);
  }

  /**
   * 从 JSON 文件加载规则。
   */
  private loadRules(rulesPath: string): void {
    try {
      const content = readFileSync(rulesPath, "utf8");
      const data = JSON.parse(content) as DeadlineRule[];

      // 只加载状态为 'trial' 的规则
      for (const rule of data) {
        if (rule.status === "trial") {
          this.rules.set(rule.id, rule);
        }
      }

      console.log(`[calendar] Loaded ${this.rules.size} deadline rules`);
    } catch (error) {
      console.error(`[calendar] Failed to load deadline rules: ${error}`);
      throw error;
    }
  }

  /**
   * 获取某个案件类别的所有规则。
   */
  getRulesByCategory(category: "administrative" | "criminal"): DeadlineRule[] {
    return Array.from(this.rules.values()).filter((r) => r.category === category);
  }

  /**
   * 根据规则ID获取规则。
   */
  getRule(ruleId: string): DeadlineRule | null {
    return this.rules.get(ruleId) ?? null;
  }

  /**
   * 获取所有规则。
   */
  getAllRules(): DeadlineRule[] {
    return Array.from(this.rules.values());
  }
}
