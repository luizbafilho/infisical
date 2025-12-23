import { z } from "zod";

import { ActionProjectType, PamSessionsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { KubernetesSessionCredentialsSchema } from "@app/ee/services/pam-resource/kubernetes/kubernetes-resource-schemas";
import { MySQLSessionCredentialsSchema } from "@app/ee/services/pam-resource/mysql/mysql-resource-schemas";
import { PostgresSessionCredentialsSchema } from "@app/ee/services/pam-resource/postgres/postgres-resource-schemas";
import { SSHSessionCredentialsSchema } from "@app/ee/services/pam-resource/ssh/ssh-resource-schemas";
import { createGatewayConnection } from "@app/ee/services/pam-gateway/gateway-connection-service";
import { createRelayConnection } from "@app/ee/services/pam-gateway/relay-connection-service";
import { PamSessionStatus } from "@app/ee/services/pam-session/pam-session-enums";
import { sessionAccessDataStore } from "@app/ee/services/pam-session/pam-session-memory-store";
import { executeQueryThroughGateway } from "@app/ee/services/pam-session/pam-query-execution-service";
import {
  HttpEventSchema,
  PamSessionCommandLogSchema,
  SanitizedSessionSchema,
  TerminalEventSchema
} from "@app/ee/services/pam-session/pam-session-schemas";
import {
  ProjectPermissionPamSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

const SessionCredentialsSchema = z.union([
  SSHSessionCredentialsSchema,
  PostgresSessionCredentialsSchema,
  MySQLSessionCredentialsSchema,
  KubernetesSessionCredentialsSchema
]);

const WebSocketMessageSchema = z.object({
  type: z.literal("execute_query"),
  query: z.string().max(10000).min(1),
  options: z
    .object({
      maxRows: z.number().min(1).max(10000).optional(),
      timeout: z.number().min(1000).max(120000).optional()
    })
    .optional()
});

export const registerPamSessionRouter = async (server: FastifyZodProvider) => {
  // Register WebSocket plugin
  await server.register(import("@fastify/websocket"));
  // Meant to be hit solely by gateway identities
  server.route({
    method: "GET",
    url: "/:sessionId/credentials",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get PAM session credentials and start session",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          credentials: SessionCredentialsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { credentials, projectId, account, sessionStarted } =
        await server.services.pamAccount.getSessionCredentials(req.params.sessionId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.PAM_SESSION_CREDENTIALS_GET,
          metadata: {
            sessionId: req.params.sessionId,
            accountName: account.name
          }
        }
      });

      if (sessionStarted) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId,
          event: {
            type: EventType.PAM_SESSION_START,
            metadata: {
              sessionId: req.params.sessionId,
              accountName: account.name
            }
          }
        });
      }

      return { credentials: credentials as z.infer<typeof SessionCredentialsSchema> };
    }
  });

  // Meant to be hit solely by gateway identities
  server.route({
    method: "POST",
    url: "/:sessionId/logs",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update PAM session logs",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      body: z.object({
        logs: z.array(z.union([PamSessionCommandLogSchema, TerminalEventSchema, HttpEventSchema]))
      }),
      response: {
        200: z.object({
          session: PamSessionsSchema.omit({
            encryptedLogsBlob: true
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { session, projectId } = await server.services.pamSession.updateLogsById(
        {
          sessionId: req.params.sessionId,
          logs: req.body.logs
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.PAM_SESSION_LOGS_UPDATE,
          metadata: {
            sessionId: req.params.sessionId,
            accountName: session.accountName
          }
        }
      });

      return { session };
    }
  });

  // Meant to be hit solely by gateway identities
  server.route({
    method: "POST",
    url: "/:sessionId/end",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "End PAM session",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          session: PamSessionsSchema.omit({
            encryptedLogsBlob: true
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { session, projectId } = await server.services.pamSession.endSessionById(
        req.params.sessionId,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.PAM_SESSION_END,
          metadata: {
            sessionId: req.params.sessionId,
            accountName: session.accountName
          }
        }
      });

      return { session };
    }
  });

  server.route({
    method: "GET",
    url: "/:sessionId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get PAM session",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          session: SanitizedSessionSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const response = await server.services.pamSession.getById(req.params.sessionId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: response.session.projectId,
        event: {
          type: EventType.PAM_SESSION_GET,
          metadata: {
            sessionId: req.params.sessionId
          }
        }
      });

      return response;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PAM sessions",
      querystring: z.object({
        projectId: z.string().uuid()
      }),
      response: {
        200: z.object({
          sessions: SanitizedSessionSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const response = await server.services.pamSession.list(req.query.projectId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.query.projectId,
        event: {
          type: EventType.PAM_SESSION_LIST,
          metadata: {
            count: response.sessions.length
          }
        }
      });

      return response;
    }
  });

  // WebSocket route for browser-based PAM sessions
  server.get<{
    Params: { sessionId: string };
  }>(
    "/:sessionId/ws",
    {
      websocket: true,
      schema: {
        params: z.object({
          sessionId: z.string().uuid()
        })
      },
      onRequest: verifyAuth([AuthMode.JWT])
    },
    async (socket, request) => {
      const { sessionId } = request.params;
      const actor = {
        id: request.permission.id,
        type: ActorType.USER,
        orgId: request.permission.orgId,
        authMethod: request.permission.authMethod,
        rootOrgId: request.permission.rootOrgId,
        parentOrgId: request.permission.parentOrgId
      };

      let relayConn: import("tls").TLSSocket | null = null;
      let gatewayConn: import("tls").TLSSocket | null = null;

      const { session } = await server.services.pamSession.getById(sessionId, actor);

      if (session.status === PamSessionStatus.Ended || session.status === PamSessionStatus.Terminated) {
        socket.close(4404, "Session has ended");
        return;
      }

      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        socket.close(4404, "Session has expired");
        return;
      }

      const { permission } = await server.services.permission.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        projectId: session.projectId,
        actionProjectType: ActionProjectType.PAM
      });


      if (!permission.can(ProjectPermissionPamSessionActions.Read, ProjectPermissionSub.PamSessions)) {
        socket.close(4403, "Forbidden: No permission to access session");
        return;
      }

      const accessData = sessionAccessDataStore.get(sessionId);
      if (!accessData) {
        socket.close(4404, "Session data not found or expired");
        return;
      }

      relayConn = await createRelayConnection({
        relayHost: accessData.relayHost,
        relayClientCert: accessData.relayClientCert,
        relayClientKey: accessData.relayClientKey,
        relayServerCertChain: accessData.relayServerCertChain
      });

      gatewayConn = await createGatewayConnection(relayConn, {
        gatewayClientCert: accessData.gatewayClientCert,
        gatewayClientKey: accessData.gatewayClientKey,
        gatewayServerCertChain: accessData.gatewayServerCertChain
      });

      socket.send(
        JSON.stringify({
          type: "connected",
          message: "WebSocket connection established"
        })
      );

      const user = await server.store.user.findById(actor.id);

      socket.on("message", async (data: unknown) => {
        const msgStr = Buffer.isBuffer(data) ? data.toString("utf8") : data;
        const parsed = JSON.parse(msgStr as string);
        const validated = WebSocketMessageSchema.parse(parsed);

        console.log("got the message", validated);

        const results = await executeQueryThroughGateway(
          gatewayConn!,
          validated.query,
          accessData.credentials,
          validated.options
        );

        socket.send(
          JSON.stringify({
            type: "query_result",
            data: results
          })
        );

      });

      socket.on("close", () => {
        logger.info({ sessionId }, "WebSocket connection closed");
        if (gatewayConn) {
          gatewayConn.end();
        }
        if (relayConn) {
          relayConn.end();
        }
      });
    }
  );
};
