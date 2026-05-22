import { sha256 } from "@noble/hashes/sha2.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * {@link ChecksumSha256} のオプションです。
 */
export type ChecksumSha256Options = ChecksumOptions;

export default class ChecksumSha256 extends Checksum implements ITransformer {
  public static override readonly CHECKSUM_CONTEXT_KEY: string = "@unikvs/checksum:sha256";

  /**
   * ChecksumSha256 の新しいインスタンスを初期化します。
   */
  public constructor(options?: ChecksumSha256Options) {
    super("ChecksumSha256", sha256, options);
  }
}
