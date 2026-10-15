import type { IMiddleware } from "@unikvs/core";
import SuperjsonCodec from "superjson";

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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
 */
export default class Superjson implements IMiddleware<
  unknown,
  Uint8Array<ArrayBuffer>,
  unknown,
  Uint8Array<ArrayBuffer>
> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
   */
  public readonly name: string = "Superjson";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
   */
  public async encode(
    c: IMiddleware.EncodeContext<unknown, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    assertSupportedValue(c.source);

    c.destination = encoder.encode(SuperjsonCodec.stringify(c.source));
    await next();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
   */
  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, unknown>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(c.source);

    c.destination = SuperjsonCodec.parse(text);
    await next();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
   */
  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<unknown, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          assertSupportedValue(chunk);
          controller.enqueue(encoder.encode(`${SuperjsonCodec.stringify(chunk)}${LF}`));
        },
      }),
    );
    await next();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
   */
  public async decodeStream(
    c: IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, unknown>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "";

    // 1 行分のテキストを値へ復元して下流へ流します。CRLF の CR を取り除き、空行は無視します。
    const enqueueLine = (
      line: string,
      controller: TransformStreamDefaultController<unknown>,
    ): void => {
      const normalized = line.endsWith(CR) ? line.slice(0, -1) : line;
      if (normalized === "") return;

      controller.enqueue(SuperjsonCodec.parse(normalized));
    };

    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          // マルチバイト文字がチャンク境界で分断されてもよいように、ストリームモードでデコードします。
          buffer += decoder.decode(chunk, { stream: true });

          let newlineIndex = buffer.indexOf(LF);
          while (newlineIndex !== -1) {
            enqueueLine(buffer.slice(0, newlineIndex), controller);
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf(LF);
          }
        },

        flush(controller) {
          // 末尾に改行がない場合は、残ったバッファーを最後の 1 行として処理します。
          buffer += decoder.decode();
          enqueueLine(buffer, controller);
        },
      }),
    );
    await next();
  }
}
