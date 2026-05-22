import { sha512 } from "@noble/hashes/sha2.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * {@link ChecksumSha512} のオプションです。
 */
export type ChecksumSha512Options = ChecksumOptions;

export default class ChecksumSha512 extends Checksum implements ITransformer {
  public static override readonly CHECKSUM_CONTEXT_KEY: string = "@unikvs/checksum:sha512";

  /**
   * ChecksumSha512 の新しいインスタンスを初期化します。
   */
  public constructor(options?: ChecksumSha512Options) {
    super("ChecksumSha512", sha512, options);
  }
}
