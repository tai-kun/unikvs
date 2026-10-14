import type { ITransformer } from "@unikvs/core";
import { PassThrough } from "@unikvs/passthrough";

import { InvalidClearBehaviorError, KeyPrefixClearNotSupportedError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
 */
export type KeyPrefixOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
   */
  readonly clearBehavior?: "allow" | "deny" | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
 */
export default class KeyPrefix extends PassThrough implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
   */
  public override readonly name: string = "KeyPrefix";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
   */
  public readonly prefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
   */
  public readonly clearBehavior: "allow" | "deny";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
   */
  public constructor(prefix: string, options?: KeyPrefixOptions) {
    super();

    // undefined のみを既定値にし、null などの不正値は検証で拒否します。
    const raw = options?.clearBehavior;
    const clearBehavior = raw === undefined ? "allow" : raw;
    if (clearBehavior !== "allow" && clearBehavior !== "deny") {
      throw new InvalidClearBehaviorError({ actual: clearBehavior });
    }

    this.prefix = prefix;
    this.clearBehavior = clearBehavior;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
   */
  public mapKey(args: Pick<ITransformer.MapKeyArgs, "key">): string {
    return `${this.prefix}${args.key}`;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
   */
  public onClear(): void {
    // 範囲限定削除を保証できない構成では clear を拒否します。
    if (this.prefix !== "" && this.clearBehavior === "deny") {
      throw new KeyPrefixClearNotSupportedError({
        prefix: this.prefix,
        clearBehavior: this.clearBehavior,
      });
    }
  }
}
