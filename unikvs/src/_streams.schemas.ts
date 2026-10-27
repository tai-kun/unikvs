import type { IReadableStream, IWritableStream } from "@unikvs/core";
import type { CustomIssue, CustomSchema, ErrorMessage } from "valibot";

import { isReadableStream, isWritableStream } from "./_streams.js";
import * as v from "./_valibot.js";

/**
 * `ReadableStream` のインターフェースを満たすかを検証するためのスキーマです。
 */
export const ReadableStreamSchema: CustomSchema<
  IReadableStream,
  ErrorMessage<CustomIssue> | undefined
> = v.custom<IReadableStream>(isReadableStream, "Expected a ReadableStream");

/**
 * `WritableStream` のインターフェースを満たすかを検証するためのスキーマです。
 */
export const WritableStreamSchema: CustomSchema<
  IWritableStream,
  ErrorMessage<CustomIssue> | undefined
> = v.custom<IWritableStream>(isWritableStream, "Expected a WritableStream");
