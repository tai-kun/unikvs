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
 * 変数キー `@unikvs/checksum:sha384` に期待するハッシュ値を設定することで検証を行います。
 */
export default class ChecksumSha384 extends Checksum implements ITransformer {
  /**
   * 期待するチェックサムを保持する変数キーです。
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:sha384";

  /**
   * ChecksumSha384 の新しいインスタンスを初期化します。
   *
   * @param options オプションです。
   */
  public constructor(options?: ChecksumSha384Options) {
    super("ChecksumSha384", sha384, options);
  }
}
