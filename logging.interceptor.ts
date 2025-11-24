import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { v4 } from 'uuid';
import { ILog } from 'a/shared/helpers/logs-helper';
import { DateHelper } from 'a/shared/helpers/date-helper';
import { Errors } from 'a/shared/enum/errors';
import { LoggerUtil } from 'a/shared/logger/logger.util';
import { ActionException } from './action-exception';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly CODES = [404, 400, 422];

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();
    request.headers['startTime'] = startTime;

    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;

    return next.handle().pipe(
      map((data) => data),

      catchError((err) => {
        const log = this.createErrorLog(request, response, err, startTime);
        LoggerUtil.error(`${controllerName}.${handlerName}`, log);

        // --- MODO HÍBRIDO ---
        // 1) ActionException → padroniza e devolve ActionResult
        if (err instanceof ActionException) {
          return of({
            ok: false,
            error: {
              code: err.code,
              message: err.message,
              details: err.details,
            },
            meta: err.meta ?? undefined,
          });
        }

        // 2) Erro vindo do Gateway (Axios ou ActionException.upstream)
        if (err?.response || err?.config) {
          return of({
            ok: false,
            error: {
              code: 'UPSTREAM_ERROR',
              message: err?.response?.data?.message ?? err.message,
              details: err?.response?.data ?? null,
            },
          });
        }

        // 3) Erro inesperado → deixa virar 500 real
        return throwError(() => err);
      })
    );
  }

  private createErrorLog(request: any, response: any, err: any, startTime: number): ILog {
    const duration = Date.now() - startTime;
    const host = request.headers['host'];
    const url = `${request.protocol}://${host}${request.originalUrl}`;
    const errorResponse = err?.response?.data ?? {};
    const status = this.definirStatus(err, errorResponse);

    const AxiosRequestUrl = err?.config?.baseURL || err?.config?.url || err?.request?.path || 'URL não disponível';
    const AxiosRequestMethod = err?.config?.method;
    const AxiosResponseStatus = err?.response?.status || 'Status não disponível';
    const AxiosResponseMessage = err?.message || 'Mensagem não disponível';
    const AxiosHeaders = err?.response?.headers || {};
    const AxiosData = err?.config?.data || {};
    const AxiosParams = err?.config?.params;
    const AxiosTimestamp = DateHelper.currentDateLocalIsoString();

    const { status: errorStatus, message, stack, data, code } = this.extractErrorDetails({ error: err });

    return {
      type: 'BFF',
      service: 'giroassistido',
      id: v4(),
      status: errorStatus ?? status,
      method: request.method.toUpperCase(),
      path: request.route ? request.route.path : url,
      timestamp: DateHelper.currentDateLocalIsoString(),
      duration: `${duration}ms`,
      url: url,
      correlation_id: request.headers['x-itau-correlationid'] ?? '',
      request: {
        headers: request.headers,
        data: request.body,
        timestamp: DateHelper.currentDateLocalIsoString(),
      },
      response: {
        headers: response.headers ?? {},
        data: {
          message: message ?? Errors.DEFAULT_ERROR_MESSAGE,
          description: data?.description ?? Errors.DEFAULT_ERROR_DESCRIPTION,
          stack: stack ?? Errors.DEFAULT_ERROR_STACK,
          code: code,
        },
        timestamp: DateHelper.currentDateLocalIsoString(),
      },
      external: {
        request: {
          url: AxiosRequestUrl,
          method: AxiosRequestMethod,
          params: AxiosParams,
          data: AxiosData,
          headers: AxiosHeaders,
          timestamp: AxiosTimestamp,
        },
        response: {
          status: AxiosResponseStatus,
          message: AxiosResponseMessage,
        },
      },
    };
  }

  private extractErrorDetails(error: any): any {
    return {
      status: error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      message: error.message ?? Errors.DEFAULT_ERROR_MESSAGE,
      stack: error.stack ?? Errors.DEFAULT_ERROR_STACK,
      data: error.response?.data ?? {},
      code: error.code ?? '',
    };
  }

  private definirStatus(err: any, errorResponse: any): number {
    if (errorResponse.status && this.CODES.includes(errorResponse.status)) {
      return errorResponse.status;
    }

    if (err.status && this.CODES.includes(err.status)) {
      return err.status;
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
