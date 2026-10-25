import { sha224 } from "@noble/hashes/sha2.js";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha224)
 */
export type ChecksumSha224Options = ChecksumOptions;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha224)
 */
export default class ChecksumSha224 extends Checksum {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha224)
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:sha224";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha224)
   */
  public constructor(options?: ChecksumSha224Options) {
    super("ChecksumSha224", sha224, options);
  }
}
