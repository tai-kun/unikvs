import type { IMiddleware } from "@unikvs/core";

import { JsonUnsupportedValueError } from "./errors.js";

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
  public readonly name: string = "Json";

  public get isOpen(): boolean {
    return true;
  }

  public async encode(
    c: IMiddleware.EncodeContext<unknown, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = new TextEncoder().encode(stringify(c.source));

    await next();
  }

  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, unknown>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    c.destination = JSON.parse(decoder.decode(c.source));

    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<unknown, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const encoder = new TextEncoder();
    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform(chunk, controller): void {
          controller.enqueue(encoder.encode(`${stringify(chunk)}\n`));
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
          buffer += decoder.decode(chunk, { stream: true });

          let newlineIndex = buffer.indexOf("\n");

          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex);

            buffer = buffer.slice(newlineIndex + 1);
            parseLine(line, controller);
            newlineIndex = buffer.indexOf("\n");
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
