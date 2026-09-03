import { sha512 } from "@noble/hashes/sha2.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * {@link ChecksumSha512} のオプションです。
 */
export type ChecksumSha512Options = ChecksumOptions;

/**
 * SHA-512 アルゴリズムを使用してデータの整合性を検証するトランスフォーマーです。
 *
 * 変数キー `@unikvs/checksum:sha512` に期待するハッシュ値を設定することで検証を行います。
 */
export default class ChecksumSha512 extends Checksum implements ITransformer {
  /**
   * 期待するチェックサムを保持する変数キーです。
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:sha512";

  /**
   * ChecksumSha512 の新しいインスタンスを初期化します。
   *
   * @param options オプションです。
   */
  public constructor(options?: ChecksumSha512Options) {
    super("ChecksumSha512", sha512, options);
  }
}
