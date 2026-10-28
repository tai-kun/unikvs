import type { IMiddleware } from "@unikvs/core";

/**
 * `Tap` のコールバックが受け取るコンテキストです。
 *
 * データを扱う 4 つのフックのいずれかです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/tap#tap-context)
 */
export type TapContext =
  | IMiddleware.EncodeContext
  | IMiddleware.DecodeContext
  | IMiddleware.EncodeStreamContext
  | IMiddleware.DecodeStreamContext;

/**
 * データを変換せずに実行するコールバックです。
 *
 * `Promise` を返した場合は完了を待ちます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/tap#tap-callback)
 */
export type TapCallback = (c: TapContext) => void | Promise<void>;

/**
 * データをそのまま透過させながら、コンテキストを受け取るコールバックを実行するミドルウェアです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/tap#tap)
 */
export default class Tap implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/tap#tap)
   */
  public readonly name: string = "Tap";

  /**
   * 各データフックの実行前に呼ばれるコールバックです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/tap#tap-callback)
   */
  public readonly callback: TapCallback;

  /**
   * コールバックを指定してミドルウェアを作成します。
   *
   * @param callback 各データフックの実行前に呼ばれるコールバックです。
   */
  public constructor(callback: TapCallback) {
    this.callback = callback;
  }

  public get isOpen(): boolean {
    return true;
  }

  public async encode<TData>(
    c: IMiddleware.EncodeContext<TData>,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.callback(c);
    c.destination = c.source;

    await next();
  }

  public async decode<TData>(
    c: IMiddleware.DecodeContext<TData>,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.callback(c);
    c.destination = c.source;

    await next();
  }

  public async encodeStream<TChunk>(
    c: IMiddleware.EncodeStreamContext<TChunk>,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.callback(c);
    c.destination = c.source;

    await next();
  }

  public async decodeStream<TChunk>(
    c: IMiddleware.DecodeStreamContext<TChunk>,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.callback(c);
    c.destination = c.source;

    await next();
  }
}
