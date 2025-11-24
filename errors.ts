import { ActionExceptionDetails } from "./action-types";

export enum ActionStatus {
  SUCCESS = "success",
  ERROR = "error",
}

export type ActionSuccess<T> = {
  status: ActionStatus.SUCCESS;
  data: T;
};

export type ActionFailure = {
  status: ActionStatus.ERROR;
  error: {
    code: string;
    message: string;
    details?: ActionExceptionDetails;
    cause?: unknown;
  };
};

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;
