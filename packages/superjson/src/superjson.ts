import type { IMiddleware } from "@unikvs/core";
import { parse, stringify } from "superjson";

import { SuperjsonUnsupportedValueError } from "./errors.js";

/**
 * 行区切りに使用する改行文字 (LF) です。
 */
const LF = "\n";

/**
 * CRLF 行区切りの復帰文字 (CR) です。
 */
const CR = "\r";

/**
 * 文字列を UTF-8 のバイト列へ変換するエンコーダーです。
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
 * ルートの値が SuperJSON で扱えない型ならエラーを投げます。
 *
 * SuperJSON は関数やシンボルをエラーにせず `"{}"` へ落とすため、データの消失を防ぐために事前に拒否します。
 *
 * @param value 検査する値です。
 */
function assertSupportedValue(value: unknown): void {
  const type = typeof value;

  if (type === "function" || type === "symbol") {
    throw new SuperjsonUnsupportedValueError({ type });
  }
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
  const text = line.endsWith(CR) ? line.slice(0, -1) : line;

  if (text.length > 0) {
    controller.enqueue(parse(text));
  }
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson#usage)
 */
export default class Superjson implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson#usage)
   */
  public readonly name: string = "Superjson";

  /**
   * 常に利用可能であることを表します。
   *
   * @returns 常に true を返します。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * 値を SuperJSON 文字列のバイト列へ変換します。
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
    assertSupportedValue(c.source);

    c.destination = encoder.encode(stringify(c.source));

    await next();
  }

  /**
   * SuperJSON 文字列のバイト列を値へ戻します。
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
    const text = batchDecoder.decode(c.source);
    c.destination = parse(text);

    await next();
  }

  /**
   * 値のストリームを JSON Lines 形式のバイト列ストリームへ変換します。
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
          assertSupportedValue(chunk);
          controller.enqueue(encoder.encode(`${stringify(chunk)}${LF}`));
        },
      }),
    );

    await next();
  }

  /**
   * JSON Lines 形式のバイト列ストリームを値のストリームへ戻します。
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
          // マルチバイト文字がチャンク境界で分断されてもよいように、ストリームモードでデコードします。
          buffer += decoder.decode(chunk, { stream: true });

          let start = 0;
          let newlineIndex = buffer.indexOf(LF);

          while (newlineIndex !== -1) {
            parseLine(buffer.slice(start, newlineIndex), controller);
            start = newlineIndex + 1;
            newlineIndex = buffer.indexOf(LF, start);
          }

          // 改行を含まない残余だけを次回へ持ち越します。
          if (start > 0) {
            buffer = buffer.slice(start);
          }
        },

        flush(controller): void {
          // 末尾に改行がない場合は、残ったバッファーを最後の 1 行として処理します。
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
