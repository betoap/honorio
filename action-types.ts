// src/core/action/action-types.ts

export interface ActionExceptionMeta {
  traceId?: string;
  durationMs?: number;
  stepName?: string;
  [key: string]: unknown;
}

export interface ActionExceptionDetails {
  request?: {
    url?: string;
    method?: string;
    params?: Record<string, unknown>;
    data?: unknown;
    headers?: Record<string, unknown>;
  };
  response?: {
    status?: number;
    headers?: Record<string, unknown>;
    data?: unknown;
  };
  [key: string]: unknown;
}
