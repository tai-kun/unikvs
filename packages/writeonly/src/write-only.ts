import { KeyNotFoundError, type IMiddleware } from "@unikvs/core";

import { WriteOnlyClearNotAllowedError, WriteOnlyDeleteNotAllowedError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
 */
export type WriteOnlyOptions = {
  readonly allowDelete?: boolean | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
 */
export default class WriteOnly implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public readonly name: string = "WriteOnly";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public readonly allowDelete: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public constructor(options?: WriteOnlyOptions) {
    this.allowDelete = Boolean(options?.allowDelete);
  }

  public get isOpen(): boolean {
    return true;
  }

  public async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    c.destination = c.source;

    await next();
  }

  public async decode(c: IMiddleware.DecodeContext): Promise<void> {
    throw new KeyNotFoundError({ key: c.key });
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;

    await next();
  }

  public async decodeStream(c: IMiddleware.DecodeStreamContext): Promise<void> {
    throw new KeyNotFoundError({ key: c.key });
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    switch (c.action) {
      case "has":
      case "get":
      case "stream": {
        throw new KeyNotFoundError({ key: c.key });
      }

      case "delete": {
        // 削除が許可されていない場合は delete を拒否します。
        if (!this.allowDelete) {
          throw new WriteOnlyDeleteNotAllowedError({ key: c.key });
        }

        break;
      }

      case "clear": {
        // 削除が許可されていない場合は clear を拒否します。
        if (!this.allowDelete) {
          throw new WriteOnlyClearNotAllowedError();
        }

        break;
      }

      default: {
        break;
      }
    }

    await next();
  }
}
