import { sha1 } from "@noble/hashes/legacy.js";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha1)
 */
export type ChecksumSha1Options = ChecksumOptions;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha1)
 */
export default class ChecksumSha1 extends Checksum {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha1)
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:sha1";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-sha1)
   */
  public constructor(options?: ChecksumSha1Options) {
    super("ChecksumSha1", sha1, options);
  }
}
