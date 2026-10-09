import type { ITransformer } from "@unikvs/core";
import { bytesToHex } from "@unikvs/utils";
import { FastUtf8 } from "fast-utf8";

import { HexDecodeError } from "./errors.js";

// エンコード用の共有インスタンスです。
// 入力は bytesToHex の出力 (ASCII のみ) のため strict 検証は不要です。
// 注入がない場合の既定値として使います。
const defaultUtf8Encoder = new FastUtf8({
  strict: false,
  allocateSize: 1024,
});

// 一括デコード用の共有インスタンスです。
// 不正な入力は TextDecoder の fatal 相当として TypeError を投げます。
// 注入がない場合の既定値として使います。
const defaultUtf8Decoder = new FastUtf8({ strict: true });

/**
 * 文字コードからニブル値へ変換します。
 *
 * @param code 変換する文字コードです。
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
export default class Hex implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#usage)
   */
  public readonly name: string;

  /**
   * エンコードに使い回す実体です。
   */
  private readonly encoder: FastUtf8;

  /**
   * 一括デコードに使い回す実体です。
   */
  private readonly decoder: FastUtf8;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#usage)
   */
  public constructor(options: HexOptions = {}) {
    this.name = "Hex";
    this.encoder = options.encoder ?? defaultUtf8Encoder;
    this.decoder = options.decoder ?? defaultUtf8Decoder;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#usage)
   */
  public encode(
    args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Uint8Array<ArrayBuffer> {
    return this.encoder.encode(bytesToHex(args.data));
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#usage)
   */
  public decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Uint8Array<ArrayBuffer> {
    const text = this.decoder.decode(args.data);

    if (text.length % 2 === 1) {
      throw new HexDecodeError();
    }

    return hexToBytesStrict(text);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#streams)
   */
  public getEncodable(): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    const encoder = this.encoder;

    return new TransformStream({
      transform(chunk, controller) {
        if (chunk.byteLength === 0) {
          return;
        }

        controller.enqueue(encoder.encode(bytesToHex(chunk)));
      },
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#streams)
   */
  public getDecodable(): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    // 注入された decoder の strict 設定のみを引き継いでストリーム毎に新規作成します。
    // 同一実体を使い回すと TextDecoder の途中状態が混ざるため共有しません。
    // ignoreBOM:true 注入時は引き継がないため BOM単体 [EF BB BF] は一括 HexDecodeError・ストリーム空成功に分岐します。
    const utf8 = new FastUtf8({ strict: this.decoder.strict });
    let carry = "";

    return new TransformStream({
      transform(chunk, controller) {
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

      flush() {
        // 終端の decode は切り詰めたマルチバイトがあれば TypeError を投げ、そうでなければ空文字を返します。
        const combined = carry + utf8.decode(new Uint8Array(0));
        carry = "";

        // carry は最大で 1 文字かつ終端 decode は成功時つねに空文字のため偶数確定分の enqueue は到達不能である。
        // 正常な入力では carry も末尾も空であり、残りがある場合は半端なニブルとして拒否します。
        if (combined.length !== 0) {
          throw new HexDecodeError();
        }
      },
    });
  }
}
