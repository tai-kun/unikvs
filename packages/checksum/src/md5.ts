import { md5 } from "@noble/hashes/legacy.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * {@link ChecksumMd5} のオプションです。
 */
export type ChecksumMd5Options = ChecksumOptions;

export default class ChecksumMd5 extends Checksum implements ITransformer {
  public static override readonly CHECKSUM_CONTEXT_KEY: string = "@unikvs/checksum:md5";

  /**
   * ChecksumMd5 の新しいインスタンスを初期化します。
   */
  public constructor(options?: ChecksumMd5Options) {
    super("ChecksumMd5", md5, options);
  }
}
