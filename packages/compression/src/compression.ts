import type { ITransformer } from "@unikvs/core";
import { toReadableStream } from "@unikvs/utils";

/**
 * 圧縮形式の型定義です。
 *
 * 実行環境の型定義から有効な文字列を抽出しています。
 */
export type CompressionFormat = Extract<
  ConstructorParameters<typeof CompressionStream>[0],
  Extract<ConstructorParameters<typeof DecompressionStream>[0], string>
>;

/**
 * データの圧縮および解凍を行うトランスフォーマーの実装クラスです。
 *
 * Web 標準の CompressionStream および DecompressionStream を利用します。
 */
export default class Compression implements ITransformer {
  /**
   * 使用する圧縮アルゴリズムの形式です。
   */
  private readonly format: CompressionFormat;

  public readonly name: string;

  /**
   * Compression クラスのインスタンスを初期化します。
   *
   * @param format 使用する圧縮形式を指定します。
   */
  public constructor(format: CompressionFormat) {
    this.name = "Compression";
    this.format = format;
  }

  public get isOpen(): boolean {
    return true;
  }

  public async encode(
    args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    return await this.#process(args, CompressionStream);
  }

  public async decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    return await this.#process(args, DecompressionStream);
  }

  public getEncodable(): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    return new CompressionStream(this.format);
  }

  public getDecodable(): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    return new DecompressionStream(this.format);
  }

  /**
   * データの変換処理をストリーム API を介して実行するプライベートメソッドです。
   *
   * @param args 変換対象のデータです。
   * @param Stream 使用する変換ストリームのクラス（CompressionStream または DecompressionStream）です。
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
