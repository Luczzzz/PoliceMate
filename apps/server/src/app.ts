import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import {
  CONTRACT_VERSION,
  type ApiErrorBody,
  type DataUseResponse,
  type FixtureControlRequest,
  type FixtureControlResponse,
  type HealthResponse,
  type ProductShellResponse,
} from "@policymate/contracts";
import { buildProductShell, loadCapabilityInputs } from "./capabilities";
import type { AppConfig } from "./config";
import { buildDataUseResponse } from "./data-use";
import type { FixtureControls, FixtureState } from "./providers/fixture";

export interface BuildAppDeps {
  config: AppConfig;
  fixtures: FixtureControls;
}

const CONTRACT_HEADER = "x-pm-contract-version";

function errorBody(
  requestId: string,
  code: ApiErrorBody["error"]["code"],
  message: string,
): ApiErrorBody {
  return { contractVersion: CONTRACT_VERSION, error: { code, message, requestId } };
}

function readFixturePatch(body: unknown): Partial<FixtureState> | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const candidate = body as FixtureControlRequest;
  const patch: Partial<FixtureState> = {};

  if ("difyAvailable" in candidate) {
    if (typeof candidate.difyAvailable !== "boolean") return null;
    patch.difyAvailable = candidate.difyAvailable;
  }
  if ("eligibleExampleCount" in candidate) {
    const count = candidate.eligibleExampleCount;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
    patch.eligibleExampleCount = count;
  }
  return patch;
}

/**
 * 构建 PoliceMate 后端。该函数不负责监听端口，便于测试直接使用 `inject`。
 */
export async function buildApp({ config, fixtures }: BuildAppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    genReqId: () => randomUUID(),
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    const requested = request.headers[CONTRACT_HEADER];
    if (typeof requested === "string" && requested !== CONTRACT_VERSION) {
      await reply
        .code(409)
        .send(
          errorBody(
            request.id,
            "contract_incompatible",
            `契约版本不兼容（客户端 ${requested}，服务端 ${CONTRACT_VERSION}），请刷新或更新页面。`,
          ),
        );
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-robots-tag", "noindex, nofollow, noarchive");
    if (request.url.startsWith("/api/")) {
      reply.header("cache-control", "no-store");
    }
    return payload;
  });

  app.get("/api/v1/health", async (): Promise<HealthResponse> => {
    return { contractVersion: CONTRACT_VERSION, status: "ok", providerMode: config.providerMode };
  });

  app.get("/api/v1/shell", async (): Promise<ProductShellResponse> => {
    const inputs = await loadCapabilityInputs(
      {
        masterSwitch: config.masterSwitch,
        analysisEnabled: config.analysisEnabled,
        documentsEnabled: config.documentsEnabled,
      },
      fixtures,
    );
    return buildProductShell(inputs, CONTRACT_VERSION);
  });

  app.get("/api/v1/data-use", async (): Promise<DataUseResponse> => {
    return buildDataUseResponse(config.service, CONTRACT_VERSION);
  });

  if (config.enableTestControls) {
    app.post<{ Body: FixtureControlRequest }>("/api/test/fixtures", async (request, reply) => {
      const patch = readFixturePatch(request.body);
      if (patch === null) {
        return reply
          .code(400)
          .send(errorBody(request.id, "invalid_request", "替身控制参数无效。"));
      }
      const state: FixtureControlResponse = { ...fixtures.updateState(patch) };
      return state;
    });

    app.post("/api/test/fixtures/reset", async (): Promise<FixtureControlResponse> => {
      return { ...fixtures.reset() };
    });
  }

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const status =
      typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    const message =
      status === 500 ? "服务暂时不可用，请稍后重试。" : (error.message ?? "请求无法处理。");
    await reply.code(status).send(errorBody(request.id, status === 500 ? "internal_error" : "invalid_request", message));
  });

  const staticDir = config.staticDir;
  if (staticDir !== null && existsSync(resolve(staticDir, "index.html"))) {
    await app.register(fastifyStatic, { root: staticDir });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send(errorBody(request.id, "not_found", "接口不存在。"));
    }
    if (staticDir !== null && existsSync(resolve(staticDir, "index.html"))) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).type("text/plain; charset=utf-8").send("未找到页面。");
  });

  return app;
}
