import { sha256 } from "@noble/hashes/sha2.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * {@link ChecksumSha256} のオプションです。
 */
export type ChecksumSha256Options = ChecksumOptions;

/**
 * SHA-256 アルゴリズムを使用してデータの整合性を検証するトランスフォーマーです。
 *
 * コンテキストキー `@unikvs/checksum:sha256` に期待するハッシュ値を設定することで検証を行います。
 */
export default class ChecksumSha256 extends Checksum implements ITransformer {
  /** 期待するチェックサムを保持するコンテクストキーです。 */
  public static override readonly CHECKSUM_CONTEXT_KEY: string = "@unikvs/checksum:sha256";

  /**
   * ChecksumSha256 の新しいインスタンスを初期化します。
   *
   * @param options オプションです。
   */
  public constructor(options?: ChecksumSha256Options) {
    super("ChecksumSha256", sha256, options);
  }
}
