// src/core/action/action-exception.ts
import { ActionExceptionDetails, ActionExceptionMeta } from "./action-types";

export class ActionException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: ActionExceptionDetails,
    public readonly cause?: unknown,
    public readonly meta?: ActionExceptionMeta
  ) {
    super(message);
  }

  static badRequest(
    message: string,
    details?: ActionExceptionDetails,
    meta?: ActionExceptionMeta
  ) {
    return new ActionException(
      "BAD_REQUEST",
      message,
      details,
      undefined,
      meta
    );
  }

  static upstream(
    message: string,
    details?: ActionExceptionDetails,
    cause?: unknown,
    meta?: ActionExceptionMeta
  ) {
    return new ActionException("UPSTREAM_ERROR", message, details, cause, meta);
  }

  static notFound(
    message: string,
    details?: ActionExceptionDetails,
    meta?: ActionExceptionMeta
  ) {
    return new ActionException("NOT_FOUND", message, details, undefined, meta);
  }

  static unauthorized(
    message: string,
    details?: ActionExceptionDetails,
    meta?: ActionExceptionMeta
  ) {
    return new ActionException(
      "UNAUTHORIZED",
      message,
      details,
      undefined,
      meta
    );
  }

  static internal(
    message: string,
    cause?: unknown,
    meta?: ActionExceptionMeta
  ) {
    return new ActionException(
      "INTERNAL_ERROR",
      message,
      undefined,
      cause,
      meta
    );
  }
}
