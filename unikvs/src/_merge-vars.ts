import { Variables } from "@unikvs/core";

import type { VariablesSource } from "./variables.types.js";

/**
 * 2 つの Variables オブジェクトを結合します。
 *
 * 基本となる Variables に対して、追加または上書きする変数情報を結合し、新しい Variables オブジェクトを生成して返します。追加する変数情報が配列（キーと値のペアの配列）である場合は、オブジェクトに変換した上で結合処理を行います。
 *
 * @param a ベースとなる読み取り専用の Variables オブジェクトです。
 * @param b 結合する読み取り専用の Variables、または VariablesSource、あるいは undefined です。
 * @returns 結合された新しい Variables オブジェクトです。
 */
export default function mergeVars(
  a: Readonly<Variables>,
  b: Readonly<Variables> | VariablesSource | undefined,
): Variables {
  return { ...a, ...(Array.isArray(b) ? Object.fromEntries(b) : b) };
}
