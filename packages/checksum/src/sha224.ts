import { sha224 } from "@noble/hashes/sha2.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * {@link ChecksumSha224} のオプションです。
 */
export type ChecksumSha224Options = ChecksumOptions;

/**
 * SHA-224 アルゴリズムを使用してデータの整合性を検証するトランスフォーマーです。
 *
 * 変数キー `@unikvs/checksum:sha224` に期待するハッシュ値を設定することで検証を行います。
 */
export default class ChecksumSha224 extends Checksum implements ITransformer {
  /**
   * 期待するチェックサムを保持する変数キーです。
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:sha224";

  /**
   * ChecksumSha224 の新しいインスタンスを初期化します。
   *
   * @param options オプションです。
   */
  public constructor(options?: ChecksumSha224Options) {
    super("ChecksumSha224", sha224, options);
  }
}
