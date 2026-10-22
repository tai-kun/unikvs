import type { IMiddleware } from "@unikvs/core";
import { asyncmux } from "asyncmux";
import { callFnOnce } from "call-fn-once";

import { PluginLifecycle } from "./_plugin-lifecycle.js";
import {
  MiddlewareIsNotOpenError,
  StreamDecodingNotSupportedError,
  StreamEncodingNotSupportedError,
} from "./errors.js";

/**
 * 同じオブジェクトに対して同じ `UniKvsMiddleware` インスタンスを返すためのメモです。
 */
const instances = /*#__PURE__*/ new WeakMap<IMiddleware, UniKvsMiddleware>();

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
    return callFnOnce(instances, middleware, () => new UniKvsMiddleware(middleware));
  }

  /**
   * ラップするミドルウェアです。
   */
  readonly #mw: IMiddleware;

  /**
   * 参照カウントと実 `close` の再試行を管理します。
   */
  readonly #lifecycle: PluginLifecycle<IMiddleware.OpenContext, IMiddleware.CloseContext>;

  /**
   * ミドルウェアの名前です。
   */
  public readonly name: string;

  private constructor(middleware: IMiddleware) {
    this.#mw = middleware;
    this.#lifecycle = new PluginLifecycle(middleware);
    this.name = middleware.name;
  }

  /**
   * ミドルウェアを開きます。
   *
   * @param c オープンコンテキストです。
   */
  @asyncmux
  public async open(c: IMiddleware.OpenContext): Promise<void> {
    await this.#lifecycle.open(c);
  }

  /**
   * ミドルウェアを閉じます。
   *
   * @param c クローズコンテキストです。
   */
  @asyncmux
  public async close(c: IMiddleware.CloseContext): Promise<void> {
    await this.#lifecycle.close(c);
  }

  /**
   * 失敗した実 `close` だけを再試行します。
   *
   * @param c クローズコンテキストです。
   */
  @asyncmux
  public async retryClose(c: IMiddleware.CloseContext): Promise<void> {
    await this.#lifecycle.retryClose(c);
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
  }
}
