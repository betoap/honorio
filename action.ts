// src/core/action/base-action.ts
import { ActionException } from "./action-exception";
import { ActionResult, ActionStatus } from "./action-result";

export abstract class BaseAction<TInput, TRaw, TOutput> {
  protected validate(input: TInput): Promise<void> | void {}

  protected abstract process(input: TInput): Promise<TRaw>;

  protected transform(raw: TRaw): Promise<TOutput> | TOutput {
    return raw as unknown as TOutput;
  }

  async execute(input: TInput): Promise<ActionResult<TOutput>> {
    try {
      await this.validate(input);
      const raw = await this.process(input);
      const out = await this.transform(raw);

      return {
        status: ActionStatus.SUCCESS,
        data: out,
      };
    } catch (e: unknown) {
      const err =
        e instanceof ActionException
          ? e
          : ActionException.internal(
              e instanceof Error ? e.message : "Erro interno",
              e
            );

      return {
        status: ActionStatus.ERROR,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          cause: err.cause,
        },
      };
    }
  }
}
