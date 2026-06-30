/**
 * unikvs 内で状態や設定を保持するための、汎用的なコンテキストオブジェクトの型定義です。
 *
 * キーは string を許容し、値は unknown 型として扱います。
 *
 * @example
 * チェックサム検証で期待するハッシュ値をコンテキスト経由で指定します。
 *
 * ```ts
 * import { ChecksumSha256 } from "@unikvs/checksum";
 * import type { Context } from "@unikvs/core";
 *
 * const context: Context = {
 *   "@unikvs/checksum:sha256": "abc123...",
 * };
 *
 * const transformer = new ChecksumSha256();
 * transformer.encode({ data, context });
 * ```
 *
 * @example
 * S3 ストレージでマルチパートアップロードのパートサイズを指定します。
 *
 * ```ts
 * import type { Context } from "@unikvs/core";
 *
 * const context: Context = {
 *   "@unikvs/s3.node:partSize": 8 * 1024 * 1024,
 * };
 * ```
 *
 * @example
 * unikvs 本体が自動的に設定するキーです。
 *
 * ```ts
 * import type { Context } from "@unikvs/core";
 *
 * // "unikvs:action" は現在の操作種別を示します。
 * // "unikvs:key" は操作対象のキーを示します（set / get / has / delete / stream 時）。
 * const context: Context = {
 *   "unikvs:action": "set",
 *   "unikvs:key": "foo",
 * };
 * ```
 */
export type Context = Record<string, unknown>;
