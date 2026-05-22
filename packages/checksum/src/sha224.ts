import { sha224 } from "@noble/hashes/sha2.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * {@link ChecksumSha224} のオプションです。
 */
export type ChecksumSha224Options = ChecksumOptions;

export default class ChecksumSha224 extends Checksum implements ITransformer {
  public static override readonly CHECKSUM_CONTEXT_KEY: string = "@unikvs/checksum:sha224";

  /**
   * ChecksumSha224 の新しいインスタンスを初期化します。
   */
  public constructor(options?: ChecksumSha224Options) {
    super("ChecksumSha224", sha224, options);
  }
}
