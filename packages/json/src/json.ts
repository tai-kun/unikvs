import type { ITransformer } from "@unikvs/core";

import { JsonUnsupportedValueError } from "./errors.js";

/**
 * 値を 1 つの JSON 文字列へ変換します。
 *
 * JSON.stringify が undefined を返す値は JSON で表現できないため、JsonUnsupportedValueError を投げます。
 *
 * @param value 変換する値です。
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
export default class Json implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#usage)
   */
  public constructor() {
    this.name = "Json";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#usage)
   */
  public encode(args: Pick<ITransformer.EncodeArgs<unknown>, "data">): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(stringify(args.data));
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#usage)
   */
  public decode(args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">): unknown {
    const decoder = new TextDecoder("utf-8", { fatal: true });

    return JSON.parse(decoder.decode(args.data));
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#streams)
   */
  public getEncodable(): TransformStream<unknown, Uint8Array<ArrayBuffer>> {
    const encoder = new TextEncoder();

    return new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(encoder.encode(`${stringify(chunk)}\n`));
      },
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#streams)
   */
  public getDecodable(): TransformStream<Uint8Array<ArrayBuffer>, unknown> {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "";

    return new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          parseLine(line, controller);
          newlineIndex = buffer.indexOf("\n");
        }
      },

      flush(controller) {
        buffer += decoder.decode();

        if (buffer.length > 0) {
          parseLine(buffer, controller);
        }
      },
    });
  }
}
