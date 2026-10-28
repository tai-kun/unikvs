import type { IMiddleware } from "@unikvs/core";
import { createNext, createDecodeContext, createEncodeContext } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Tap, { type TapContext, type TapCallback } from "../src/tap.js";

/**
 * テストで共通して使う何もしないコールバックです。
 */
const noopCallback: TapCallback = () => {};

/**
 * コールバックの呼び出しを記録する Tap を作成します。
 *
 * @returns 作成した Tap と呼び出し記録です。
 */
function createRecordingTap(): {
  readonly tap: Tap;
  readonly calls: TapContext[];
} {
  const calls: TapContext[] = [];
  const tap = new Tap((c) => {
    calls.push(c);
  });

  return {
    tap,
    calls,
  };
}

/**
 * 値をエンコードして出力された値を返します。
 *
 * @param tap 実行する Tap です。
 * @param data エンコードするデータです。
 *
 * @returns エンコード後のデータです。
 */
async function encode(tap: Tap, data: unknown): Promise<unknown> {
  const c = createEncodeContext(data);
  await tap.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * 値をデコードして出力された値を返します。
 *
 * @param tap 実行する Tap です。
 * @param data デコードするデータです。
 *
 * @returns デコード後のデータです。
 */
async function decode(tap: Tap, data: unknown): Promise<unknown> {
  const c = createDecodeContext(data);
  await tap.decode(c as IMiddleware.DecodeContext, createNext());

  return c.destination;
}

describe("初期化と基本属性", () => {
  test("name プロパティは Tap を返す", ({ expect }) => {
    // 準備：
    const tap = new Tap(noopCallback);

    // 実行と検証：
    expect(tap.name).toBe("Tap");
  });

  test("isOpen は常に true を返す", ({ expect }) => {
    // 準備：
    const tap = new Tap(noopCallback);

    // 実行と検証：
    expect(tap.isOpen).toBe(true);
  });

  test("コンストラクターに渡したコールバックを保持する", ({ expect }) => {
    // 準備と実行：
    const tap = new Tap(noopCallback);

    // 検証：
    expect(tap.callback).toBe(noopCallback);
  });
});

describe("コールバックの呼び出し", () => {
  test("encode はコンテキストをコールバックへ渡す", async ({ expect }) => {
    // 準備：
    const { tap, calls } = createRecordingTap();
    const c = createEncodeContext("hello", "key");

    // 実行：
    await tap.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証：
    expect(calls).toStrictEqual([c]);
    expect(calls[0]).toBe(c);

    // コンテキスト経由で操作の情報を参照できます。
    expect(calls[0]?.action).toBe("set");
    expect(calls[0]?.key).toBe("key");
    expect(calls[0]?.source).toBe("hello");
  });

  test("decode はコンテキストをコールバックへ渡す", async ({ expect }) => {
    // 準備：
    const { tap, calls } = createRecordingTap();
    const c = createDecodeContext("hello", "key");

    // 実行：
    await tap.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証：
    expect(calls).toStrictEqual([c]);
    expect(calls[0]).toBe(c);
    expect(calls[0]?.action).toBe("get");
    expect(calls[0]?.key).toBe("key");
    expect(calls[0]?.source).toBe("hello");
  });

  test("コールバックは next より先に呼ばれる", async ({ expect }) => {
    // 準備：
    const order: string[] = [];
    const tap = new Tap(() => {
      order.push("callback");
    });
    const c = createEncodeContext("hello");

    // 実行：
    await tap.encode(c as IMiddleware.EncodeContext, async () => {
      order.push("next");
    });

    // 検証：
    expect(order).toStrictEqual(["callback", "next"]);
  });

  test("非同期コールバックの完了を待ってから next を呼ぶ", async ({ expect }) => {
    // 準備：
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let callbackFinished = false;
    let nextCalled = false;
    const tap = new Tap(async () => {
      await gate;
      callbackFinished = true;
    });
    const c = createEncodeContext("hello");

    // 実行：
    const operation = tap.encode(c as IMiddleware.EncodeContext, async () => {
      nextCalled = true;
    });

    await Promise.resolve();

    // 検証：
    expect(callbackFinished).toBe(false);
    expect(nextCalled).toBe(false);

    release();
    await operation;
    expect(callbackFinished).toBe(true);
    expect(nextCalled).toBe(true);
  });

  test("コールバックが投げた例外をそのまま伝播し next を呼ばない", async ({ expect }) => {
    // 準備：
    const error = new Error("tap failed");
    const tap = new Tap(() => {
      throw error;
    });
    const c = createEncodeContext("hello");
    let nextCalled = false;

    // 実行と検証：
    await expect(
      tap.encode(c as IMiddleware.EncodeContext, async () => {
        nextCalled = true;
      }),
    ).rejects.toBe(error);
    expect(nextCalled).toBe(false);
    expect(c.destination).toBeUndefined();
  });

  test("コールバックが拒否した Promise をそのまま伝播し next を呼ばない", async ({ expect }) => {
    // 準備：
    const error = new Error("async tap failed");
    const tap = new Tap(async () => {
      await Promise.resolve();
      throw error;
    });
    const c = createDecodeContext("hello");
    let nextCalled = false;

    // 実行と検証：
    await expect(
      tap.decode(c as IMiddleware.DecodeContext, async () => {
        nextCalled = true;
      }),
    ).rejects.toBe(error);
    expect(nextCalled).toBe(false);
    expect(c.destination).toBeUndefined();
  });
});

describe("データの透過", () => {
  test("encode は文字列をそのまま返す", async ({ expect }) => {
    // 準備：
    const tap = new Tap(() => {});
    const data = "hello";

    // 実行：
    const output = await encode(tap, data);

    // 検証：
    expect(output).toBe(data);
  });

  test("decode はバイト列をそのまま返す", async ({ expect }) => {
    // 準備：
    const tap = new Tap(() => {});
    const data = new Uint8Array([1, 2, 3]);

    // 実行：
    const output = await decode(tap, data);

    // 検証：
    expect(output).toBe(data);
  });

  test("encode はオブジェクトを同じ参照のまま返す", async ({ expect }) => {
    // 準備：
    const tap = new Tap(() => {});
    const data = { foo: "bar" };

    // 実行：
    const output = await encode(tap, data);

    // 検証：
    expect(output).toBe(data);
  });

  test("decode はオブジェクトを同じ参照のまま返す", async ({ expect }) => {
    // 準備：
    const tap = new Tap(() => {});
    const data = { foo: "bar" };

    // 実行：
    const output = await decode(tap, data);

    // 検証：
    expect(output).toBe(data);
  });

  test("コールバックが destination を変更しても入力をそのまま返す", async ({ expect }) => {
    // 準備：
    const tap = new Tap((c) => {
      (c as IMiddleware.EncodeContext).destination = "tampered";
    });
    const data = "original";

    // 実行：
    const output = await encode(tap, data);

    // 検証：
    expect(output).toBe(data);
  });

  test("コールバックが変数を変更すると next から参照できる", async ({ expect }) => {
    // 準備：
    const tap = new Tap((c) => {
      c.set("tap:called", true);
    });
    const c = createEncodeContext("hello");
    let observed: unknown;

    // 実行：
    await tap.encode(c as IMiddleware.EncodeContext, async () => {
      observed = c.get("tap:called");
    });

    // 検証：
    expect(observed).toBe(true);
  });
});
