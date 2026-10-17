import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createFixtureControls } from "./providers/fixture";
import { createDifyProvider } from "./providers/dify";
import { createLlmProvider } from "./providers/llm";
import { createGovernedContentProvider } from "./providers/content";
import type { AccidentLiabilityProvider, Providers } from "./providers/types";

async function main(): Promise<void> {
  const config = loadConfig();
  const dify = config.providerMode === "dify" ? createDifyProvider(config)
    : config.providerMode === "llm" ? createLlmProvider(config, { onRepair: (info) => console.warn(`[policymate-server] llm output tolerated: ${JSON.stringify(info)}`) }) : null;
  let providers: Providers | null = null;
  if (dify !== null) {
    providers = { dify, analysis: dify, content: createGovernedContentProvider() };
    // 只有实现了多轮问答的边界才注入；Dify 适配层不实现，该入口因此失败关闭。
    if (typeof (dify as Partial<AccidentLiabilityProvider>).consultAccidentLiability === "function") {
      providers.accidentLiability = dify as unknown as AccidentLiabilityProvider;
    }
  }
  const app = providers === null
    ? await buildApp({ config, fixtures: createFixtureControls() })
    : await buildApp({ config, providers });

  try {
    await app.listen({ host: config.host, port: config.port });
    // 仅输出非内容运行信息，禁止打印任何案情相关数据。
    console.log(
      `[policymate-server] listening on http://${config.host}:${config.port} (provider=${config.providerMode}, static=${config.staticDir ?? "none"})`,
    );
  } catch (error) {
    console.error("[policymate-server] 启动失败", error);
    process.exitCode = 1;
  }
}

void main();
