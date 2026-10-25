import type { IMiddleware } from "@unikvs/core";
import { bytesToHex, defaultUtf8Decoder, defaultUtf8Encoder } from "@unikvs/utils";
import type { FastUtf8 } from "fast-utf8";

import { HexDecodeError } from "./errors.js";

/**
 * 文字コードからニブル値へ変換します。
 *
 * @param code 変換する文字コードです。
 *
 * @returns 0 以上 15 以下の値を返します。
 */
function nibbleOrThrow(code: number): number {
  // 0 から 9 の文字コードなら 0 から 9 の値を返します。
  if (code >= 0x30 && code <= 0x39) {
    return code - 0x30;
  }

  // A から F の文字コードなら 10 から 15 の値を返します。
  if (code >= 0x41 && code <= 0x46) {
    return code - 0x41 + 10;
  }

  // a から f の文字コードなら 10 から 15 の値を返します。
  if (code >= 0x61 && code <= 0x66) {
    return code - 0x61 + 10;
  }

  // 上記のいずれにも当てはまらない文字コードは不正な入力として拒否します。
  throw new HexDecodeError();
}

/**
 * 偶数長の 16 進文字列をバイト列へ変換します。
 *
 * @param text 変換する偶数長の文字列です。
 *
 * @returns 変換したバイト列を返します。
 */
function hexToBytesStrict(text: string): Uint8Array<ArrayBuffer> {
  // 出力先は入力の半分の長さで確保し、上位と下位のニブルを結合して格納します。
  const output = new Uint8Array(text.length >> 1);

  for (let index = 0; index < text.length; index += 2) {
    const high = nibbleOrThrow(text.charCodeAt(index));
    const low = nibbleOrThrow(text.charCodeAt(index + 1));
    output[index >> 1] = (high << 4) | low;
  }

  return output;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#usage)
 */
export type HexOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#usage)
   */
  readonly encoder?: FastUtf8 | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#usage)
   */
  readonly decoder?: FastUtf8 | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#usage)
 */
export default class Hex implements IMiddleware {
  public readonly name: string = "Hex";

  /**
   * エンコードに使い回す実体です。
   */
  readonly #encoder: FastUtf8;

  /**
   * 一括デコードに使い回す実体です。
   */
  readonly #decoder: FastUtf8;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#usage)
   */
  public constructor(options: HexOptions = {}) {
    const { decoder = defaultUtf8Decoder, encoder = defaultUtf8Encoder } = options;
    this.#encoder = encoder;
    this.#decoder = decoder;
  }

  public get isOpen(): boolean {
    return true;
  }

  public async encode(
    c: IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = this.#encoder.encode(bytesToHex(c.source));

    await next();
  }

  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const text = this.#decoder.decode(c.source);

    if (text.length % 2 === 1) {
      throw new HexDecodeError();
    }

    c.destination = hexToBytesStrict(text);

    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const encoder = this.#encoder;
    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform: (chunk, controller): void => {
          if (chunk.byteLength === 0) {
            return;
          }

          controller.enqueue(encoder.encode(bytesToHex(chunk)));
        },
      }),
    );

    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    // 注入された decoder の設定を clone で引き継いでストリーム毎に新規作成します (ignoreBOM のみ既定に戻します)。
    // 同一実体を使い回すと TextDecoder の途中状態が混ざるため共有しません。
    // ignoreBOM:true 注入時は引き継がないため BOM 単体 [EF BB BF] は一括 HexDecodeError・ストリーム空成功に分岐します。
    const utf8 = this.#decoder.clone({ ignoreBOM: false });
    let carry = "";
    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform: (chunk, controller): void => {
          const text = utf8.decode(chunk, { stream: true });
          let combined = carry + text;

          carry = "";

          if (combined.length === 0) {
            return;
          }

          if (combined.length % 2 === 1) {
            carry = combined.slice(-1);
            combined = combined.slice(0, -1);
          }

          if (combined.length === 0) {
            return;
          }

          const bytes = hexToBytesStrict(combined);
          controller.enqueue(bytes);
        },

        flush: (): void => {
          // 終端の decode は切り詰めたマルチバイトがあれば TypeError を投げ、そうでなければ空文字を返します。
          const combined = carry + utf8.decode(new Uint8Array(0));

          carry = "";

          // carry は最大で 1 文字かつ終端 decode は成功時つねに空文字のため偶数確定分の enqueue は到達不能である。
          // 正常な入力では carry も末尾も空であり、残りがある場合は半端なニブルとして拒否します。
          if (combined.length !== 0) {
            throw new HexDecodeError();
          }
        },
      }),
    );

    await next();
  }
}
