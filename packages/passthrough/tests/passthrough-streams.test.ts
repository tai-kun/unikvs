import { describe, test as vitest } from "vitest";

import PassThrough from "../src/passthrough.js";
import { collectChunks } from "./_helpers.js";

const test = vitest.extend<{ passthrough: PassThrough }>({
  // oxlint-disable-next-line no-empty-pattern
  async passthrough({}, use) {
    await use(new PassThrough());
  },
});

const STREAM_METHODS = ["getEncodable", "getDecodable"] as const;

describe("チャンクの透過", () => {
  test("getEncodable は型の異なるチャンクを参照と順序を保って出力する", async ({
    expect,
    passthrough,
  }) => {
    // 準備
    const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }, 42, null];

    // 実行
    const output = await collectChunks(passthrough.getEncodable(), chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("getDecodable は型の異なるチャンクを参照と順序を保って出力する", async ({
    expect,
    passthrough,
  }) => {
    // 準備
    const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }, 42, null];

    // 実行
    const output = await collectChunks(passthrough.getDecodable(), chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("getEncodable は 1 個のチャンクを同一参照で出力する", async ({ expect, passthrough }) => {
    // 準備
    const chunk = new Uint8Array([1, 2, 3]);

    // 実行
    const output = await collectChunks(passthrough.getEncodable(), [chunk]);

    // 検証
    expect(output).toHaveLength(1);
    expect(output[0]).toBe(chunk);
  });

  test("getDecodable は 1 個のチャンクを同一参照で出力する", async ({ expect, passthrough }) => {
    // 準備
    const chunk = new Uint8Array([1, 2, 3]);

    // 実行
    const output = await collectChunks(passthrough.getDecodable(), [chunk]);

    // 検証
    expect(output).toHaveLength(1);
    expect(output[0]).toBe(chunk);
  });

  test("getEncodable は 100 個のチャンクを順序と境界を保って出力する", async ({
    expect,
    passthrough,
  }) => {
    // 準備
    const chunks = Array.from({ length: 100 }, (_, index) => new Uint8Array([index]));

    // 実行
    const output = await collectChunks(passthrough.getEncodable(), chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
      expect(chunk).toHaveLength(1);
    }
  });

  test("getDecodable は 100 個のチャンクを順序と境界を保って出力する", async ({
    expect,
    passthrough,
  }) => {
    // 準備
    const chunks = Array.from({ length: 100 }, (_, index) => index);

    // 実行
    const output = await collectChunks(passthrough.getDecodable(), chunks);

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
      const stream = passthrough[method]();
      const pipeResult = source.pipeTo(stream.writable).then(
        () => undefined,
        (reason: unknown) => reason,
      );
      const reader = stream.readable.getReader();

      // 実行
      const first = await reader.read();
      sourceController.error(error);
      const readReason = await reader.read().then(
        () => undefined,
        (reason: unknown) => reason,
      );

      // 検証
      expect(first.value).toBe("first");
      expect(readReason).toBe(error);
      expect(await pipeResult).toBe(error);
    });

    test(`${method} は writer の abort を下流の read に伝える`, async ({ expect, passthrough }) => {
      // 準備
      const stream = passthrough[method]();
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      const firstWrite = writer.write("chunk");
      await reader.read();
      await firstWrite;

      // 実行
      const reason = new Error("writer abort");
      await writer.abort(reason);

      // 検証
      await expect(reader.read()).rejects.toBe(reason);
      await expect(writer.closed).rejects.toBe(reason);
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
      const stream = passthrough[method]();
      const pipeResult = source.pipeTo(stream.writable).then(
        () => undefined,
        (reason: unknown) => reason,
      );
      const reader = stream.readable.getReader();
      await reader.read();

      // 実行
      const reason = new Error("downstream cancel");
      await reader.cancel(reason);
      await pipeResult;

      // 検証
      expect(cancelReasons).toStrictEqual([reason]);
    });

    test(`${method} は下流の cancel 後に書き込みを拒否する`, async ({ expect, passthrough }) => {
      // 準備
      const stream = passthrough[method]();
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      const firstWrite = writer.write("first");
      await reader.read();
      await firstWrite;

      // 実行
      const reason = new Error("downstream cancel");
      await reader.cancel(reason);

      // 検証
      await expect(writer.write("second")).rejects.toBe(reason);
      await expect(writer.closed).rejects.toBe(reason);
    });
  }
});

describe("バックプレッシャー", () => {
  for (const method of STREAM_METHODS) {
    test(`${method} は consumer が読むまで producer の write を待たせる`, async ({
      expect,
      passthrough,
    }) => {
      // 準備
      const stream = passthrough[method]();
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      let firstWriteSettled = false;
      const firstWrite = writer.write("first").then(() => {
        firstWriteSettled = true;
      });

      // 実行
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      // 検証
      expect(firstWriteSettled).toBe(false);
      expect(writer.desiredSize).toBeLessThanOrEqual(0);

      // 後片付け
      await reader.read();
      await firstWrite;
      expect(firstWriteSettled).toBe(true);
    });
  }
});

describe("インスタンスとストリームの独立性", () => {
  test("別インスタンスのストリームはデータを共有しない", async ({ expect }) => {
    // 準備
    const first = new PassThrough();
    const second = new PassThrough();

    // 実行
    const firstOutput = await collectChunks(first.getEncodable(), ["first"]);
    const secondOutput = await collectChunks(second.getEncodable(), ["second"]);

    // 検証
    expect(firstOutput).toStrictEqual(["first"]);
    expect(secondOutput).toStrictEqual(["second"]);
  });

  test("getEncodable は呼び出しごとに独立したストリームを返す", async ({ expect, passthrough }) => {
    // 準備
    const firstStream = passthrough.getEncodable();
    const secondStream = passthrough.getEncodable();

    // 実行
    const firstOutput = await collectChunks(firstStream, ["first"]);
    const secondOutput = await collectChunks(secondStream, ["second"]);

    // 検証
    expect(firstStream).not.toBe(secondStream);
    expect(firstOutput).toStrictEqual(["first"]);
    expect(secondOutput).toStrictEqual(["second"]);
  });

  test("getEncodable と getDecodable は互いに干渉しない", async ({ expect, passthrough }) => {
    // 準備と実行
    const encoded = await collectChunks(passthrough.getEncodable(), [new Uint8Array([1])]);
    const decoded = await collectChunks(passthrough.getDecodable(), [new Uint8Array([2])]);

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
    passthrough.encode({ data: "value" });
    passthrough.decode({ data: "value" });
    await collectChunks(passthrough.getEncodable(), ["chunk"]);
    await collectChunks(passthrough.getDecodable(), ["chunk"]);

    // 検証
    expect(passthrough.isOpen).toBe(true);
  });
});
