/**
 * unikvs 内で状態や設定を保持するための、汎用的な変数オブジェクトの型定義です。
 *
 * キーは string を許容し、値は unknown 型として扱います。
 *
 * @example
 * チェックサム検証で期待するハッシュ値を変数経由で指定します。
 *
 * ```ts
 * import { ChecksumSha256 } from "@unikvs/checksum";
 * import type { Variables } from "@unikvs/core";
 *
 * const vars: Variables = {
 *   "@unikvs/checksum:sha256": "abc123...",
 * };
 *
 * const transformer = new ChecksumSha256();
 * transformer.encode({ data, vars });
 * ```
 *
 * @example
 * S3 ストレージでマルチパートアップロードのパートサイズを指定します。
 *
 * ```ts
 * import type { Variables } from "@unikvs/core";
 *
 * const vars: Variables = {
 *   "@unikvs/s3.node:partSize": 8 * 1024 * 1024,
 * };
 * ```
 *
 * @example
 * unikvs 本体が自動的に設定するキーです。
 *
 * ```ts
 * import type { Variables } from "@unikvs/core";
 *
 * // "unikvs:action" は現在の操作種別を示します。
 * // "unikvs:key" は操作対象のキーを示します（set / get / has / delete / stream 時）。
 * const vars: Variables = {
 *   "unikvs:action": "set",
 *   "unikvs:key": "foo",
 * };
 * ```
 */
export type Variables = Record<string, unknown>;
