import type { IMiddleware } from "@unikvs/core";
import { asyncmux } from "asyncmux";

import {
  MiddlewareIsNotOpenError,
  StreamDecodingNotSupportedError,
  StreamEncodingNotSupportedError,
} from "./errors.js";

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
   * `open` した利用者の数です。最初の `open` だけが実際に開き、最後の `close` だけが実際に閉じます。
   * `close` を持たないミドルウェアは閉じられないため数えません。
   */
  #references: number;

  /**
   * 実 `close` に失敗したまま利用者の数が 0 になったかどうかです。
   *
   * このフラグが立っている間は、外部で開かれたミドルウェアではなく、閉じきれていない所有権が残っています。
   * 次の `open` が所有権を引き継ぎ、次の `close` が実 `close` を再試行します。
   */
  #closeFailed: boolean;

  /**
   * ミドルウェアの名前です。
   */
  public readonly name: string;

  private constructor(middleware: IMiddleware) {
    this.#mw = middleware;
    this.#references = 0;
    this.#closeFailed = false;
    this.name = middleware.name;
  }

  /**
   * ミドルウェアを開きます。
   *
   * 同じミドルウェアを共有する利用者のうち、最初の 1 回だけ実際の `open` を呼びます。
   * このラッパーが管理していない、既に外部で開かれているミドルウェアは open/close の対象外にします。
   * 参照が残っていても実体が閉じられているときは、既存の参照を失わずに実 open へフォールバックします。
   * `close` を持たないミドルウェアはこのラッパーから閉じられないため、参照を数えません。
   *
   * @param c オープンコンテキストです。
   */
  @asyncmux
  public async open(c: IMiddleware.OpenContext): Promise<void> {
    const mw = this.#mw;
    if (mw.open === undefined) {
      return;
    }

    // `close` を持たないミドルウェアは開いたままにしかできないため、参照を数えず、既存挙動どおり未 open のときだけ実 open します。
    if (mw.close === undefined) {
      if (mw.isOpen) {
        return;
      }

      await mw.open(c);
      return;
    }

    // このラッパーが管理していない外部の open は対象外です。
    // 直前の close に失敗した所有権 (#closeFailed) がある間は、外部 open とみなしません。
    if (mw.isOpen && this.#references === 0 && !this.#closeFailed) {
      return;
    }

    if (this.#references > 0 || this.#closeFailed) {
      if (mw.isOpen) {
        // 既存の参照を失わずに加算します。close 失敗分の所有権もここで引き継ぎます。
        this.#references += 1;
        this.#closeFailed = false;
        return;
      }

      // 参照があるのに実体が閉じられているときは、実 open にフォールバックし、既存の参照を失わずに加算します。
      await mw.open(c);
      this.#references += 1;
      this.#closeFailed = false;
      return;
    }

    await mw.open(c);
    this.#references += 1;
  }

  /**
   * ミドルウェアを閉じます。
   *
   * 同じミドルウェアを共有する利用者のうち、最後の 1 回だけ実際の `close` を呼びます。
   * 各呼び出しで参照を 1 つ減らし、実 `close` は全参照が解放されたときにだけ呼びます。
   * 実 `close` に失敗したときは所有権を残し、次の `close` で再試行できるようにします。
   * `close` を持たないミドルウェアは open で参照を数えないため、ここでは何もしません。
   * 実 `close` へ渡すコンテキストは最後に閉じる利用者のものであり、最初に開いた利用者の vars/signal は保持しません。
   *
   * @param c クローズコンテキストです。
   */
  @asyncmux
  public async close(c: IMiddleware.CloseContext): Promise<void> {
    if (this.#mw.close === undefined) {
      return;
    }

    if (this.#references === 0 && !this.#closeFailed) {
      // このラッパーが管理していないミドルウェアは閉じません。
      return;
    }

    if (this.#references > 0) {
      this.#references -= 1;
    }

    if (this.#references > 0) {
      // まだ利用者が残っているため、実体は閉じません。
      return;
    }

    if (!this.#mw.isOpen) {
      // 既に外部で閉じられているため、未解放の所有権を解消します。
      this.#closeFailed = false;
      return;
    }

    await this.#closeReal(c);
  }

  /**
   * 失敗した実 `close` だけを再試行します。
   *
   * 通常の `close` と違い参照を減らしません。close 失敗後に新しい `open` が所有権を引き継いでいる場合は何もしません。
   * 実体が既に閉じられているときは失敗状態だけを解消します。
   *
   * @param c クローズコンテキストです。
   */
  @asyncmux
  public async retryClose(c: IMiddleware.CloseContext): Promise<void> {
    if (this.#mw.close === undefined) {
      return;
    }

    // 新しい open が所有権を引き継いでいる場合は、その参照を解放しないよう何もしません。
    if (!this.#closeFailed || this.#references > 0) {
      return;
    }

    if (!this.#mw.isOpen) {
      // 既に外部で閉じられているため、未解放の所有権を解消します。
      this.#closeFailed = false;
      return;
    }

    await this.#closeReal(c);
  }

  /**
   * 実 `close` を実行し、失敗したかどうかを記録します。
   *
   * @param c クローズコンテキストです。
   */
  async #closeReal(c: IMiddleware.CloseContext): Promise<void> {
    const close = this.#mw.close?.bind(this.#mw);
    if (close === undefined) {
      return;
    }

    try {
      await close(c);
      this.#closeFailed = false;
    } catch (ex) {
      // 閉じるのに失敗したときは未解放として記録し、次の close で再試行できるようにします。
      this.#closeFailed = true;
      throw ex;
    }
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
