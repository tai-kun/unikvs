import { sha256 } from "@noble/hashes/sha2.js";
import type { ITransformer } from "@unikvs/core";

import Checksum from "./checksum.js";

export default class ChecksumSha256 extends Checksum implements ITransformer {
  public static override readonly CHECKSUM_CONTEXT_KEY: string = "@unikvs/checksum:sha256";

  /**
   * ChecksumSha256 の新しいインスタンスを初期化します。
   */
  public constructor() {
    super("ChecksumSha256", sha256);
  }
}
