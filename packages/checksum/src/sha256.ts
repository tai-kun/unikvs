import { sha256 } from "@noble/hashes/sha2.js";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha256)
 */
export type ChecksumSha256Options = ChecksumOptions;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha256)
 */
export default class ChecksumSha256 extends Checksum {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha256)
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:sha256";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha256)
   */
  public constructor(options?: ChecksumSha256Options) {
    super("ChecksumSha256", sha256, options);
  }
}
