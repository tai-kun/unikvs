import type { IMiddleware } from "@unikvs/core";
import { PassThrough } from "@unikvs/passthrough";

import { KeyPrefixClearDeniedError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
 */
export type KeyPrefixOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
   */
  readonly allowClear?: boolean | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
 */
export default class KeyPrefix extends PassThrough implements IMiddleware {
  public override readonly name: string = "KeyPrefix";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
   */
  public readonly prefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
   */
  public readonly allowClear: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#usage)
   */
  public constructor(prefix: string, options: KeyPrefixOptions = {}) {
    super();

    const { allowClear = false } = options;

    this.prefix = prefix;
    this.allowClear = allowClear;
  }

  public mapKey(c: IMiddleware.MapKeyContext): string {
    return `${this.prefix}${c.key}`;
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    // 範囲限定削除を保証できない構成では clear を拒否します。
    if (c.action === "clear" && this.prefix !== "" && this.allowClear) {
      throw new KeyPrefixClearDeniedError({
        prefix: this.prefix,
        allowClear: this.allowClear,
      });
    }

    await next();
  }
}
