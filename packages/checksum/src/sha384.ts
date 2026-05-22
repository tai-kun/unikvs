import { sha384 } from "@noble/hashes/sha2.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * {@link ChecksumSha384} のオプションです。
 */
export type ChecksumSha384Options = ChecksumOptions;

export default class ChecksumSha384 extends Checksum implements ITransformer {
  public static override readonly CHECKSUM_CONTEXT_KEY: string = "@unikvs/checksum:sha384";

  /**
   * ChecksumSha384 の新しいインスタンスを初期化します。
   */
  public constructor(options?: ChecksumSha384Options) {
    super("ChecksumSha384", sha384, options);
  }
}
