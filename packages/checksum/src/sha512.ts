import { sha512 } from "@noble/hashes/sha2.js";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha512)
 */
export type ChecksumSha512Options = ChecksumOptions;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha512)
 */
export default class ChecksumSha512 extends Checksum {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha512)
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:sha512";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha512)
   */
  public constructor(options?: ChecksumSha512Options) {
    super("ChecksumSha512", sha512, options);
  }
}
