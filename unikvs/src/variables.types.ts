// このモジュールは core への一本化のための再輸出層です。独自定義を持ちません。
// 利用者が操作ごとに渡す入力形式として、Variables 自体も受け付けます。
import type { Variables, VariablesInit } from "@unikvs/core";

export type { VariablesEntry, VariablesInit } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
 */
export type VariablesSource = Variables | VariablesInit;
