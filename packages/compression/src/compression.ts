import type { ITransformer } from "@unikvs/core";
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
export default class Compression implements ITransformer {
  /**
   * 使用する圧縮アルゴリズムの形式です。
   */
  private readonly format: CompressionFormat;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#usage)
   */
  public constructor(format: CompressionFormat) {
    this.name = "Compression";
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
    args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    return await this.#process(args, CompressionStream);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#usage)
   */
  public async decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    return await this.#process(args, DecompressionStream);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#streams)
   */
  public getEncodable(): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    return new CompressionStream(this.format);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/compression#streams)
   */
  public getDecodable(): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    return new DecompressionStream(this.format);
  }

  /**
   * データの変換処理をストリーム API を介して実行します。
   *
   * @param args 変換対象のデータです。
   * @param Stream 使用する変換ストリームのコンストラクターです。CompressionStream または DecompressionStream を指定します。
   * @returns 変換後のバイナリデータを返します。
   */
  async #process(
    args: { data: Uint8Array<ArrayBuffer> },
    Stream: {
      new (
        format: CompressionFormat,
      ): ReadableWritablePair<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
    },
  ) {
    const data = toReadableStream([args.data]);
    const comp = new Stream(this.format);
    const body = data.pipeThrough(comp);
    const buff = await new Response(body).arrayBuffer();
    const view = new Uint8Array(buff);

    return view;
  }
}
