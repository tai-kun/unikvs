import { Context } from "@unikvs/core";

import type { ContextSource } from "./context.types.js";

export default function mergeContext(
  a: Readonly<Context>,
  b: Readonly<Context> | ContextSource | undefined,
): Context {
  return { ...a, ...(Array.isArray(b) ? Object.fromEntries(b) : b) };
}
