import { describe, test } from "vitest";

import toValueStream from "../src/_to-value-stream.js";

describe("toValueStream", () => {
  test("ReadableStream から ValueStream を生成し、非同期イテレーターで値を取得できる", async ({
    expect,
  }) => {
    // 準備
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(1);
        controller.enqueue(2);
        controller.enqueue(3);
        controller.close();
      },
    });
    let disposed = false;

    // 実行
    const stream = toValueStream(readable, async () => {
      disposed = true;
    });

    // 検証
    const results: number[] = [];
    for await (const value of stream) {
      results.push(value);
    }
    expect(results).toStrictEqual([1, 2, 3]);
    expect(disposed).toBe(true);
  });

  test("dispose メソッドでストリームを破棄できる", async ({ expect }) => {
    // 準備
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(1);
        controller.enqueue(2);
        controller.close();
      },
    });
    let disposed = false;

    // 実行
    const stream = toValueStream(readable, async () => {
      disposed = true;
    });
    await stream.dispose();

    // 検証
    expect(disposed).toBe(true);
  });

  test("Symbol.asyncDispose でストリームを破棄できる", async ({ expect }) => {
    // 準備
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(1);
        controller.close();
      },
    });
    let disposed = false;

    // 実行
    const stream = toValueStream(readable, async () => {
      disposed = true;
    });
    await stream[Symbol.asyncDispose]();

    // 検証
    expect(disposed).toBe(true);
  });

  test("空のストリームのとき、イテレーターで値を取得しない", async ({ expect }) => {
    // 準備
    const readable = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    // 実行
    const stream = toValueStream(readable, async () => {});
    const results: unknown[] = [];
    for await (const value of stream) {
      results.push(value);
    }

    // 検証
    expect(results).toStrictEqual([]);
  });

  test("リーダーをキャンセルするとストリームが破棄される", async ({ expect }) => {
    // 準備
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(1);
        controller.enqueue(2);
      },
    });
    let disposed = false;
    const stream = toValueStream(readable, async () => {
      disposed = true;
    });

    // 実行
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    // 検証
    expect(disposed).toBe(true);
  });

  test("非同期イテレーションを途中で break するとストリームが破棄される", async ({ expect }) => {
    // 準備
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(1);
        controller.enqueue(2);
      },
    });
    let disposed = false;
    const stream = toValueStream(readable, async () => {
      disposed = true;
    });

    // 実行と検証
    for await (const _value of stream) {
      break;
    }
    expect(disposed).toBe(true);
  });

  test("ソースのストリームがエラーした場合もストリームが破棄される", async ({ expect }) => {
    // 準備
    const error = new Error("boom");
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(1);
        controller.error(error);
      },
    });
    let disposed = false;
    const stream = toValueStream(readable, async () => {
      disposed = true;
    });

    // 実行と検証
    await expect(async () => {
      for await (const _value of stream) {
        // エラーが発生するまで読み取ります。
      }
    }).rejects.toThrow(error);
    expect(disposed).toBe(true);
  });
});
