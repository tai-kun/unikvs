import { sha384 } from "@noble/hashes/sha2.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#classes)
 */
export type ChecksumSha384Options = ChecksumOptions;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#classes)
 */
export default class ChecksumSha384 extends Checksum implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#usage)
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:sha384";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#usage)
   */
  public constructor(options?: ChecksumSha384Options) {
    super("ChecksumSha384", sha384, options);
  }
}
