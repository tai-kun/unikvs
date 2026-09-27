import { sha256 } from "@noble/hashes/sha2.js";
import type { ITransformer } from "@unikvs/core";

import Checksum, { type ChecksumOptions } from "./checksum.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#classes)
 */
export type ChecksumSha256Options = ChecksumOptions;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#classes)
 */
export default class ChecksumSha256 extends Checksum implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#usage)
   */
  public static override readonly CHECKSUM_VAR_NAME: string = "@unikvs/checksum:sha256";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#usage)
   */
  public constructor(options?: ChecksumSha256Options) {
    super("ChecksumSha256", sha256, options);
  }
}
