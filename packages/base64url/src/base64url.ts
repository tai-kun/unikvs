// oxlint-disable unicorn/number-literal-case
import type { IMiddleware } from "@unikvs/core";
import { defaultUtf8Decoder, defaultUtf8Encoder } from "@unikvs/utils";
import type { FastUtf8 } from "fast-utf8";

import { Base64UrlDecodeError, Base64UrlInvalidPaddingError } from "./errors.js";

// base64url の alphabet です。
// RFC 4648 §5 の 64 文字であり、標準 base64 の `+` と `/` を含みません。
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// alphabet の検査用正規表現です。
// `=` を含まない省略形のみに合致します。
const UNPADDED_PATTERN = /^[A-Za-z0-9\-_]*$/u;

// alphabet と `=` 配置の検査用正規表現です。
// `=` は末尾の 1 文字から 2 文字にのみ現れます。
const PADDED_PATTERN = /^[A-Za-z0-9\-_]*={1,2}$/u;

// 文字コードから 6 ビット値へ変換する参照表です。
// 検証済みの入力のみを通すため、不正文字の検査は行いません。
const DECODE_TABLE: number[] = Array.from({ length: 128 }, () => 0);

for (let index = 0; index < BASE64URL_ALPHABET.length; index++) {
  DECODE_TABLE[BASE64URL_ALPHABET.charCodeAt(index)] = index;
}

/**
 * バイト列を base64url 文字列へ変換します。
 *
 * @param data 変換するバイト列です。
 * @param padding `=` を付与するかどうかです。
 *
 * @returns 変換した base64url 文字列を返します。
 */
function base64UrlEncodeText(data: Uint8Array, padding: boolean): string {
  // 3 バイト単位の完全な量子を 4 文字へ変換し、末尾の剰余は `=` 方針に従って処理します。
  let text = "";
  const fullLength = data.length - (data.length % 3);

  for (let index = 0; index < fullLength; index += 3) {
    const triple =
      ((data[index] ?? 0) << 16) | ((data[index + 1] ?? 0) << 8) | (data[index + 2] ?? 0);
    text += BASE64URL_ALPHABET.charAt((triple >> 18) & 63);
    text += BASE64URL_ALPHABET.charAt((triple >> 12) & 63);
    text += BASE64URL_ALPHABET.charAt((triple >> 6) & 63);
    text += BASE64URL_ALPHABET.charAt(triple & 63);
  }

  const rest = data.length - fullLength;

  // 1 バイトの剰余は 2 文字へ変換し、付与時は `==` を足します。
  if (rest === 1) {
    const single = (data[fullLength] ?? 0) << 16;
    text += BASE64URL_ALPHABET.charAt((single >> 18) & 63);
    text += BASE64URL_ALPHABET.charAt((single >> 12) & 63);

    if (padding) {
      text += "==";
    }
  } else if (rest === 2) {
    // 2 バイトの剰余は 3 文字へ変換し、付与時は `=` を足します。
    const double = ((data[fullLength] ?? 0) << 16) | ((data[fullLength + 1] ?? 0) << 8);
    text += BASE64URL_ALPHABET.charAt((double >> 18) & 63);
    text += BASE64URL_ALPHABET.charAt((double >> 12) & 63);
    text += BASE64URL_ALPHABET.charAt((double >> 6) & 63);

    if (padding) {
      text += "=";
    }
  }

  return text;
}

/**
 * 4 文字境界に整列した base64url 文字列をバイト列へ変換します。
 *
 * @param text 変換する 4 の倍数長の文字列です。
 *
 * @returns 変換したバイト列を返します。
 */
function decodeAligned(text: string): Uint8Array<ArrayBuffer> {
  // 4 文字を 3 バイトへ復元し、未使用下位ビットは検査せず受理します。
  const output = new Uint8Array((text.length / 4) * 3);
  let offset = 0;

  for (let index = 0; index < text.length; index += 4) {
    const quad =
      ((DECODE_TABLE[text.charCodeAt(index)] ?? 0) << 18) |
      ((DECODE_TABLE[text.charCodeAt(index + 1)] ?? 0) << 12) |
      ((DECODE_TABLE[text.charCodeAt(index + 2)] ?? 0) << 6) |
      (DECODE_TABLE[text.charCodeAt(index + 3)] ?? 0);
    output[offset++] = (quad >> 16) & 0xff;
    output[offset++] = (quad >> 8) & 0xff;
    output[offset++] = quad & 0xff;
  }

  return output;
}

/**
 * 空でない base64url 文字列を検査してバイト列へ変換します。
 *
 * @param text 変換する空でない文字列です。
 *
 * @returns 変換したバイト列を返します。
 */
function decodeChecked(text: string): Uint8Array<ArrayBuffer> {
  // `=` の有無で検査を分け、誤配置と `length % 4 === 1` は拒否します。
  let body: string;
  let padCount: number;

  if (text.includes("=")) {
    if (!PADDED_PATTERN.test(text) || text.length % 4 !== 0) {
      throw new Base64UrlDecodeError();
    }

    padCount = text.endsWith("==") ? 2 : 1;
    body = text.slice(0, text.length - padCount);
  } else {
    if (!UNPADDED_PATTERN.test(text)) {
      throw new Base64UrlDecodeError();
    }

    if (text.length % 4 === 1) {
      throw new Base64UrlDecodeError();
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
      ((DECODE_TABLE[body.charCodeAt(index)] ?? 0) << 18) |
      ((DECODE_TABLE[body.charCodeAt(index + 1)] ?? 0) << 12) |
      ((DECODE_TABLE[body.charCodeAt(index + 2)] ?? 0) << 6) |
      (DECODE_TABLE[body.charCodeAt(index + 3)] ?? 0);
    output[offset++] = (quad >> 16) & 0xff;
    output[offset++] = (quad >> 8) & 0xff;
    output[offset++] = quad & 0xff;
  }

  const rest = body.length - prefixLength;

  // 末尾量子の未使用下位ビットは検査せず受理します。
  if (rest === 2) {
    const tail =
      ((DECODE_TABLE[body.charCodeAt(prefixLength)] ?? 0) << 18) |
      ((DECODE_TABLE[body.charCodeAt(prefixLength + 1)] ?? 0) << 12);
    output[offset++] = (tail >> 16) & 0xff;
  } else if (rest === 3) {
    const tail =
      ((DECODE_TABLE[body.charCodeAt(prefixLength)] ?? 0) << 18) |
      ((DECODE_TABLE[body.charCodeAt(prefixLength + 1)] ?? 0) << 12) |
      ((DECODE_TABLE[body.charCodeAt(prefixLength + 2)] ?? 0) << 6);
    output[offset++] = (tail >> 16) & 0xff;
    output[offset++] = (tail >> 8) & 0xff;
  }

  return output;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#usage)
 */
export type Base64UrlOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#base64url-encoder)
   */
  readonly encoder?: FastUtf8 | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#base64url-decoder)
   */
  readonly decoder?: FastUtf8 | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#base64url-padding)
   */
  readonly padding?: boolean | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#usage)
 */
export default class Base64Url implements IMiddleware {
  public readonly name: string = "Base64Url";

  /**
   * エンコードに使い回す実体です。
   */
  readonly #encoder: FastUtf8;

  /**
   * 一括デコードに使い回す実体です。
   */
  readonly #decoder: FastUtf8;

  /**
   * エンコード時に `=` を付与するかどうかです。
   */
  readonly #padding: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#usage)
   */
  public constructor(options: Base64UrlOptions = {}) {
    const { decoder = defaultUtf8Decoder, encoder = defaultUtf8Encoder, padding = false } = options;

    if (typeof padding !== "boolean") {
      throw new Base64UrlInvalidPaddingError({ actual: padding });
    }

    this.#encoder = encoder;
    this.#decoder = decoder;
    this.#padding = padding;
  }

  public get isOpen(): boolean {
    return true;
  }

  public async encode(
    c: IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = this.#encoder.encode(base64UrlEncodeText(c.source, this.#padding));

    await next();
  }

  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const text = this.#decoder.decode(c.source);

    if (text.length === 0) {
      c.destination = new Uint8Array(0);
    } else {
      c.destination = decodeChecked(text);
    }

    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const encoder = this.#encoder;
    const padding = this.#padding;
    let carry = new Uint8Array(0);
    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform: (chunk, controller): void => {
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
              encoder.encode(base64UrlEncodeText(combined.subarray(0, completeLength), padding)),
            );
          }

          if (combined.byteLength % 3 !== 0) {
            carry = combined.slice(combined.byteLength - (combined.byteLength % 3));
          }
        },

        flush: (controller): void => {
          // 余りが残っていれば 2 文字から 3 文字に変換して確定します。
          if (carry.byteLength === 0) {
            return;
          }

          const text = base64UrlEncodeText(carry, padding);

          carry = new Uint8Array(0);
          controller.enqueue(encoder.encode(text));
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
    // 設計の const strict 中間変数と同義のインラインであり、hex と同形です。
    // 同一実体を使い回すと TextDecoder の途中状態が混ざるため共有しません。
    // ignoreBOM:true 注入時は引き継がないため BOM 単体 [0xEF, 0xBB, 0xBF] は一括 Base64UrlDecodeError・ストリーム空成功に分岐します。
    const utf8 = this.#decoder.clone({ ignoreBOM: false });
    let carry = "";
    let paddedTail = "";
    let seenPadding = false;
    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform: (chunk, controller): void => {
          if (chunk.byteLength === 0) {
            return;
          }

          // チャンク境界で分割されたマルチバイト前半のみの場合は何もせず待機します。
          const text = utf8.decode(chunk, { stream: true });

          if (text.length === 0) {
            return;
          }

          // `=` 検出後はラン内分割の継続か後続追加かを区別します。
          if (seenPadding) {
            const candidate = paddedTail + text;

            if (PADDED_PATTERN.test(candidate)) {
              paddedTail = candidate;

              return;
            }

            throw new Base64UrlDecodeError();
          }

          const combined = carry + text;

          carry = "";

          if (!combined.includes("=")) {
            if (!UNPADDED_PATTERN.test(combined)) {
              throw new Base64UrlDecodeError();
            }

            // 先頭の 4 文字境界までを復元し、余りは次回に持ち越します。
            const alignedLength = combined.length - (combined.length % 4);

            if (alignedLength > 0) {
              controller.enqueue(decodeAligned(combined.slice(0, alignedLength)));
            }

            carry = combined.slice(alignedLength);
          } else {
            if (!PADDED_PATTERN.test(combined)) {
              throw new Base64UrlDecodeError();
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

        flush: (controller): void => {
          // 終端の decode は切り詰めたマルチバイトがあれば TypeError を投げ、そうでなければ空文字を返します。
          const rest = utf8.decode(new Uint8Array(0));
          const tail = (seenPadding ? paddedTail : carry) + rest;

          carry = "";
          paddedTail = "";

          // 正常な入力では carry/paddedTail も rest も空のため tail は空であり、残りがある場合は終端検査で復元します。
          if (tail.length === 0) {
            return;
          }

          controller.enqueue(decodeChecked(tail));
        },
      }),
    );

    await next();
  }
}
