import type { IMiddleware, IReadableStream } from "@unikvs/core";

import { isReadableStream } from "./_streams.js";
import * as v from "./_valibot.js";
import {
  MiddlewareIsNotOpenError,
  StreamDecodingNotSupportedError,
  StreamEncodingNotSupportedError,
  MiddlewareDestinationMissingError,
} from "./errors.js";

/**
 * `ReadableStream` のインターフェースを満たすかを検証するためのスキーマです。
 */
const ReadableStreamSchema = v.custom<IReadableStream>(
  isReadableStream,
  "Expected a ReadableStream",
);

/**
 * 同じオブジェクトに対して同じ `UniKvsMiddleware` インスタンスを返すためのメモです。
 */
const memoizedMap = /*#__PURE__*/ new WeakMap<IMiddleware, UniKvsMiddleware>();

/**
 * `IMiddleware` を `UniKvs` 内部から扱うためのラッパーです。
 *
 * ミドルウェアを安全に使うための検証などの処理が集約されています。
 */
export default class UniKvsMiddleware {
  /**
   * `IMiddleware` から `UniKvs` 内部から扱うためのミドルウェアを作成します。
   *
   * @param middleware 元となるミドルウェアです。
   * @returns 検証などの機能が集約されたミドルウェアです。
   */
  public static from(middleware: IMiddleware): UniKvsMiddleware {
    let memoized = memoizedMap.get(middleware);
    if (!memoized) {
      memoized = new UniKvsMiddleware(middleware);
      memoizedMap.set(middleware, memoized);
    }

    return memoized;
  }

  /**
   * ラップするミドルウェアです。
   */
  readonly #mw: IMiddleware;

  /**
   * `open` で開いたために `close` の管理対象であるかどうかです。
   */
  #managed: boolean;

  /**
   * ミドルウェアの名前です。
   */
  public readonly name: string;

  private constructor(middleware: IMiddleware) {
    this.#mw = middleware;
    this.#managed = false;
    this.name = middleware.name;
  }

  /**
   * ミドルウェアを開きます。
   *
   * @param c オープンコンテキストです。
   */
  public async open(c: IMiddleware.OpenContext): Promise<void> {
    if (this.#mw.open === undefined) {
      return;
    }

    if (this.#mw.isOpen) {
      this.#managed = false;
    } else {
      await this.#mw.open(c);
      this.#managed = true;
    }
  }

  /**
   * ミドルウェアを閉じます。
   *
   * @param c クローズコンテキストです。
   */
  public async close(c: IMiddleware.CloseContext): Promise<void> {
    if (this.#mw.close === undefined) {
      // `this.#mw.close` を実行できません。
    } else if (!this.#managed) {
      // ミドルウェアの open/close 操作をこのラッパーではしません。
    } else if (this.#mw.isOpen) {
      await this.#mw.close(c);
    }

    this.#managed = false; // 初期状態に戻します。
  }

  /**
   * キーを写像します。
   *
   * @param c キー写像コンテキストです。
   * @returns 写像後のキーを返します。
   */
  public mapKey(c: IMiddleware.MapKeyContext): string {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.name });
    }

    if (this.#mw.mapKey === undefined) {
      // 既定ではキーをそのまま似します。
      return c.key;
    } else {
      return this.#mw.mapKey(c);
    }
  }

  /**
   * 任意の操作に割り込みます。
   *
   * @param c 操作コンテキストです。
   * @param next 後段の処理です。
   */
  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.name });
    }

    if (this.#mw.use === undefined) {
      // 既定では後段の処理を実行します。
      await next();
    } else {
      await this.#mw.use(c, next);
    }
  }

  /**
   * データをエンコードします。
   *
   * @param c エンコードコンテキストです。
   * @param next 後段の処理です。
   */
  public async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.name });
    }

    if (this.#mw.encode === undefined) {
      // 既定ではデータを素通りさせます。
      c.destination = c.source;

      await next();
    } else {
      await this.#mw.encode(c, next);
    }

    const hasDestination = "destination" in c;
    if (!hasDestination) {
      throw new MiddlewareDestinationMissingError({
        name: this.name,
        operation: "encode",
      });
    }
  }

  /**
   * データをデコードします。
   *
   * @param c デコードコンテキストです。
   * @param next 後段の処理です。
   */
  public async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.name });
    }

    if (this.#mw.decode === undefined) {
      // 既定ではデータを素通りさせます。
      c.destination = c.source;

      await next();
    } else {
      await this.#mw.decode(c, next);
    }

    const hasDestination = "destination" in c;
    if (!hasDestination) {
      throw new MiddlewareDestinationMissingError({
        name: this.name,
        operation: "decode",
      });
    }
  }

  /**
   * ストリームをエンコードします。
   *
   * @param c エンコードストリームコンテキストです。
   * @param next 後段の処理です。
   */
  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.name });
    }
    if (this.#mw.encodeStream === undefined) {
      throw new StreamEncodingNotSupportedError({ name: this.name });
    }

    await this.#mw.encodeStream(c, next);

    const hasDestination = "destination" in c;
    if (!hasDestination) {
      throw new MiddlewareDestinationMissingError({
        name: this.name,
        operation: "decode",
      });
    }

    // ストリームの場合は destination の型も検証する必要があります。
    c.destination = v.parseOutput(ReadableStreamSchema, c.destination);
  }

  /**
   * ストリームをデコードします。
   *
   * @param c デコードストリームコンテキストです。
   * @param next 後段の処理です。
   */
  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    if (!this.#mw.isOpen) {
      throw new MiddlewareIsNotOpenError({ name: this.name });
    }
    if (this.#mw.decodeStream === undefined) {
      throw new StreamDecodingNotSupportedError({ name: this.name });
    }

    await this.#mw.decodeStream(c, next);

    const hasDestination = "destination" in c;
    if (!hasDestination) {
      throw new MiddlewareDestinationMissingError({
        name: this.name,
        operation: "decode",
      });
    }

    // ストリームの場合は destination の型も検証する必要があります。
    c.destination = v.parseOutput(ReadableStreamSchema, c.destination);
  }
}
