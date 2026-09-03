import type { Variables } from "@unikvs/core";

import type { ValueOf } from "./utils.types.js";

/**
 * 変数の単一のエントリーを表す、読み取り専用のキーと値のペア（タプル）です。
 *
 * インデックス 0 はキー、1 は値を保持します。
 */
export type VariableEntry = readonly [key: keyof Variables, value: ValueOf<Variables>];

/**
 * 変数の初期化や更新に使用できる、データソースの型定義です。
 *
 * 以下のいずれかの形式を受け入れます：
 * 1. 読み取り専用の変数オブジェクト
 * 2. キーと値のペアを列挙した反復可能なオブジェクト
 */
export type VariablesSource = Readonly<Variables> | readonly VariableEntry[];
