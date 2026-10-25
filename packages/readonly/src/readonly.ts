import { type IMiddleware } from "@unikvs/core";

import {
  ReadOnlySetNotAllowedError,
  ReadOnlyClearNotAllowedError,
  ReadOnlyDeleteNotAllowedError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#usage)
 */
export type ReadOnlyOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#usage)
   */
  readonly allowDelete?: boolean | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#usage)
 */
export default class ReadOnly implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#usage)
   */
  public readonly name: string = "ReadOnly";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#usage)
   */
  public readonly allowDelete: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#usage)
   */
  public constructor(options?: ReadOnlyOptions) {
    this.allowDelete = Boolean(options?.allowDelete);
  }

  public get isOpen(): boolean {
    return true;
  }

  public async encode(c: IMiddleware.EncodeContext, _next: IMiddleware.INext): Promise<void> {
    throw new ReadOnlySetNotAllowedError({ key: c.key });
  }

  public async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    c.destination = c.source;

    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    _next: IMiddleware.INext,
  ): Promise<void> {
    throw new ReadOnlySetNotAllowedError({ key: c.key });
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;

    await next();
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    switch (c.action) {
      case "set": {
        throw new ReadOnlySetNotAllowedError({ key: c.key });
      }

      case "get":
      case "has":
      case "stream": {
        break;
      }

      case "delete": {
        // 削除が許可されていない場合は delete を拒否します。
        if (!this.allowDelete) {
          throw new ReadOnlyDeleteNotAllowedError({ key: c.key });
        }

        break;
      }

      case "clear": {
        // 削除が許可されていない場合は clear を拒否します。
        if (!this.allowDelete) {
          throw new ReadOnlyClearNotAllowedError();
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
