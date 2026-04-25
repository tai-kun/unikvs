import { tryCaptureStackTrace } from "try-capture-stack-trace";
import { type InferOutput, safeParse } from "valibot";

import { InvalidInputError, type Issue } from "./errors.js";

type BaseSchema = typeof safeParse extends (schema: infer S, ...args: any) => any ? S : never;

export type ParseErrorConstructorArgs = {
  readonly value: unknown;
  readonly issues: readonly [Issue, ...Issue[]];
};

export interface ParseErrorConstructor {
  new (args: ParseErrorConstructorArgs): Error;
}

export function parse<const TSchema extends BaseSchema>(
  schema: TSchema,
  value: unknown,
  Error: ParseErrorConstructor = InvalidInputError,
): InferOutput<TSchema> {
  const result = safeParse(schema, value);
  if (result.success) {
    return result.output;
  }

  const error = new Error({ value, issues: result.issues });
  tryCaptureStackTrace(error, parse);
  throw error;
}
