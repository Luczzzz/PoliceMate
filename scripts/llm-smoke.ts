import { loadConfig } from "../apps/server/src/config";
import { buildApp } from "../apps/server/src/app";
import { createLlmProvider } from "../apps/server/src/providers/llm";
import { createGovernedContentProvider } from "../apps/server/src/providers/content";
import type { AnalysisIntakeResponse } from "@policymate/contracts";

/**
 * 真实模型端到端冒烟检查（虚构数据）。
 *
 * 只打印非内容元数据：状态、模块状态、缺口与链路数量、版本。案情正文、报告正文、
 * 上游响应正文与本机密钥都不会进入输出。任一环节失败以非零退出码结束。
 */

const FICTIONAL_CASES = [
  "虚构测试：3月2日晚上，甲某在虚构酒店门口殴打乙某，乙某手部擦伤。",
  "虚构测试：4月1日，甲某在虚构市场盗窃乙某的电动车一辆，价值待核实。",
];

function fail(message: string): never {
  console.error(`[llm-smoke] 未通过：${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const config = { ...loadConfig(process.env), providerMode: "llm" as const };
  if (config.enableTestControls) fail("不得在真实模式下启用测试控制。");
  if (!config.analysisEnabled) fail("PM_ANALYSIS_ENABLED 必须为 on。");
  if (!config.llmBaseUrl || !config.llmApiKey || !config.llmModel) {
    fail("缺少 PM_LLM_BASE_URL、PM_LLM_API_KEY 或 PM_LLM_MODEL。");
  }

  const llm = createLlmProvider(config);
  const availability = await llm.getAvailability();
  if (!availability.available) fail(availability.reason ?? "真实分析服务不可用。");
  const workflowVersion = config.llmWorkflowVersion ?? "policymate-llm-v1.0.0";
  console.log(`[llm-smoke] 本地配置检查通过（工作流版本 ${workflowVersion}）。`);

  const app = await buildApp({
    config,
    providers: { analysis: llm, content: createGovernedContentProvider(), accidentLiability: llm },
  });

  try {
    const tokenResponse = await app.inject({ method: "POST", url: "/api/v1/anonymous-tokens", headers: { "x-pm-contract-version": "1.0" } });
    const token = (tokenResponse.json() as { token?: string }).token;
    if (tokenResponse.statusCode !== 200 || !token) fail("匿名令牌签发失败。");
    const headers = { "x-pm-contract-version": "1.0", "x-pm-anonymous-token": token };

    for (const [index, caseText] of FICTIONAL_CASES.entries()) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/analysis/sessions",
        headers,
        payload: { caseText },
      });
      const label = `虚构用例 ${index + 1}`;
      if (response.statusCode !== 201) {
        const body = response.json() as { error?: { code?: string; requestId?: string } };
        fail(`${label}：HTTP ${response.statusCode}（${body.error?.code ?? "未知"}，请求编号 ${body.error?.requestId ?? "无"}）。`);
      }
      const body = response.json() as AnalysisIntakeResponse;
      if (body.analyses.length === 0) fail(`${label}：没有返回分析。`);
      for (const analysis of body.analyses) {
        const report = analysis.report;
        const present = report.modules.filter((module) => module.status === "present").length;
        const links = report.modules.reduce((sum, module) => sum + module.traceLinks.length, 0);
        const evidence = report.modules.reduce((sum, module) => sum + module.evidenceItems.length, 0);
        const interviews = report.modules.reduce((sum, module) => sum + module.interviewItems.length, 0);
        console.log(
          `[llm-smoke] ${label} 分析 ${analysis.state.analysisIndex}/${analysis.state.analysisCount}：` +
          `状态=${report.status}，模块=${report.modules.length}（present ${present}），` +
          `事实限制=${report.factLimitations.length}，缺口分支=${report.gapBranches.length}，` +
          `争议=${report.conflicts.length}，链路=${links}，证据项=${evidence}，询问项=${interviews}，` +
          `重点案情=${report.caseFocusId ?? "未命中"}，工作流版本=${report.workflowVersion}，` +
          `快照=v${report.snapshotVersion}/${report.snapshotHash.slice(0, 12)}`,
        );
        if (report.modules.length !== 6) fail(`${label}：报告模块数量不是 6。`);
        if (report.workflowVersion !== workflowVersion) {
          fail(`${label}：报告工作流版本与允许版本不一致。`);
        }
        if (report.status === "complete" && links === 0) fail(`${label}：完整报告却没有可解释链路。`);
      }
    }
    console.log("[llm-smoke] 通过：提取、报告与结构校验均正常。");
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  // 只报告错误类型，不回显可能包含上游内容的堆栈正文以外的细节。
  const name = error instanceof Error ? error.name : "UnknownError";
  fail(`执行期间抛出 ${name}。`);
});
