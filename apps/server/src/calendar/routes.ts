import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  CreateCaseDeadlineRequest,
  UpdateScheduleRequest,
  CalendarResponse,
  ApiError,
} from "./types";
import type { CalendarEngine } from "./engine";
import type { SimpleIdentityService } from "../auth/simple-identity";

export function registerCalendarRoutes(
  app: FastifyInstance,
  calendarEngine: CalendarEngine,
  identityService: SimpleIdentityService,
): void {
  /**
   * 提取令牌并验证身份的辅助函数。
   */
  const requireAuth = async (request: FastifyRequest): Promise<string> => {
    const token = request.headers["x-pm-anonymous-token"];
    const identity = identityService.verify(token);
    if (!identity) {
      throw { statusCode: 401, message: "Unauthorized" };
    }
    return identity.userId;
  };

  // ===== 期限管理 =====

  /**
   * POST /api/v1/cases/:caseId/deadlines
   * 为某个案件创建期限实例。
   */
  app.post<{
    Params: { caseId: string };
    Body: CreateCaseDeadlineRequest;
  }>(
    "/api/v1/cases/:caseId/deadlines",
    async (request, reply) => {
      try {
        const userId = await requireAuth(request);
        const { caseId } = request.params;
        const { caseStartDate, category } = request.body;

        if (!caseStartDate || !category) {
          return reply.status(400).send({
            error: "caseStartDate and category are required",
            code: "invalid_input",
          });
        }

        const deadline = calendarEngine.deadlinesManager.create(
          caseId,
          userId,
          caseStartDate,
          category,
        );

        return reply.status(201).send(deadline);
      } catch (error: any) {
        if (error.statusCode === 401) {
          return reply.status(401).send({ error: error.message, code: "unauthorized" });
        }
        console.error("[calendar] Error creating deadline:", error);
        return reply.status(400).send({
          error: error.message || "Invalid input",
          code: "invalid_input",
        });
      }
    },
  );

  /**
   * GET /api/v1/cases/:caseId/deadlines
   * 查询某案件的所有期限。
   */
  app.get<{ Params: { caseId: string } }>(
    "/api/v1/cases/:caseId/deadlines",
    async (request, reply) => {
      try {
        await requireAuth(request);
        const { caseId } = request.params;

        const deadline = calendarEngine.deadlinesManager.get(caseId);
        if (!deadline) {
          return reply.status(404).send({
            error: "Case deadline not found",
            code: "not_found",
          });
        }

        return reply.status(200).send(deadline);
      } catch (error: any) {
        if (error.statusCode === 401) {
          return reply.status(401).send({ error: error.message, code: "unauthorized" });
        }
        console.error("[calendar] Error fetching deadline:", error);
        return reply.status(500).send({
          error: "Server error",
          code: "server_error",
        });
      }
    },
  );

  /**
   * GET /api/v1/my/deadlines?month=YYYY-MM
   * 查询当前用户负责的所有案件在某月的期限。
   */
  app.get<{ Querystring: { month: string } }>(
    "/api/v1/my/deadlines",
    async (request, reply) => {
      try {
        const userId = await requireAuth(request);
        const { month } = request.query;

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
          return reply.status(400).send({
            error: "month parameter is required. Format: YYYY-MM",
            code: "invalid_input",
          });
        }

        const calendar = calendarEngine.getCalendar(userId, month, "deadlines");

        return reply.status(200).send(calendar);
      } catch (error: any) {
        if (error.statusCode === 401) {
          return reply.status(401).send({ error: error.message, code: "unauthorized" });
        }
        console.error("[calendar] Error fetching deadlines:", error);
        return reply.status(500).send({
          error: "Server error",
          code: "server_error",
        });
      }
    },
  );

  // ===== 排班管理 =====

  /**
   * POST /api/v1/my/schedule
   * 添加或更新自己的某一天排班。
   */
  app.post<{ Body: UpdateScheduleRequest }>(
    "/api/v1/my/schedule",
    async (request, reply) => {
      try {
        const userId = await requireAuth(request);
        const { date, type, timeRange, note } = request.body;

        if (!date || !type) {
          return reply.status(400).send({
            error: "date and type are required",
            code: "invalid_input",
          });
        }

        const schedule = calendarEngine.schedulesManager.setSchedule(userId, date, {
          date,
          type,
          timeRange,
          note,
        });

        return reply.status(200).send(schedule);
      } catch (error: any) {
        if (error.statusCode === 401) {
          return reply.status(401).send({ error: error.message, code: "unauthorized" });
        }
        console.error("[calendar] Error setting schedule:", error);
        return reply.status(400).send({
          error: error.message || "Invalid input",
          code: "invalid_input",
        });
      }
    },
  );

  /**
   * DELETE /api/v1/my/schedule/:date
   * 删除自己的某一天排班。
   */
  app.delete<{ Params: { date: string } }>(
    "/api/v1/my/schedule/:date",
    async (request, reply) => {
      try {
        const userId = await requireAuth(request);
        const { date } = request.params;

        const schedule = calendarEngine.schedulesManager.deleteSchedule(userId, date);

        return reply.status(200).send(schedule);
      } catch (error: any) {
        if (error.statusCode === 401) {
          return reply.status(401).send({ error: error.message, code: "unauthorized" });
        }
        console.error("[calendar] Error deleting schedule:", error);
        return reply.status(500).send({
          error: "Server error",
          code: "server_error",
        });
      }
    },
  );

  /**
   * GET /api/v1/my/schedule?month=YYYY-MM
   * 查询自己在某月的排班。
   */
  app.get<{ Querystring: { month: string } }>(
    "/api/v1/my/schedule",
    async (request, reply) => {
      try {
        const userId = await requireAuth(request);
        const { month } = request.query;

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
          return reply.status(400).send({
            error: "month parameter is required. Format: YYYY-MM",
            code: "invalid_input",
          });
        }

        const calendar = calendarEngine.getCalendar(userId, month, "schedules");

        return reply.status(200).send(calendar);
      } catch (error: any) {
        if (error.statusCode === 401) {
          return reply.status(401).send({ error: error.message, code: "unauthorized" });
        }
        console.error("[calendar] Error fetching schedule:", error);
        return reply.status(500).send({
          error: "Server error",
          code: "server_error",
        });
      }
    },
  );

  /**
   * GET /api/v1/calendar?month=YYYY-MM&view=deadlines|schedules
   * 统一日历查询接口。
   */
  app.get<{
    Querystring: { month: string; view: "deadlines" | "schedules" };
  }>(
    "/api/v1/calendar",
    async (request, reply) => {
      try {
        const userId = await requireAuth(request);
        const { month, view } = request.query;

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
          return reply.status(400).send({
            error: "month parameter is required. Format: YYYY-MM",
            code: "invalid_input",
          });
        }

        if (!view || !["deadlines", "schedules"].includes(view)) {
          return reply.status(400).send({
            error: 'view parameter must be "deadlines" or "schedules"',
            code: "invalid_input",
          });
        }

        const calendar = calendarEngine.getCalendar(userId, month, view);

        return reply.status(200).send(calendar);
      } catch (error: any) {
        if (error.statusCode === 401) {
          return reply.status(401).send({ error: error.message, code: "unauthorized" });
        }
        console.error("[calendar] Error fetching calendar:", error);
        return reply.status(500).send({
          error: "Server error",
          code: "server_error",
        });
      }
    },
  );
}
