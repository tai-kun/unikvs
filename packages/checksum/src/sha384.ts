import { sha384 } from "@noble/hashes/sha2.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * {@link ChecksumSha384} のオプションです。
 */
export type ChecksumSha384Options = ChecksumOptions;

/**
 * SHA-384 アルゴリズムを使用してデータの整合性を検証するトランスフォーマーです。
 *
 * コンテキストキー `@unikvs/checksum:sha384` に期待するハッシュ値を設定することで検証を行います。
 */
export default class ChecksumSha384 extends Checksum implements ITransformer {
  /**
   * 期待するチェックサムを保持するコンテクストキーです。
   */
  public static override readonly CHECKSUM_CONTEXT_KEY: string = "@unikvs/checksum:sha384";

  /**
   * ChecksumSha384 の新しいインスタンスを初期化します。
   *
   * @param options オプションです。
   */
  public constructor(options?: ChecksumSha384Options) {
    super("ChecksumSha384", sha384, options);
  }
}
