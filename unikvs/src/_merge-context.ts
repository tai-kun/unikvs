import { Context } from "@unikvs/core";

import type { ContextSource } from "./context.types.js";

/**
 * 2 つの Context オブジェクトを結合します。
 *
 * 基本となる Context に対して、追加または上書きするコンテキスト情報を結合し、新しい Context オブジェクトを生成して返します。追加するコンテキスト情報が配列（キーと値のペアの配列）である場合は、オブジェクトに変換した上で結合処理を行います。
 *
 * @param a ベースとなる読み取り専用の Context オブジェクトです。
 * @param b 結合する読み取り専用の Context、または ContextSource、あるいは undefined です。
 * @returns 結合された新しい Context オブジェクトです。
 */
export default function mergeContext(
  a: Readonly<Context>,
  b: Readonly<Context> | ContextSource | undefined,
): Context {
  return { ...a, ...(Array.isArray(b) ? Object.fromEntries(b) : b) };
}
