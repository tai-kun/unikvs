import type { IMiddleware } from "@unikvs/core";
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
export default class KeyPrefix extends PassThrough implements IMiddleware {
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
  public mapKey(c: IMiddleware.MapKeyContext): string {
    return `${this.prefix}${c.key}`;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
   */
  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    // 範囲限定削除を保証できない構成では clear を拒否します。
    if (c.action === "clear" && this.prefix !== "" && this.clearBehavior === "deny") {
      throw new KeyPrefixClearNotSupportedError({
        prefix: this.prefix,
        clearBehavior: this.clearBehavior,
      });
    }

    await next();
  }
}
