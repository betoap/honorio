// src/shared/interceptors/logging.interceptor.ts
// ============================================================
// INTERCEPTOR 100% TIPADO + NORMALIZADOR DE ERROS AVANÇADO
// ============================================================

import { Errors } from "@/shared/enum/errors";
import { DateHelper } from "@/shared/helpers/date-helper";
import { ILog } from "@/shared/helpers/logs-helper";
import { LoggerUtil } from "@/shared/logger/logger.util";
import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { AxiosError } from "axios";
import { Observable, of } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { ActionException } from "src/core/action/action-exception";
import { ActionResult, ActionStatus } from "src/core/action/action-result";
import {
  ActionExceptionDetails,
  ActionExceptionMeta,
} from "src/core/action/action-types";
import { v4 } from "uuid";

// -------------------------------------------------------------
// TIPOS BASE
// -------------------------------------------------------------
export type UnknownError = unknown;

export interface HttpRequestLike {
  method: string;
  body: unknown;
  headers: Record<string, unknown>;
  route?: { path: string };
  protocol: string;
  originalUrl: string;
}

export interface HttpResponseLike {
  headers?: Record<string, unknown>;
}

// ------- Estrutura final normalizada -------
export interface NormalizedError {
  code: string;
  message: string;
  status: number;
  details: ActionExceptionDetails | null;
  meta: ActionExceptionMeta | null;
  cause: unknown;
  raw: unknown;
}

// Dados externos
export interface ExternalRequestInfo {
  url?: string;
  method?: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: Record<string, unknown>;
}

export interface ExternalResponseInfo {
  status?: number;
  message?: string;
  headers?: Record<string, unknown>;
  data?: unknown;
}

// ============================================================
// INTERCEPTOR FINAL
// ============================================================
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly CODES = [404, 400, 422];

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<HttpRequestLike>();
    const response = context.switchToHttp().getResponse<HttpResponseLike>();
    const startTime = Date.now();

    request.headers["startTime"] = startTime;

    const controller = context.getClass().name;
    const handler = context.getHandler().name;

    return next.handle().pipe(
      map((data) => data),

      catchError((err: UnknownError) => {
        const normalized = this.normalizeError(err);
        const log = this.createErrorLog(
          request,
          response,
          normalized,
          startTime
        );

        LoggerUtil.error(`${controller}.${handler}`, log);

        const failure: ActionResult<never> = {
          status: ActionStatus.ERROR,
          error: {
            code: normalized.code,
            message: normalized.message,
            details: normalized.details ?? undefined,
            cause: normalized.cause,
          },
        };

        return of(failure);
      })
    );
  }

  // ============================================================
  // NORMALIZA ERRO (ActionException, Axios, erro JS genérico)
  // ============================================================
  private normalizeError(err: UnknownError): NormalizedError {
    // ActionException
    if (err instanceof ActionException) {
      return {
        code: err.code,
        message: err.message,
        status: err.meta?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
        details: err.details ?? null,
        meta: err.meta ?? null,
        cause: err.cause,
        raw: err,
      };
    }

    // AxiosError
    if (this.isAxiosError(err)) {
      return {
        code: err.code ?? "UPSTREAM_ERROR",
        message:
          err.response?.data?.message ?? err.message ?? "Erro desconhecido",
        status: err.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
        details: (err.response?.data as ActionExceptionDetails) ?? null,
        meta: null,
        cause: err,
        raw: err,
      };
    }

    // Error comum
    if (err instanceof Error) {
      return {
        code: "INTERNAL_ERROR",
        message: err.message,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        details: null,
        meta: null,
        cause: err,
        raw: err,
      };
    }

    // fallback (string, number, null, undefined)
    return {
      code: "UNKNOWN_ERROR",
      message: "Erro desconhecido",
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      details: null,
      meta: null,
      cause: err,
      raw: err,
    };
  }

  private isAxiosError(err: unknown): err is AxiosError {
    return typeof err === "object" && err !== null && "isAxiosError" in err;
  }

  // ============================================================
  // GERA LOG COMPLETO
  // ============================================================
  private createErrorLog(
    request: HttpRequestLike,
    response: HttpResponseLike,
    error: NormalizedError,
    startTime: number
  ): ILog {
    const duration = Date.now() - startTime;
    const host = request.headers["host"];
    const url = `${request.protocol}://${host}${request.originalUrl}`;

    const extReq = this.extractExternalRequest(error.raw);
    const extRes = this.extractExternalResponse(error.raw);

    return {
      type: "BFF",
      service: "giroassistido",
      id: v4(),
      status: error.status,
      method: request.method,
      path: request.route ? request.route.path : url,
      timestamp: DateHelper.currentDateLocalIsoString(),
      duration: `${duration}ms`,
      url,
      correlation_id: request.headers["x-itau-correlationid"] as string,

      request: {
        headers: request.headers,
        data: request.body,
        timestamp: DateHelper.currentDateLocalIsoString(),
      },

      response: {
        headers: response.headers ?? {},
        data: {
          message: error.message ?? Errors.DEFAULT_ERROR_MESSAGE,
          description:
            error.details?.description ?? Errors.DEFAULT_ERROR_DESCRIPTION,
          stack: (error.cause as any)?.stack ?? Errors.DEFAULT_ERROR_STACK,
          code: error.code,
        },
        timestamp: DateHelper.currentDateLocalIsoString(),
      },

      external: {
        request: {
          url: extReq.url ?? "N/A",
          method: extReq.method,
          params: extReq.params ?? {},
          data: extReq.data ?? {},
          headers: extReq.headers ?? {},
          timestamp: DateHelper.currentDateLocalIsoString(),
        },
        response: {
          status: extRes.status ?? 0,
          message: extRes.message,
          headers: extRes.headers ?? {},
          data: extRes.data ?? {},
        },
      },
    };
  }

  // ============================================================
  // EXTRAÇÃO SEGURA (Axios)
  // ============================================================
  private extractExternalRequest(err: UnknownError): ExternalRequestInfo {
    if (this.isAxiosError(err)) {
      return {
        url: err.config?.url,
        method: err.config?.method,
        params: err.config?.params,
        data: err.config?.data,
        headers: err.config?.headers,
      };
    }
    return {};
  }

  private extractExternalResponse(err: UnknownError): ExternalResponseInfo {
    if (this.isAxiosError(err)) {
      return {
        status: err.response?.status,
        message: err.response?.data?.message ?? err.message,
        headers: err.response?.headers,
        data: err.response?.data,
      };
    }
    return {};
  }
}
