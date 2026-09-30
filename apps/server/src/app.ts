import { randomUUID } from "node:crypto";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import {
  CONTRACT_VERSION,
  FEEDBACK_CATEGORY_LABELS,
  PROTECTED_API_PREFIXES,
  REPORT_DOCUMENT_TASK_BOUNDARY,
  type AnonymousTokenResponse,
  type ApiErrorBody,
  type ContentStatus,
  type DataUseResponse,
  type DocumentExampleDetailResponse,
  type DocumentExampleListResponse,
  type DocumentTaskCandidateRequest,
  type DocumentTaskCandidatesResponse,
  type FeedbackCategory,
  type FeedbackMetadata,
  type FeedbackRequest,
  type FeedbackResponse,
  type FixtureControlRequest,
  type FixtureControlResponse,
  type HealthResponse,
  type LegalSourceReference,
  type ProductShellResponse,
  type UpstreamFailureMode,
} from "@policymate/contracts";
import { HANDLING_STAGE_CATALOG } from "./content/catalog";
import { buildProductShell, isDocumentRetrievalEnabled, loadCapabilityInputs } from "./capabilities";
import { resolveRuntimeConfig, type AppConfig, type ResolvedRuntimeConfig } from "./config";
import { buildDataUseResponse } from "./data-use";
import { buildFacets } from "./content/gating";
import { AnalysisEngine } from "./analysis/engine";
import { registerAnalysisRoutes } from "./analysis/routes";
import type { FixtureControls, FixturePatch } from "./providers/fixture";
import type { Providers } from "./providers/types";
import {
  AnonymousTokenService,
  ConcurrencyGate,
  FixedWindowRateLimiter,
  anonymousTokens,
  isOriginAllowed,
  sanitizeOfficialUrl,
} from "./security";
import {
  classifyStatus,
  createMemoryTelemetrySink,
  type TelemetrySink,
} from "./telemetry";

export interface BuildAppDeps {
  config: AppConfig;
  fixtures?: FixtureControls;
  providers?: Providers;
  /** 测试可以注入固定引擎以控制会话状态；默认使用按配置构造的引擎。 */
  analysisEngine?: AnalysisEngine;
  /** 运行元数据接收端；默认只保存在内存。 */
  telemetry?: TelemetrySink;
  /** 传输层安全服务；默认为进程级实例，测试可注入以控制时钟与上限。 */
  tokenService?: AnonymousTokenService;
  rateLimiter?: FixedWindowRateLimiter;
  concurrencyGate?: ConcurrencyGate;
  runtime?: ResolvedRuntimeConfig;
}

const CONTRACT_HEADER = "x-pm-contract-version";
const TOKEN_HEADER = "x-pm-anonymous-token";

/** 健康检查与测试控制接口不参与产品契约校验。 */
const CONTRACT_EXEMPT_PREFIXES = ["/api/v1/health", "/api/test/"];

/** 需要短期匿名令牌与频率限制保护的接口前缀。 */
const PROTECTED_PREFIXES = PROTECTED_API_PREFIXES;

const CONTENT_STATUSES = ["draft", "pending_verification", "trial", "withdrawn"] as const;
const LEGAL_SOURCE_STATUSES = ["current", "future", "superseded", "repealed", "uncertain"] as const;
const PROCEDURE_CATEGORIES = ["administrative", "criminal"] as const;
const HANDLING_STAGE_IDS = HANDLING_STAGE_CATALOG.map((stage) => stage.id);
const UPSTREAM_FAILURE_MODES: readonly UpstreamFailureMode[] = ["normal", "empty", "malformed", "timeout"];
const REPORT_MODES = [
  "complete",
  "insufficient_facts",
  "conflicting",
  "basis_unavailable",
  "critical_failure",
  "partial_failure",
  "contradiction",
  "empty",
  "malformed",
  "unmatched_source",
  "timeout",
] as const;

const FEEDBACK_CATEGORIES = Object.keys(FEEDBACK_CATEGORY_LABELS) as FeedbackCategory[];
const FEEDBACK_PAGE_IDS = new Set([
  "home",
  "analysis_input",
  "analysis_report",
  "analysis_modify",
  "documents",
  "document_detail",
  "data_use",
]);
const FEEDBACK_FEATURE_STATES = new Set([
  "case_analysis",
  "document_examples",
  "unavailable",
  "failed",
]);

function errorBody(
  requestId: string,
  code: ApiErrorBody["error"]["code"],
  message: string,
): ApiErrorBody {
  return { contractVersion: CONTRACT_VERSION, error: { code, message, requestId } };
}

function isProtected(url: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function readTaskCandidateRequest(body: unknown): DocumentTaskCandidateRequest | null {
  if (!isRecord(body)) return null;
  const candidate = body as Partial<DocumentTaskCandidateRequest>;
  if (candidate.contractVersion !== CONTRACT_VERSION) return null;
  if (
    typeof candidate.procedureCategory !== "string" ||
    !(PROCEDURE_CATEGORIES as readonly string[]).includes(candidate.procedureCategory)
  ) {
    return null;
  }
  if (typeof candidate.stageId !== "string" || !HANDLING_STAGE_IDS.includes(candidate.stageId)) {
    return null;
  }
  const roles = candidate.applicableRoles;
  if (!Array.isArray(roles) || !roles.every((role) => typeof role === "string" && role !== "")) {
    return null;
  }
  const tags = candidate.caseTags;
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string" && tag !== "")) {
    return null;
  }
  return {
    contractVersion: CONTRACT_VERSION,
    procedureCategory: candidate.procedureCategory as DocumentTaskCandidateRequest["procedureCategory"],
    stageId: candidate.stageId as DocumentTaskCandidateRequest["stageId"],
    applicableRoles: [...roles],
    caseTags: [...tags],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readContentStatus(value: unknown): ContentStatus | null {
  return typeof value === "string" && (CONTENT_STATUSES as readonly string[]).includes(value)
    ? (value as ContentStatus)
    : null;
}

function readUpstreamMode(value: unknown): UpstreamFailureMode | null {
  return typeof value === "string" && (UPSTREAM_FAILURE_MODES as readonly string[]).includes(value)
    ? (value as UpstreamFailureMode)
    : null;
}

function readFixturePatch(body: unknown): FixturePatch | null {
  if (!isRecord(body)) return null;
  const candidate = body as FixtureControlRequest;
  const patch: FixturePatch = {};
  if ("reportMode" in candidate) {
    if (typeof candidate.reportMode !== "string" || !(REPORT_MODES as readonly string[]).includes(candidate.reportMode)) {
      return null;
    }
    patch.reportMode = candidate.reportMode as NonNullable<FixturePatch["reportMode"]>;
  }

  if ("extractionMode" in candidate) {
    const mode = readUpstreamMode(candidate.extractionMode);
    if (mode === null) return null;
    patch.extractionMode = mode;
  }

  if ("difyAvailable" in candidate) {
    if (typeof candidate.difyAvailable !== "boolean") return null;
    patch.difyAvailable = candidate.difyAvailable;
  }

  if ("exampleStatusAll" in candidate) {
    const status = readContentStatus(candidate.exampleStatusAll);
    if (status === null) return null;
    patch.exampleStatusAll = status;
  }

  if ("exampleStatus" in candidate) {
    const value = candidate.exampleStatus;
    if (!isRecord(value) || typeof value.exampleId !== "string" || value.exampleId === "") {
      return null;
    }
    const status = readContentStatus(value.status);
    if (status === null) return null;
    patch.exampleStatus = { exampleId: value.exampleId, status };
  }

  if ("caseFocusStatusAll" in candidate) {
    const status = readContentStatus(candidate.caseFocusStatusAll);
    if (status === null) return null;
    patch.caseFocusStatusAll = status;
  }

  if ("caseFocusStatus" in candidate) {
    const value = candidate.caseFocusStatus;
    if (!isRecord(value) || typeof value.caseFocusId !== "string" || value.caseFocusId === "") {
      return null;
    }
    const status = readContentStatus(value.status);
    if (status === null) return null;
    patch.caseFocusStatus = { caseFocusId: value.caseFocusId, status };
  }

  if ("legalSourceStatusAll" in candidate) {
    const value = candidate.legalSourceStatusAll;
    if (
      typeof value !== "string" ||
      !(LEGAL_SOURCE_STATUSES as readonly string[]).includes(value)
    ) {
      return null;
    }
    patch.legalSourceStatusAll = value as NonNullable<FixturePatch["legalSourceStatusAll"]>;
  }

  if ("examplesExpired" in candidate) {
    if (typeof candidate.examplesExpired !== "boolean") return null;
    patch.examplesExpired = candidate.examplesExpired;
  }

  if ("caseFocusesExpired" in candidate) {
    if (typeof candidate.caseFocusesExpired !== "boolean") return null;
    patch.caseFocusesExpired = candidate.caseFocusesExpired;
  }

  if ("legalSourcesExpired" in candidate) {
    if (typeof candidate.legalSourcesExpired !== "boolean") return null;
    patch.legalSourcesExpired = candidate.legalSourcesExpired;
  }

  return patch;
}

/**
 * 反馈只接受预定义类型和允许的非内容元数据。任何额外键、自由文本或不在
 * 白名单内的取值都拒绝，避免页面文本、案情或检索词被夹带上传。
 */
function readFeedbackRequest(
  body: unknown,
): { category: FeedbackCategory; metadata: FeedbackMetadata } | null {
  if (!isRecord(body)) return null;
  for (const key of Object.keys(body)) {
    if (!["contractVersion", "category", "metadata"].includes(key)) return null;
  }
  if (body.contractVersion !== CONTRACT_VERSION) return null;
  const category = body.category;
  if (typeof category !== "string" || !FEEDBACK_CATEGORIES.includes(category as FeedbackCategory)) {
    return null;
  }
  const metadata: FeedbackMetadata = {};
  const rawMetadata = body.metadata;
  if (rawMetadata !== undefined) {
    if (!isRecord(rawMetadata)) return null;
    for (const key of Object.keys(rawMetadata)) {
      if (!["pageId", "featureState", "contentReleaseId", "workflowVersion"].includes(key)) {
        return null;
      }
    }
    if (rawMetadata.pageId !== undefined) {
      if (typeof rawMetadata.pageId !== "string" || !FEEDBACK_PAGE_IDS.has(rawMetadata.pageId)) {
        return null;
      }
      metadata.pageId = rawMetadata.pageId;
    }
    if (rawMetadata.featureState !== undefined) {
      if (
        typeof rawMetadata.featureState !== "string" ||
        !FEEDBACK_FEATURE_STATES.has(rawMetadata.featureState)
      ) {
        return null;
      }
      metadata.featureState = rawMetadata.featureState;
    }
    if (rawMetadata.contentReleaseId !== undefined) {
      if (typeof rawMetadata.contentReleaseId !== "string" || rawMetadata.contentReleaseId.length > 128) {
        return null;
      }
      metadata.contentReleaseId = rawMetadata.contentReleaseId;
    }
    if (rawMetadata.workflowVersion !== undefined) {
      if (typeof rawMetadata.workflowVersion !== "string" || rawMetadata.workflowVersion.length > 128) {
        return null;
      }
      metadata.workflowVersion = rawMetadata.workflowVersion;
    }
  }
  return { category: category as FeedbackCategory, metadata };
}

/** 官方链接只允许 http(s)；非法协议在返回用户前被移除。 */
function sanitizeLegalSource(source: LegalSourceReference): LegalSourceReference {
  return { ...source, officialUrl: sanitizeOfficialUrl(source.officialUrl) };
}

/**
 * 构建 PoliceMate 后端。该函数不负责监听端口，便于测试直接使用 `inject`。
 */
export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const { config, fixtures } = deps;
  const providers = deps.providers ?? fixtures;
  if (providers === undefined) throw new Error("缺少外部边界提供者。");
  if (config.enableTestControls && (fixtures === undefined || config.providerMode !== "fixture" || config.environment === "production")) {
    throw new Error("测试控制只允许在非生产 fixture 模式启用。");
  }
  const runtime = deps.runtime ?? resolveRuntimeConfig(config);
  const telemetry = deps.telemetry ?? createMemoryTelemetrySink();
  const tokenService = deps.tokenService ?? anonymousTokens;
  const rateLimiter = deps.rateLimiter ?? new FixedWindowRateLimiter(runtime.rateLimitMax, runtime.rateLimitWindowMs);
  const concurrencyGate = deps.concurrencyGate ?? new ConcurrencyGate(runtime.maxConcurrency);

  const app = Fastify({
    logger: false,
    genReqId: () => randomUUID(),
    bodyLimit: runtime.bodyLimitBytes,
  });

  // 来源限制：先于业务处理拒绝非允许来源，避免把未授权流量带入状态机。
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    const origin = request.headers.origin;
    if (!isOriginAllowed(origin, request.headers.host, runtime.allowedOrigins)) {
      await reply
        .code(403)
        .send(errorBody(request.id, "origin_not_allowed", "当前来源不允许访问该接口。"));
    }
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    const exempt = CONTRACT_EXEMPT_PREFIXES.some((prefix) => request.url.startsWith(prefix));
    if (!exempt) {
      const requested = request.headers[CONTRACT_HEADER];
      if (typeof requested !== "string" || requested.trim() === "") {
        await reply
          .code(400)
          .send(
            errorBody(request.id, "invalid_request", `缺少契约版本请求头 ${CONTRACT_HEADER}。`),
          );
        return;
      }
      if (requested !== CONTRACT_VERSION) {
        await reply
          .code(409)
          .send(
            errorBody(
              request.id,
              "contract_incompatible",
              `契约版本不兼容（客户端 ${requested}，服务端 ${CONTRACT_VERSION}），请刷新或更新页面。`,
            ),
          );
        return;
      }
    }

    if (!isProtected(request.url)) {
      // 令牌签发本身也需要限流，但按来源 IP 计数，避免无限签发。
      if (request.url.startsWith("/api/v1/anonymous-tokens")) {
        const decision = rateLimiter.check(`ip:${request.ip}`);
        if (!decision.allowed) {
          reply.header("retry-after", String(Math.ceil(decision.retryAfterMs / 1000)));
          await reply
            .code(429)
            .send(errorBody(request.id, "rate_limited", "请求过于频繁，请稍后再试。"));
        }
      }
      return;
    }

    const token = request.headers[TOKEN_HEADER];
    if (!tokenService.verify(token)) {
      await reply
        .code(401)
        .send(
          errorBody(
            request.id,
            "token_invalid",
            "匿名访问令牌缺失或已过期，请刷新页面后重试。",
          ),
        );
      return;
    }

    const key = typeof token === "string" ? token : request.ip;
    const decision = rateLimiter.check(key);
    if (!decision.allowed) {
      reply.header("retry-after", String(Math.ceil(decision.retryAfterMs / 1000)));
      await reply
        .code(429)
        .send(errorBody(request.id, "rate_limited", "请求过于频繁，请稍后再试。"));
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-robots-tag", "noindex, nofollow, noarchive");
    if (request.url.startsWith("/api/")) {
      reply.header("cache-control", "no-store");
    }
    return payload;
  });

  // 只记录非内容运行元数据：路由、状态、耗时、版本。不读取响应正文，
  // 也不记录查询字符串（可能包含检索词）。
  app.addHook("onResponse", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    telemetry.record({
      requestId: request.id,
      timestamp: new Date().toISOString(),
      kind: "http.request",
      outcome: classifyStatus(reply.statusCode),
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
      contractVersion: CONTRACT_VERSION,
      featureState: request.routeOptions?.url ?? "unknown",
    });
  });

  app.get("/api/v1/health", async (): Promise<HealthResponse> => {
    return { contractVersion: CONTRACT_VERSION, status: "ok", providerMode: config.providerMode };
  });

  // 短期匿名令牌：随机、不编码内容、不构成身份认证；到期后失败关闭。
  app.post("/api/v1/anonymous-tokens", async (): Promise<AnonymousTokenResponse> => {
    const record = tokenService.issue();
    return {
      contractVersion: CONTRACT_VERSION,
      token: record.token,
      expiresAt: new Date(record.expiresAt).toISOString(),
    };
  });

  app.get("/api/v1/shell", async (): Promise<ProductShellResponse> => {
    const inputs = await loadCapabilityInputs(
      {
        masterSwitch: config.masterSwitch,
        analysisEnabled: config.analysisEnabled,
        documentsEnabled: config.documentsEnabled,
      },
      providers,
    );
    return buildProductShell(inputs, CONTRACT_VERSION);
  });

  app.get("/api/v1/data-use", async (): Promise<DataUseResponse> => {
    return buildDataUseResponse(config.service, CONTRACT_VERSION);
  });

  // 结构化反馈：只接受预定义类型与白名单元数据，不接收自由文本或页面文本。
  app.post<{ Body: FeedbackRequest }>("/api/v1/feedback", async (request, reply) => {
    const parsed = readFeedbackRequest(request.body);
    if (parsed === null) {
      return reply
        .code(400)
        .send(errorBody(request.id, "invalid_request", "反馈内容或类型无效。"));
    }
    telemetry.record({
      requestId: request.id,
      timestamp: new Date().toISOString(),
      kind: "feedback",
      outcome: "ok",
      featureState: parsed.metadata.featureState ?? parsed.category,
      contentReleaseId: parsed.metadata.contentReleaseId,
      workflowVersion: parsed.metadata.workflowVersion,
      featureCount: 1,
    });
    const response: FeedbackResponse = {
      contractVersion: CONTRACT_VERSION,
      requestId: request.id,
      accepted: true,
      categoryLabel: FEEDBACK_CATEGORY_LABELS[parsed.category],
    };
    return response;
  });

  // 文书范例检索与打开都重新执行当前状态门控；响应禁止缓存。
  // 总开关或文书入口停用时，检索与旧链接一律阻断（失败关闭），
  // 不能只靠首页入口卡片降级。
  const documentsRetrievalEnabled = isDocumentRetrievalEnabled(config);

  app.get("/api/v1/document-examples", async (): Promise<DocumentExampleListResponse> => {
    const index = await providers.content.listExamples();
    const items = documentsRetrievalEnabled ? index.items : [];
    const facets = documentsRetrievalEnabled ? index.facets : buildFacets([]);
    return {
      contractVersion: CONTRACT_VERSION,
      generatedAt: new Date().toISOString(),
      releaseId: documentsRetrievalEnabled ? index.releaseId : "",
      notice: index.notice,
      stages: index.stages,
      items,
      facets,
    };
  });

  // 报告文书任务候选跳转：只使用程序类别、办理阶段、适用对象和案情标签筛选，
  // 不接收案情事实，不自动选择唯一范例。能力停用时失败关闭。
  app.post<{ Body: DocumentTaskCandidateRequest }>(
    "/api/v1/document-examples/task-candidates",
    async (request, reply) => {
      const parsed = readTaskCandidateRequest(request.body);
      if (parsed === null) {
        return reply
          .code(400)
          .send(errorBody(request.id, "invalid_request", "文书任务候选筛选参数无效。"));
      }
      if (!documentsRetrievalEnabled) {
        return reply
          .code(410)
          .send(
            errorBody(
              request.id,
              "content_unavailable",
              "当前文书范例内容不可用，无法展示候选范例。",
            ),
          );
      }
      const index = await providers.content.listExamples();
      const candidates = providers.content.listTaskCandidates
        ? await providers.content.listTaskCandidates(parsed)
        : [];
      const response: DocumentTaskCandidatesResponse = {
        contractVersion: CONTRACT_VERSION,
        generatedAt: new Date().toISOString(),
        releaseId: index.releaseId,
        notice: index.notice,
        selectionBoundary: REPORT_DOCUMENT_TASK_BOUNDARY,
        candidates,
      };
      return response;
    },
  );

  app.get<{ Params: { exampleId: string } }>(
    "/api/v1/document-examples/:exampleId",
    async (request, reply) => {
      const lookup = documentsRetrievalEnabled
        ? await providers.content.getExample(request.params.exampleId)
        : ({ outcome: "unavailable" } as const);
      if (lookup.outcome === "not_found") {
        return reply.code(404).send(errorBody(request.id, "not_found", "未找到该文书范例。"));
      }
      if (lookup.outcome === "unavailable") {
        return reply
          .code(410)
          .send(
            errorBody(
              request.id,
              "content_unavailable",
              "当前内容已经失效，无法继续查看正文，请返回文书范例列表重新选择。",
            ),
          );
      }
      const example = {
        ...lookup.example,
        legalSources: lookup.example.legalSources.map(sanitizeLegalSource),
      };
      const response: DocumentExampleDetailResponse = {
        contractVersion: CONTRACT_VERSION,
        generatedAt: new Date().toISOString(),
        releaseId: lookup.releaseId,
        notice: lookup.notice,
        example,
      };
      return response;
    },
  );

  if (config.enableTestControls && fixtures !== undefined) {
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

  // 案情分析：会话存于短暂运行内存；能力停用或边界不可用时失败关闭。
  const analysisEngineResolved =
    deps.analysisEngine ??
    new AnalysisEngine(providers.analysis, {
      analysisTimeoutMs: runtime.analysisTimeoutMs,
      reportTimeoutMs: runtime.reportTimeoutMs,
      maxAttempts: runtime.maxProviderAttempts,
      preserveConditionalAnalysis: config.providerMode === "dify",
      telemetry,
    });
  const legalSources = async (): Promise<LegalSourceReference[]> =>
    (providers.content.listLegalSources ? await providers.content.listLegalSources() : []).map(
      sanitizeLegalSource,
    );
  await registerAnalysisRoutes(app, {
    engine: analysisEngineResolved,
    legalSources,
    activeReleaseId: async () => (await providers.content.getActiveRelease()).releaseId,
    analysisCapabilityEnabled: () => config.masterSwitch && config.analysisEnabled,
    analysisBoundaryAvailable: async () => providers.dify.getAvailability(),
    caseFocusResolver: providers.content.resolveCaseFocus
      ? async (facts, now) => {
          const resolution = await providers.content.resolveCaseFocus!(facts, now);
          return {
            ...resolution,
            legalSources: resolution.legalSources.map(sanitizeLegalSource),
          };
        }
      : undefined,
    concurrencyGate,
  });

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const tooLarge = error.code === "FST_ERR_CTP_BODY_TOO_LARGE";
    const status = tooLarge
      ? 413
      : typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    const code: ApiErrorBody["error"]["code"] = tooLarge
      ? "request_too_large"
      : status === 500
        ? "internal_error"
        : "invalid_request";
    const message = tooLarge
      ? "请求体超过大小上限，请精简后重试。"
      : status === 500
        ? "服务暂时不可用，请稍后重试。"
        : (error.message ?? "请求无法处理。");
    await reply.code(status).send(errorBody(request.id, code, message));
  });

  const staticDir = config.staticDir;
  if (staticDir !== null) {
    await app.register(fastifyStatic, { root: staticDir });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send(errorBody(request.id, "not_found", "接口不存在。"));
    }
    if (staticDir !== null) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).type("text/plain; charset=utf-8").send("未找到页面。");
  });

  return app;
}
