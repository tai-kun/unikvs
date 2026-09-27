import { sha1 } from "@noble/hashes/legacy.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#classes)
 */
export type ChecksumSha1Options = ChecksumOptions;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#classes)
 */
export default class ChecksumSha1 extends Checksum implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#usage)
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:sha1";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#usage)
   */
  public constructor(options?: ChecksumSha1Options) {
    super("ChecksumSha1", sha1, options);
  }
}
