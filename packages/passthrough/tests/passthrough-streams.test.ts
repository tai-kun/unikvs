import type { IMiddleware } from "@unikvs/core";
import {
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test as vitest } from "vitest";

import PassThrough from "../src/passthrough.js";

const test = vitest.extend<{ passthrough: PassThrough }>({
  // oxlint-disable-next-line no-empty-pattern
  async passthrough({}, use) {
    await use(new PassThrough());
  },
});

const STREAM_METHODS = ["encodeStream", "decodeStream"] as const;

type StreamMethod = (typeof STREAM_METHODS)[number];

/**
 * 指定した方向のストリーム変換を適用し、出力側の ReadableStream を返します。
 * 両方向の透過とエラー伝播を同じ手順で検証するために使用します。
 */
async function through(
  passthrough: PassThrough,
  method: StreamMethod,
  source: ReadableStream<unknown>,
): Promise<ReadableStream<unknown>> {
  if (method === "encodeStream") {
    const c = createEncodeStreamContext(source);
    await passthrough.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());

    return c.destination as ReadableStream<unknown>;
  }

  const c = createDecodeStreamContext(source);
  await passthrough.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

  return c.destination as ReadableStream<unknown>;
}

/**
 * 指定したチャンク列を変換して出力されたチャンクを順に返します。
 * チャンクの参照・順序・境界が保存されることの検証に使用します。
 */
async function collectThrough<T>(
  passthrough: PassThrough,
  method: StreamMethod,
  chunks: readonly T[],
): Promise<T[]> {
  const destination = await through(passthrough, method, sourceFrom(chunks));

  return readAll(destination as ReadableStream<T>);
}

describe("チャンクの透過", () => {
  test("encodeStream は型の異なるチャンクを参照と順序を保って出力する", async ({
    expect,
    passthrough,
  }) => {
    // 準備
    const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }, 42, null];

    // 実行
    const output = await collectThrough(passthrough, "encodeStream", chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("decodeStream は型の異なるチャンクを参照と順序を保って出力する", async ({
    expect,
    passthrough,
  }) => {
    // 準備
    const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }, 42, null];

    // 実行
    const output = await collectThrough(passthrough, "decodeStream", chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("encodeStream は 1 個のチャンクを同一参照で出力する", async ({ expect, passthrough }) => {
    // 準備
    const chunk = new Uint8Array([1, 2, 3]);

    // 実行
    const output = await collectThrough(passthrough, "encodeStream", [chunk]);

    // 検証
    expect(output).toHaveLength(1);
    expect(output[0]).toBe(chunk);
  });

  test("decodeStream は 1 個のチャンクを同一参照で出力する", async ({ expect, passthrough }) => {
    // 準備
    const chunk = new Uint8Array([1, 2, 3]);

    // 実行
    const output = await collectThrough(passthrough, "decodeStream", [chunk]);

    // 検証
    expect(output).toHaveLength(1);
    expect(output[0]).toBe(chunk);
  });

  test("encodeStream は 100 個のチャンクを順序と境界を保って出力する", async ({
    expect,
    passthrough,
  }) => {
    // 準備
    const chunks = Array.from({ length: 100 }, (_, index) => new Uint8Array([index]));

    // 実行
    const output = await collectThrough(passthrough, "encodeStream", chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
      expect(chunk).toHaveLength(1);
    }
  });

  test("decodeStream は 100 個のチャンクを順序と境界を保って出力する", async ({
    expect,
    passthrough,
  }) => {
    // 準備
    const chunks = Array.from({ length: 100 }, (_, index) => index);

    // 実行
    const output = await collectThrough(passthrough, "decodeStream", chunks);

    // 検証
    expect(output).toStrictEqual(chunks);
  });
});

describe("ストリームのエラー伝播", () => {
  for (const method of STREAM_METHODS) {
    test(`${method} は上流のエラーを下流の read に伝える`, async ({ expect, passthrough }) => {
      // 準備
      let sourceController!: ReadableStreamDefaultController<string>;
      const error = new Error("upstream failure");
      const source = new ReadableStream<string>({
        start(controller) {
          sourceController = controller;
          controller.enqueue("first");
        },
      });
      const destination = await through(passthrough, method, source);
      const reader = (destination as ReadableStream<string>).getReader();

      // 実行
      const first = await reader.read();
      sourceController.error(error);

      // 検証
      expect(first.value).toBe("first");
      await expect(reader.read()).rejects.toBe(error);
    });

    test(`${method} は上流の中断を下流の read に伝える`, async ({ expect, passthrough }) => {
      // 準備
      let sourceController!: ReadableStreamDefaultController<string>;
      const source = new ReadableStream<string>({
        start(controller) {
          sourceController = controller;
          controller.enqueue("first");
        },
      });
      const destination = await through(passthrough, method, source);
      const reader = destination.getReader();
      await reader.read();

      // 実行
      const reason = new Error("upstream abort");
      sourceController.error(reason);

      // 検証
      await expect(reader.read()).rejects.toBe(reason);
    });

    test(`${method} は下流の cancel を上流の cancel に伝える`, async ({ expect, passthrough }) => {
      // 準備
      const cancelReasons: unknown[] = [];
      const source = new ReadableStream<string>({
        start(controller) {
          controller.enqueue("first");
          controller.enqueue("second");
        },
        cancel(reason) {
          cancelReasons.push(reason);
        },
      });
      const destination = await through(passthrough, method, source);
      const reader = destination.getReader();
      await reader.read();

      // 実行
      const reason = new Error("downstream cancel");
      await reader.cancel(reason);
      // キャンセルは非同期に上流へ伝播するため、伝播の完了を待ちます。
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      // 検証
      expect(cancelReasons).toStrictEqual([reason]);
    });

    test(`${method} は下流の cancel 後は読み取りが終了する`, async ({ expect, passthrough }) => {
      // 準備
      const destination = await through(passthrough, method, sourceFrom(["first"]));
      const reader = destination.getReader();
      await reader.read();

      // 実行
      const reason = new Error("downstream cancel");
      await reader.cancel(reason);

      // 検証
      await expect(reader.read()).resolves.toStrictEqual({ done: true, value: undefined });
    });
  }
});

describe("バックプレッシャー", () => {
  for (const method of STREAM_METHODS) {
    test(`${method} は consumer が読むまで producer を待たせる`, async ({
      expect,
      passthrough,
    }) => {
      // 準備
      let sourceController!: ReadableStreamDefaultController<string>;
      const source = new ReadableStream<string>({
        start(controller) {
          sourceController = controller;
        },
      });
      const destination = await through(passthrough, method, source);
      const reader = destination.getReader();
      let settled = false;
      const pending = reader.read().then((result) => {
        settled = true;
        return result;
      });

      // 実行
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      // 検証: 上流が流すまで下流の読み取りは解決しない。
      expect(settled).toBe(false);

      // 後片付け
      sourceController.enqueue("first");
      sourceController.close();
      expect((await pending).value).toBe("first");
      expect(settled).toBe(true);
    });
  }
});

describe("インスタンスとストリームの独立性", () => {
  test("別インスタンスのストリームはデータを共有しない", async ({ expect }) => {
    // 準備
    const first = new PassThrough();
    const second = new PassThrough();

    // 実行
    const firstOutput = await collectThrough(first, "encodeStream", ["first"]);
    const secondOutput = await collectThrough(second, "encodeStream", ["second"]);

    // 検証
    expect(firstOutput).toStrictEqual(["first"]);
    expect(secondOutput).toStrictEqual(["second"]);
  });

  test("encodeStream は呼び出しごとに独立したストリームを返す", async ({ expect, passthrough }) => {
    // 準備
    const firstDestination = await through(passthrough, "encodeStream", sourceFrom(["first"]));
    const secondDestination = await through(passthrough, "encodeStream", sourceFrom(["second"]));

    // 実行
    const firstOutput = await readAll(firstDestination as ReadableStream<string>);
    const secondOutput = await readAll(secondDestination as ReadableStream<string>);

    // 検証
    expect(firstDestination).not.toBe(secondDestination);
    expect(firstOutput).toStrictEqual(["first"]);
    expect(secondOutput).toStrictEqual(["second"]);
  });

  test("encodeStream と decodeStream は互いに干渉しない", async ({ expect, passthrough }) => {
    // 準備と実行
    const encoded = await collectThrough(passthrough, "encodeStream", [new Uint8Array([1])]);
    const decoded = await collectThrough(passthrough, "decodeStream", [new Uint8Array([2])]);

    // 検証
    expect(encoded[0]).toStrictEqual(new Uint8Array([1]));
    expect(decoded[0]).toStrictEqual(new Uint8Array([2]));
  });
});

describe("トランスフォーマーの状態", () => {
  test("encode・decode・ストリームを使用しても isOpen は true のまま", async ({
    expect,
    passthrough,
  }) => {
    // 準備と実行
    const encodeContext = createEncodeContext("value");
    await passthrough.encode(encodeContext as IMiddleware.EncodeContext, createNext());
    const decodeContext = createDecodeContext("value");
    await passthrough.decode(decodeContext as IMiddleware.DecodeContext, createNext());
    await collectThrough(passthrough, "encodeStream", ["chunk"]);
    await collectThrough(passthrough, "decodeStream", ["chunk"]);

    // 検証
    expect(passthrough.isOpen).toBe(true);
  });
});
