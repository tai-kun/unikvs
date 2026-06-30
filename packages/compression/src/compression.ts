import type { ITransformer } from "@unikvs/core";
import { toReadableStream } from "@unikvs/utils";

/**
 * 圧縮アルゴリズムの形式を表す型です。
 *
 * Web 標準の CompressionStream と DecompressionStream の両コンストラクターで受け入れ可能な文字列リテラルのみを抽出しています。
 */
export type CompressionFormat = Extract<
  ConstructorParameters<typeof CompressionStream>[0],
  Extract<ConstructorParameters<typeof DecompressionStream>[0], string>
>;

/**
 * Web 標準の CompressionStream および DecompressionStream をラップし、{@link ITransformer} インターフェースに適合させるトランスフォーマーです。
 *
 * コンストラクターで指定した圧縮形式に従い、バイナリデータの透過的な圧縮と展開を行います。このトランスフォーマーは常にオープン状態であり、明示的な open や close は不要です。
 */
export default class Compression implements ITransformer {
  /**
   * 使用する圧縮アルゴリズムの形式です。
   */
  private readonly format: CompressionFormat;

  /**
   * トランスフォーマーを識別する固定名です。値は常に `"Compression"` です。
   */
  public readonly name: string;

  /**
   * Compression クラスのインスタンスを初期化します。
   *
   * @param format 使用する圧縮アルゴリズムの形式を指定します。
   */
  public constructor(format: CompressionFormat) {
    this.name = "Compression";
    this.format = format;
  }

  /**
   * トランスフォーマーが利用可能な状態かどうかを示します。
   *
   * この実装では常に `true` を返します。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * 指定されたバイナリデータを圧縮します。
   *
   * @param args 圧縮対象のデータを含む引数です。
   * @returns 圧縮されたバイナリデータを返します。
   */
  public async encode(
    args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    return await this.#process(args, CompressionStream);
  }

  /**
   * 指定されたバイナリデータを展開します。
   *
   * @param args 展開対象のデータを含む引数です。
   * @returns 展開されたバイナリデータを返します。
   */
  public async decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    return await this.#process(args, DecompressionStream);
  }

  /**
   * 圧縮用の TransformStream を取得します。
   *
   * @returns コンストラクターで指定された形式で圧縮を行うストリームを返します。
   */
  public getEncodable(): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    return new CompressionStream(this.format);
  }

  /**
   * 展開用の TransformStream を取得します。
   *
   * @returns コンストラクターで指定された形式で展開を行うストリームを返します。
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
