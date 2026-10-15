import type { IMiddleware } from "@unikvs/core";
import {
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createMapKeyContext,
  createNext,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import KeyPrefix from "../src/key-prefix.js";

describe("初期化と基本属性", () => {
  test("name は KeyPrefix である", ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:");

    // 実行と検証
    expect(prefix.name).toBe("KeyPrefix");
  });

  test("isOpen は常に true である", ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:");

    // 実行と検証
    expect(prefix.isOpen).toBe(true);
  });

  test("prefix は構築時に指定した値を保持する", ({ expect }) => {
    // 実行と検証
    expect(new KeyPrefix("tenant:").prefix).toBe("tenant:");
    expect(new KeyPrefix("").prefix).toBe("");
  });

  test("allowClear の既定値は false である", ({ expect }) => {
    // 実行と検証
    expect(new KeyPrefix("tenant:").allowClear).toBe(false);
    expect(new KeyPrefix("tenant:", {}).allowClear).toBe(false);
    expect(new KeyPrefix("tenant:", undefined).allowClear).toBe(false);
    expect(new KeyPrefix("tenant:", { allowClear: undefined }).allowClear).toBe(false);
  });

  test("allowClear に true と false を指定できる", ({ expect }) => {
    // 実行と検証
    expect(new KeyPrefix("tenant:", { allowClear: true }).allowClear).toBe(true);
    expect(new KeyPrefix("tenant:", { allowClear: false }).allowClear).toBe(false);
  });
});

describe("コンストラクターの検証", () => {
  test("正規の allowClear を指定したとき、エラーを投げない", ({ expect }) => {
    // 実行と検証
    expect(() => new KeyPrefix("")).not.toThrow();
    expect(() => new KeyPrefix("", {})).not.toThrow();
    expect(() => new KeyPrefix("", { allowClear: undefined })).not.toThrow();
    expect(() => new KeyPrefix("", undefined)).not.toThrow();
    expect(() => new KeyPrefix("", { allowClear: true })).not.toThrow();
    expect(() => new KeyPrefix("", { allowClear: false })).not.toThrow();
  });
});

describe("データの透過", () => {
  test("encode は受け取ったオブジェクトを同じ参照で返す", async ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:");
    const data = { foo: "bar" };

    // 実行
    const c = createEncodeContext(data);
    await prefix.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証
    expect(c.destination).toBe(data);
  });

  test("decode は受け取ったバイト列を同じ参照で返す", async ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:");
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const c = createDecodeContext(data);
    await prefix.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証
    expect(c.destination).toBe(data);
  });

  test("encodeStream はチャンクをそのまま出力する", async ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:");
    const chunks = ["a", "bc", ""];

    // 実行
    const c = createEncodeStreamContext(sourceFrom(chunks));
    await prefix.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());
    const output = await readAll(c.destination);

    // 検証
    expect(output).toStrictEqual(chunks);
  });

  test("decodeStream はチャンクをそのまま出力する", async ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:");
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];

    // 実行
    const c = createDecodeStreamContext(sourceFrom(chunks));
    await prefix.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());
    const output = await readAll(c.destination);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [i, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[i]);
    }
  });
});

describe("キーの写像", () => {
  test("mapKey はキーの先頭にプレフィックスを付与する", ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:");

    // 実行と検証
    expect(prefix.mapKey(createMapKeyContext("k1"))).toBe("tenant:k1");
  });

  test("プレフィックスが空文字のとき、キーをそのまま返す", ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("");

    // 実行と検証
    expect(prefix.mapKey(createMapKeyContext("k1"))).toBe("k1");
  });

  test("二重に適用したとき、登録順にプレフィックスが付与される", ({ expect }) => {
    // 準備
    const outer = new KeyPrefix("a:");
    const inner = new KeyPrefix("b:");

    // 実行
    const mapped = inner.mapKey(createMapKeyContext(outer.mapKey(createMapKeyContext("k1"))));

    // 検証
    expect(mapped).toBe("b:a:k1");
  });
});
