import { sha384 } from "@noble/hashes/sha2.js";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha384)
 */
export type ChecksumSha384Options = ChecksumOptions;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha384)
 */
export default class ChecksumSha384 extends Checksum {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha384)
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:sha384";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha384)
   */
  public constructor(options?: ChecksumSha384Options) {
    super("ChecksumSha384", sha384, options);
  }
}
