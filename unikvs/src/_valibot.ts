import { tryCaptureStackTrace } from "try-capture-stack-trace";
import { type InferOutput, safeParse } from "valibot";

import {
  type InvalidInputErrorArgs,
  type InvalidOutputErrorArgs,
  InvalidInputError,
  InvalidOutputError,
} from "./errors.js";

export type { InferInput, InferOutput } from "valibot";
export {
  any,
  omit,
  pipe,
  union,
  number,
  string,
  symbol,
  unknown,
  instance,
  minValue,
  optional,
  safeInteger,
} from "valibot";

export { array, tuple, object, record, transform } from "@tai-kun/valibot-extra-lab";

type BaseSchema = typeof safeParse extends (schema: infer S, ...args: any) => any ? S : never;

export interface IParseInputErrorConstructor {
  new (args: InvalidInputErrorArgs): Error;
}

export function parseInput<const TSchema extends BaseSchema>(
  schema: TSchema,
  value: unknown,
  Error: IParseInputErrorConstructor = InvalidInputError,
): InferOutput<TSchema> {
  const result = safeParse(schema, value);
  if (result.success) {
    return result.output;
  }

  const error = new Error({ value, issues: result.issues });
  tryCaptureStackTrace(error, parseInput);
  throw error;
}

export interface ParseOutputErrorConstructor {
  new (args: InvalidOutputErrorArgs): Error;
}

export function parseOutput<const TSchema extends BaseSchema>(
  schema: TSchema,
  value: unknown,
  Error: ParseOutputErrorConstructor = InvalidOutputError,
): InferOutput<TSchema> {
  const result = safeParse(schema, value);
  if (result.success) {
    return result.output;
  }

  const error = new Error({ value, issues: result.issues });
  tryCaptureStackTrace(error, parseOutput);
  throw error;
}
