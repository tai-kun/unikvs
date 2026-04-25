/**
 * unikvs 内で状態や設定を保持するための、汎用的なコンテキストオブジェクトの型定義です。
 *
 * キーは任意の型（string | number | symbol）を許容し、値は未知の型（unknown）として扱います。
 */
export type Context = Record<keyof any, unknown>;
