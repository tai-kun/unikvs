import { md5 } from "@noble/hashes/legacy.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * {@link ChecksumMd5} のオプションです。
 */
export type ChecksumMd5Options = ChecksumOptions;

/**
 * MD5 アルゴリズムを使用してデータの整合性を検証するトランスフォーマーです。
 *
 * コンテキストキー `@unikvs/checksum:md5` に期待するハッシュ値を設定することで検証を行います。
 */
export default class ChecksumMd5 extends Checksum implements ITransformer {
  /**
   * 期待するチェックサムを保持するコンテクストキーです。
   */
  public static override readonly CHECKSUM_CONTEXT_KEY: string = "@unikvs/checksum:md5";

  /**
   * ChecksumMd5 の新しいインスタンスを初期化します。
   *
   * @param options オプションです。
   */
  public constructor(options?: ChecksumMd5Options) {
    super("ChecksumMd5", md5, options);
  }
}
