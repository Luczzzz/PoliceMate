import type { FastifyInstance } from "fastify";
import type { ClaimIdentityRequest, ClaimIdentityResponse, AuthError } from "./types";
import type { SimpleIdentityService } from "./simple-identity";

export function registerAuthRoutes(
  app: FastifyInstance,
  identityService: SimpleIdentityService,
): void {
  /**
   * POST /api/v1/auth/claim-identity
   * 申领用户身份。
   *
   * 请求体：{ username: string }
   * 响应：{ userId: string, token: string }
   */
  app.post<{ Body: ClaimIdentityRequest; Reply: ClaimIdentityResponse | AuthError }>(
    "/api/v1/auth/claim-identity",
    async (request, reply) => {
      const { username } = request.body;

      if (!username || typeof username !== "string") {
        return reply.status(400).send({
          error: "username is required",
          code: "invalid_username",
        });
      }

      try {
        const result = identityService.claimIdentity(username);
        return reply.status(200).send(result);
      } catch (error) {
        return reply.status(400).send({
          error: "Invalid username format. Use 2-50 characters: Chinese, letters, numbers, underscore, dash.",
          code: "invalid_username",
        });
      }
    },
  );
}
