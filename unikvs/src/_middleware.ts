import type { IMiddleware } from "@unikvs/core";

import { isReadableStream } from "./_streams.js";
import {
  DecodableStreamNotSupportedError,
  EncodableStreamNotSupportedError,
  MiddlewareIsNotOpenError,
} from "./errors.js";

/**
 * 同じオブジェクトに対して同じ `UniKvsMiddleware` インスタンスを返すためのメモです。
 */
const memoizedMap = /*#__PURE__*/ new WeakMap<IMiddleware, UniKvsMiddleware>();

/**
 * 新形式の `IMiddleware` を `UniKvs` 内部から扱うためのラッパーです。
 *
 * ライフサイクルの多重実行を避けるため、`open`/`close` の管理状態を保持します。
 * `encode`/`decode`/`encodeStream`/`decodeStream`/`use`/`mapKey` は新 Context 方式で委譲し、`isOpen` 違反や未対応ストリームを検出します。
 */
export default class UniKvsMiddleware {
  public static from(middleware: IMiddleware): UniKvsMiddleware {
    let memoized = memoizedMap.get(middleware);
    if (!memoized) {
      memoized = new UniKvsMiddleware(middleware);
      memoizedMap.set(middleware, memoized);
    }

    return memoized;
  }

  readonly #mw: IMiddleware;

  #managed: boolean;

  public constructor(mw: IMiddleware) {
    this.#mw = mw;
    this.#managed = false;
  }

  public get name(): string {
    return this.#mw.name;
  }

  public get raw(): IMiddleware {
    return this.#mw;
  }

  public async open(c: IMiddleware.OpenContext): Promise<void> {
    if (typeof this.#mw.open !== "function") {
      return;
    }

    if (!this.#mw.isOpen) {
      this.#managed = true;

      await this.#mw.open(c);
    }
  }

  public async close(c: IMiddleware.CloseContext): Promise<void> {
    if (typeof this.#mw.close !== "function") {
      return;
    }

    if (this.#mw.isOpen && this.#managed) {
      await this.#mw.close(c);
    }
  }

  public mapKey(c: IMiddleware.MapKeyContext): string {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.#mw.name });
    }

    if (typeof this.#mw.mapKey !== "function") {
      return c.key;
    }

    return this.#mw.mapKey(c);
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.#mw.name });
    }

    if (typeof this.#mw.use !== "function") {
      await next();
      return;
    }

    await this.#mw.use(c, next);
  }

  public async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.#mw.name });
    }

    if (typeof this.#mw.encode !== "function") {
      c.destination = c.source;

      await next();

      return;
    }

    await this.#mw.encode(c, next);
  }

  public async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.#mw.name });
    }

    if (typeof this.#mw.decode !== "function") {
      c.destination = c.source;

      await next();

      return;
    }

    await this.#mw.decode(c, next);
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.#mw.name });
    }

    if (typeof this.#mw.encodeStream !== "function") {
      throw new EncodableStreamNotSupportedError({ name: this.#mw.name });
    }

    await this.#mw.encodeStream(c, next);

    if (!isReadableStream(c.destination)) {
      throw new EncodableStreamNotSupportedError({ name: this.#mw.name });
    }
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.#mw.name });
    }

    if (typeof this.#mw.decodeStream !== "function") {
      throw new DecodableStreamNotSupportedError({ name: this.#mw.name });
    }

    await this.#mw.decodeStream(c, next);

    if (!isReadableStream(c.destination)) {
      throw new DecodableStreamNotSupportedError({ name: this.#mw.name });
    }
  }
}
