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
  public readonly name: string = "Superjson";

  public get isOpen(): boolean {
    return true;
  }

  public async encode(
    c: IMiddleware.EncodeContext<unknown, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    assertSupportedValue(c.source);

    c.destination = encoder.encode(stringify(c.source));

    await next();
  }

  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, unknown>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(c.source);
    c.destination = parse(text);

    await next();
  }

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

          let newlineIndex = buffer.indexOf(LF);

          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex);

            buffer = buffer.slice(newlineIndex + 1);
            parseLine(line, controller);
            newlineIndex = buffer.indexOf(LF);
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
