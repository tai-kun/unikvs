import { sha1 } from "@noble/hashes/legacy.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * {@link ChecksumSha1} のオプションです。
 */
export type ChecksumSha1Options = ChecksumOptions;

/**
 * SHA-1 アルゴリズムを使用してデータの整合性を検証するトランスフォーマーです。
 *
 * コンテキストキー `@unikvs/checksum:sha1` に期待するハッシュ値を設定することで検証を行います。
 */
export default class ChecksumSha1 extends Checksum implements ITransformer {
  /** 期待するチェックサムを保持するコンテクストキーです。 */
  public static override readonly CHECKSUM_CONTEXT_KEY: string = "@unikvs/checksum:sha1";

  /**
   * ChecksumSha1 の新しいインスタンスを初期化します。
   *
   * @param options オプションです。
   */
  public constructor(options?: ChecksumSha1Options) {
    super("ChecksumSha1", sha1, options);
  }
}
