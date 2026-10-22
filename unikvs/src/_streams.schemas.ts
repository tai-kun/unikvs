import type { IReadableStream, IWritableStream } from "@unikvs/core";

import { isReadableStream, isWritableStream } from "./_streams.js";
import * as v from "./_valibot.js";

/**
 * `ReadableStream` のインターフェースを満たすかを検証するためのスキーマです。
 */
export const ReadableStreamSchema = v.custom<IReadableStream>(
  isReadableStream,
  "Expected a ReadableStream",
);

/**
 * `WritableStream` のインターフェースを満たすかを検証するためのスキーマです。
 */
export const WritableStreamSchema = v.custom<IWritableStream>(
  isWritableStream,
  "Expected a WritableStream",
);
