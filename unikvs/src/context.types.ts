import type { Context } from "@unikvs/core";

import type { ValueOf } from "./utils.types.js";

/**
 * コンテキストの単一のエントリーを表す、読み取り専用のキーと値のペア（タプル）です。
 *
 * インデックス 0 はキー、1 は値を保持します。
 */
export type ContextKeyValuePair = readonly [key: keyof Context, value: ValueOf<Context>];

/**
 * コンテキストの初期化や更新に使用できる、データソースの型定義です。
 *
 * 以下のいずれかの形式を受け入れます：
 * 1. 読み取り専用のコンテキストオブジェクト
 * 2. キーと値のペアを列挙した反復可能なオブジェクト
 */
export type ContextSource = Readonly<Context> | readonly ContextKeyValuePair[];
