import type { ITransformer } from "@unikvs/core";
import { FastUtf8 } from "fast-utf8";

import { Base64DecodeError } from "./errors.js";

// エンコード用の共有インスタンスです。
// 入力は base64 alphabet の ASCII のみのため strict 検証は不要です。
// 注入がない場合の既定値として使います。
const defaultUtf8Encoder = new FastUtf8({
  strict: false,
  allocateSize: 1024,
});

// 一括デコード用の共有インスタンスです。
// 不正な入力は TextDecoder の fatal 相当として TypeError を投げます。
// 注入がない場合の既定値として使います。
const defaultUtf8Decoder = new FastUtf8({ strict: true });

// base64 の alphabet です。
// RFC 4648 §4 の 64 文字であり、`+` と `/` を含みます。
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// alphabet の検査用正規表現です。
// `=` を含まない省略形のみに合致します。
const UNPADDED_PATTERN = /^[A-Za-z0-9+\/]*$/;

// alphabet と `=` 配置の検査用正規表現です。
// `=` は末尾の 1 文字から 2 文字にのみ現れます。
const PADDED_PATTERN = /^[A-Za-z0-9+\/]*={1,2}$/;

// 文字コードから 6 ビット値へ変換する参照表です。
// 検証済みの入力のみを通すため、不正文字の検査は行いません。
const DECODE_TABLE: number[] = Array.from({ length: 128 }, () => 0);

for (let index = 0; index < BASE64_ALPHABET.length; index++) {
  DECODE_TABLE[BASE64_ALPHABET.charCodeAt(index)] = index;
}

/**
 * バイト列を base64 文字列へ変換します。
 *
 * @param data 変換するバイト列です。
 * @param padding `=` を付与するかどうかです。
 * @returns 変換した base64 文字列を返します。
 */
function base64EncodeText(data: Uint8Array, padding: boolean): string {
  // 3 バイト単位の完全な量子を 4 文字へ変換し、末尾の剰余は `=` 方針に従って処理します。
  let text = "";
  const fullLength = data.length - (data.length % 3);

  for (let index = 0; index < fullLength; index += 3) {
    const triple = (data[index]! << 16) | (data[index + 1]! << 8) | data[index + 2]!;
    text += BASE64_ALPHABET.charAt((triple >> 18) & 63);
    text += BASE64_ALPHABET.charAt((triple >> 12) & 63);
    text += BASE64_ALPHABET.charAt((triple >> 6) & 63);
    text += BASE64_ALPHABET.charAt(triple & 63);
  }

  const rest = data.length - fullLength;

  // 1 バイトの剰余は 2 文字へ変換し、付与時は `==` を足します。
  if (rest === 1) {
    const single = data[fullLength]! << 16;
    text += BASE64_ALPHABET.charAt((single >> 18) & 63);
    text += BASE64_ALPHABET.charAt((single >> 12) & 63);

    if (padding === true) {
      text += "==";
    }
  } else if (rest === 2) {
    // 2 バイトの剰余は 3 文字へ変換し、付与時は `=` を足します。
    const double = (data[fullLength]! << 16) | (data[fullLength + 1]! << 8);
    text += BASE64_ALPHABET.charAt((double >> 18) & 63);
    text += BASE64_ALPHABET.charAt((double >> 12) & 63);
    text += BASE64_ALPHABET.charAt((double >> 6) & 63);

    if (padding === true) {
      text += "=";
    }
  }

  return text;
}

/**
 * 4 文字境界に整列した base64 文字列をバイト列へ変換します。
 *
 * @param text 変換する 4 の倍数長の文字列です。
 * @returns 変換したバイト列を返します。
 */
function decodeAligned(text: string): Uint8Array<ArrayBuffer> {
  // 4 文字を 3 バイトへ復元し、未使用下位ビットは検査せず受理します。
  const output = new Uint8Array((text.length / 4) * 3);
  let offset = 0;

  for (let index = 0; index < text.length; index += 4) {
    const quad =
      (DECODE_TABLE[text.charCodeAt(index)]! << 18) |
      (DECODE_TABLE[text.charCodeAt(index + 1)]! << 12) |
      (DECODE_TABLE[text.charCodeAt(index + 2)]! << 6) |
      DECODE_TABLE[text.charCodeAt(index + 3)]!;
    output[offset++] = (quad >> 16) & 0xff;
    output[offset++] = (quad >> 8) & 0xff;
    output[offset++] = quad & 0xff;
  }

  return output;
}

/**
 * 空でない base64 文字列を検査してバイト列へ変換します。
 *
 * @param text 変換する空でない文字列です。
 * @returns 変換したバイト列を返します。
 */
function decodeChecked(text: string): Uint8Array<ArrayBuffer> {
  // `=` の有無で検査を分け、誤配置と `length % 4 === 1` は拒否します。
  let body: string;
  let padCount: number;

  if (text.includes("=")) {
    if (!PADDED_PATTERN.test(text) || text.length % 4 !== 0) {
      throw new Base64DecodeError();
    }

    padCount = text.endsWith("==") ? 2 : 1;
    body = text.slice(0, text.length - padCount);
  } else {
    if (!UNPADDED_PATTERN.test(text)) {
      throw new Base64DecodeError();
    }

    if (text.length % 4 === 1) {
      throw new Base64DecodeError();
    }

    padCount = (4 - (text.length % 4)) % 4;
    body = text;
  }

  // 本体とパディングの合計は 4 文字境界であり、余剰バイトを切り捨てて返します。
  const output = new Uint8Array(((body.length + padCount) / 4) * 3 - padCount);
  const prefixLength = body.length - (body.length % 4);
  let offset = 0;

  for (let index = 0; index < prefixLength; index += 4) {
    const quad =
      (DECODE_TABLE[body.charCodeAt(index)]! << 18) |
      (DECODE_TABLE[body.charCodeAt(index + 1)]! << 12) |
      (DECODE_TABLE[body.charCodeAt(index + 2)]! << 6) |
      DECODE_TABLE[body.charCodeAt(index + 3)]!;
    output[offset++] = (quad >> 16) & 0xff;
    output[offset++] = (quad >> 8) & 0xff;
    output[offset++] = quad & 0xff;
  }

  const rest = body.length - prefixLength;

  // 末尾量子の未使用下位ビットは検査せず受理します。
  if (rest === 2) {
    const tail =
      (DECODE_TABLE[body.charCodeAt(prefixLength)]! << 18) |
      (DECODE_TABLE[body.charCodeAt(prefixLength + 1)]! << 12);
    output[offset++] = (tail >> 16) & 0xff;
  } else if (rest === 3) {
    const tail =
      (DECODE_TABLE[body.charCodeAt(prefixLength)]! << 18) |
      (DECODE_TABLE[body.charCodeAt(prefixLength + 1)]! << 12) |
      (DECODE_TABLE[body.charCodeAt(prefixLength + 2)]! << 6);
    output[offset++] = (tail >> 16) & 0xff;
    output[offset++] = (tail >> 8) & 0xff;
  }

  return output;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#usage)
 */
export type Base64Options = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#usage)
   */
  readonly encoder?: FastUtf8 | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#usage)
   */
  readonly decoder?: FastUtf8 | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#usage)
   */
  readonly padding?: boolean | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#usage)
 */
export default class Base64 implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#usage)
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
   * エンコード時に `=` を付与するかどうかです。
   */
  private readonly padding: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#usage)
   */
  public constructor(options: Base64Options = {}) {
    this.name = "Base64";
    this.encoder = options.encoder ?? defaultUtf8Encoder;
    this.decoder = options.decoder ?? defaultUtf8Decoder;
    this.padding = options.padding ?? true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#usage)
   */
  public encode(
    args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Uint8Array<ArrayBuffer> {
    return this.encoder.encode(base64EncodeText(args.data, this.padding));
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#usage)
   */
  public decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Uint8Array<ArrayBuffer> {
    const text = this.decoder.decode(args.data);

    if (text.length === 0) {
      return new Uint8Array(0);
    }

    return decodeChecked(text);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#streams)
   */
  public getEncodable(): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    const encoder = this.encoder;
    const padding = this.padding;
    let carry = new Uint8Array(0);

    return new TransformStream({
      transform(chunk, controller) {
        if (chunk.byteLength === 0) {
          return;
        }

        // 前回の余りと今回の入力を結合し、3 バイト単位の完全分のみ変換します。
        const combined = new Uint8Array(carry.byteLength + chunk.byteLength);
        combined.set(carry, 0);
        combined.set(chunk, carry.byteLength);
        carry = new Uint8Array(0);

        const completeLength = combined.byteLength - (combined.byteLength % 3);

        if (completeLength > 0) {
          controller.enqueue(
            encoder.encode(base64EncodeText(combined.subarray(0, completeLength), padding)),
          );
        }

        if (combined.byteLength % 3 !== 0) {
          carry = combined.slice(combined.byteLength - (combined.byteLength % 3));
        }
      },

      flush(controller) {
        // 余りが残っていれば 2 文字から 3 文字に変換して確定します。
        if (carry.byteLength === 0) {
          return;
        }

        const text = base64EncodeText(carry, padding);
        carry = new Uint8Array(0);
        controller.enqueue(encoder.encode(text));
      },
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#streams)
   */
  public getDecodable(): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    // 注入された decoder の strict 設定のみを引き継いでストリーム毎に新規作成します。
    // 設計の const strict 中間変数と同義のインラインであり、hex と同形です。
    // 同一実体を使い回すと TextDecoder の途中状態が混ざるため共有しません。
    // ignoreBOM:true 注入時は引き継がないため BOM単体 [0xEF, 0xBB, 0xBF] は一括 Base64DecodeError・ストリーム空成功に分岐します。
    const utf8 = new FastUtf8({ strict: this.decoder.strict });
    let carry = "";
    let paddedTail = "";
    let seenPadding = false;

    return new TransformStream({
      transform(chunk, controller) {
        if (chunk.byteLength === 0) {
          return;
        }

        // チャンク境界で分割されたマルチバイト前半のみの場合は何もせず待機します。
        const text = utf8.decode(chunk, { stream: true });

        if (text.length === 0) {
          return;
        }

        // `=` 検出後はラン内分割の継続か後続追加かを区別します。
        if (seenPadding === true) {
          const candidate = paddedTail + text;

          if (PADDED_PATTERN.test(candidate)) {
            paddedTail = candidate;
            return;
          }

          throw new Base64DecodeError();
        }

        const combined = carry + text;
        carry = "";

        if (!combined.includes("=")) {
          if (!UNPADDED_PATTERN.test(combined)) {
            throw new Base64DecodeError();
          }

          // 先頭の 4 文字境界までを復元し、余りは次回に持ち越します。
          const alignedLength = combined.length - (combined.length % 4);

          if (alignedLength > 0) {
            controller.enqueue(decodeAligned(combined.slice(0, alignedLength)));
          }

          carry = combined.slice(alignedLength);
        } else {
          if (!PADDED_PATTERN.test(combined)) {
            throw new Base64DecodeError();
          }

          // `=` を含む末尾量子の復元は flush に委ね、前段の完全分のみ復元します。
          const head = combined.slice(0, combined.indexOf("="));
          const alignedLength = head.length - (head.length % 4);

          if (alignedLength > 0) {
            controller.enqueue(decodeAligned(combined.slice(0, alignedLength)));
          }

          paddedTail = combined.slice(alignedLength);
          seenPadding = true;
        }
      },

      flush(controller) {
        // 終端の decode は切り詰めたマルチバイトがあれば TypeError を投げ、そうでなければ空文字を返します。
        const rest = utf8.decode(new Uint8Array(0));
        const tail = (seenPadding === true ? paddedTail : carry) + rest;
        carry = "";
        paddedTail = "";

        // 正常な入力では carry/paddedTail も rest も空のため tail は空であり、残りがある場合は終端検査で復元します。
        if (tail.length === 0) {
          return;
        }

        controller.enqueue(decodeChecked(tail));
      },
    });
  }
}
