import { md5 } from "@noble/hashes/legacy.js";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-md5)
 */
export type ChecksumMd5Options = ChecksumOptions;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-md5)
 */
export default class ChecksumMd5 extends Checksum {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-md5)
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:md5";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-md5)
   */
  public constructor(options?: ChecksumMd5Options) {
    super("ChecksumMd5", md5, options);
  }
}
