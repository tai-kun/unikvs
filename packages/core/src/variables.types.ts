/**
 * unikvs 内で状態や設定を保持するための、汎用的な変数オブジェクトの型定義です。
 *
 * キーは string を許容し、値は unknown 型として扱います。
 */
export type Variables = Record<string, unknown>;
