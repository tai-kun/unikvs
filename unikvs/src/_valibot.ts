import type { ErrorOptions } from "@unikvs/core";
import { tryCaptureStackTrace } from "try-capture-stack-trace";
import { type InferOutput, safeParse } from "valibot";

import {
  InvalidInputError,
  InvalidOutputError,
  type InvalidInputErrorArgs,
  type InvalidOutputErrorArgs,
} from "./errors.js";

export {
  any,
  omit,
  pipe,
  array,
  tuple,
  union,
  number,
  object,
  record,
  string,
  symbol,
  unknown,
  instance,
  minValue,
  optional,
  transform,
  safeInteger,
} from "valibot";

type BaseSchema = typeof safeParse extends (schema: infer S, ...args: any) => any ? S : never;

export interface ParseInputErrorConstructor {
  new (args: InvalidInputErrorArgs, options?: ErrorOptions): Error;
}

export function parseInput<const TSchema extends BaseSchema>(
  schema: TSchema,
  value: unknown,
  Error: ParseInputErrorConstructor = InvalidInputError,
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
  new (args: InvalidOutputErrorArgs, options?: ErrorOptions): Error;
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
