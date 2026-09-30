import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createFixtureControls } from "./providers/fixture";
import { createDifyProvider } from "./providers/dify";
import { createGovernedContentProvider } from "./providers/content";

async function main(): Promise<void> {
  const config = loadConfig();
  const dify = config.providerMode === "dify" ? createDifyProvider(config) : null;
  const app = dify === null
    ? await buildApp({ config, fixtures: createFixtureControls() })
    : await buildApp({ config, providers: { dify, analysis: dify, content: createGovernedContentProvider() } });

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
