import type { IMiddleware } from "@unikvs/core";

import { JsonUnsupportedValueError } from "./errors.js";

/**
 * 値を UTF-8 のバイト列へ変換するエンコーダーです。
 */
const encoder = new TextEncoder();

/**
 * 一括デコードに使い回す UTF-8 デコーダーです。
 *
 * ストリームを使わない `decode` は呼び出しごとに内部状態を初期化するため、共有しても安全です。
 * ストリーム用のデコーダーはストリームごとに新規作成します。
 */
const batchDecoder = new TextDecoder("utf-8", { fatal: true });

/**
 * 値を 1 つの JSON 文字列へ変換します。
 *
 * JSON.stringify が undefined を返す値は JSON で表現できないため、JsonUnsupportedValueError を投げます。
 *
 * @param value 変換する値です。
 *
 * @returns JSON 文字列を返します。
 */
function stringify(value: unknown): string {
  const json = JSON.stringify(value);

  if (json === undefined) {
    throw new JsonUnsupportedValueError({ type: typeof value });
  }

  return json;
}

/**
 * JSON Lines の 1 行を解析して値を出力します。
 *
 * 行末の CR を 1 つ取り除き、空行は読み飛ばします。
 *
 * @param line 解析する 1 行です。
 * @param controller ストリームを制御するためのコントローラーです。
 */
function parseLine(line: string, controller: TransformStreamDefaultController<unknown>): void {
  const text = line.endsWith("\r") ? line.slice(0, -1) : line;

  if (text.length > 0) {
    controller.enqueue(JSON.parse(text));
  }
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/json#usage)
 */
export default class Json implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#usage)
   */
  public readonly name: string = "Json";

  /**
   * 常に利用可能であることを表します。
   *
   * @returns 常に true を返します。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * 値を JSON 文字列のバイト列へ変換します。
   *
   * @param c エンコード対象の値を持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換が完了したら解決するプロミスを返します。
   */
  public async encode(
    c: IMiddleware.EncodeContext<unknown, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = encoder.encode(stringify(c.source));

    await next();
  }

  /**
   * JSON 文字列のバイト列を値へ戻します。
   *
   * @param c デコード対象のバイト列を持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換が完了したら解決するプロミスを返します。
   */
  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, unknown>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = JSON.parse(batchDecoder.decode(c.source));

    await next();
  }

  /**
   * 値のストリームを JSON Lines のバイト列ストリームへ変換します。
   *
   * @param c エンコード対象の値ストリームを持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換の設定が完了したら解決するプロミスを返します。
   */
  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<unknown, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform(chunk, controller): void {
          controller.enqueue(encoder.encode(`${stringify(chunk)}\n`));
        },
      }),
    );

    await next();
  }

  /**
   * JSON Lines のバイト列ストリームを値のストリームへ戻します。
   *
   * @param c デコード対象のバイト列ストリームを持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換の設定が完了したら解決するプロミスを返します。
   */
  public async decodeStream(
    c: IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, unknown>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "";
    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform(chunk, controller): void {
          buffer += decoder.decode(chunk, { stream: true });

          let start = 0;
          let newlineIndex = buffer.indexOf("\n");

          while (newlineIndex !== -1) {
            parseLine(buffer.slice(start, newlineIndex), controller);
            start = newlineIndex + 1;
            newlineIndex = buffer.indexOf("\n", start);
          }

          // 改行を含まない残余だけを次回へ持ち越します。
          if (start > 0) {
            buffer = buffer.slice(start);
          }
        },

        flush(controller): void {
          buffer += decoder.decode();

          if (buffer.length > 0) {
            parseLine(buffer, controller);
          }
        },
      }),
    );

    await next();
  }
}
