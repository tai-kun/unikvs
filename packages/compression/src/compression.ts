import type { IMiddleware } from "@unikvs/core";
import { toReadableStream } from "@unikvs/utils";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#formats)
 */
export type CompressionFormat = Extract<
  ConstructorParameters<typeof CompressionStream>[0],
  Extract<ConstructorParameters<typeof DecompressionStream>[0], string>
>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#usage)
 */
export default class Compression implements IMiddleware<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
> {
  /**
   * 使用する圧縮アルゴリズムの形式です。
   */
  private readonly format: CompressionFormat;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#usage)
   */
  public readonly name: string = "Compression";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#usage)
   */
  public constructor(format: CompressionFormat) {
    this.format = format;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#usage)
   */
  public async encode(
    c: IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = await this.#process(c.source, CompressionStream);
    await next();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#usage)
   */
  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = await this.#process(c.source, DecompressionStream);
    await next();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#streams)
   */
  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source.pipeThrough(new CompressionStream(this.format));
    await next();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#streams)
   */
  public async decodeStream(
    c: IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source.pipeThrough(new DecompressionStream(this.format));
    await next();
  }

  /**
   * データの変換処理をストリーム API を介して実行します。
   *
   * @param data 変換対象のデータです。
   * @param Stream 使用する変換ストリームのコンストラクターです。CompressionStream または DecompressionStream を指定します。
   * @returns 変換後のバイナリデータを返します。
   */
  async #process(
    data: Uint8Array<ArrayBuffer>,
    Stream: {
      new (
        format: CompressionFormat,
      ): ReadableWritablePair<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
    },
  ) {
    const stream = toReadableStream([data]);
    const comp = new Stream(this.format);
    const body = stream.pipeThrough(comp);
    const buff = await new Response(body).arrayBuffer();
    const view = new Uint8Array(buff);

    return view;
  }
}
