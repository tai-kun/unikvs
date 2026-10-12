import { Variables, type VariablesInit } from "@unikvs/core";

import type { VariablesSource } from "./variables.types.js";

// 予約名前空間です。利用者側の密封指定は取り除き、実行時に密封し直します。
function isReservedKey(key: string): boolean {
  return key.startsWith("unikvs:");
}

/**
 * 2 つの Variables を結合します。
 *
 * ベースを複製し、追加変数を上書きします。追加変数が Variables のときは readonly 指定を引き継ぎます。
 * ただし予約名前空間の密封指定は引き継がず、実行時の密封に委ねます。
 *
 * @param a ベースとなる Variables です。複製されるため変更されません。
 * @param b 結合する VariablesSource、あるいは undefined です。Variables を渡しても参照を奪いません。
 * @returns 結合された新しい Variables です。
 */
export default function mergeVariables(
  a: Variables | VariablesInit,
  b: VariablesSource | undefined,
): Variables {
  const base = a instanceof Variables ? a.clone() : new Variables(a);
  if (b === undefined) {
    return base;
  }
  if (b instanceof Variables) {
    const overrides: Record<string, unknown> = {};
    for (const [key, value] of b) {
      overrides[key] = value;
    }
    const merged = base.clone(overrides);
    for (const [key] of b) {
      if (b.isReadonly(key) && !isReservedKey(key) && !merged.isReadonly(key)) {
        merged.setReadonly(key, merged.get(key));
      }
    }
    return merged;
  }
  return base.clone(b);
}
