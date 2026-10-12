import { captureThrown, pipeChunks } from "@unikvs/testing";
import { describe, test } from "vitest";

import { InvalidClearBehaviorError } from "../src/errors.js";
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

  test("clearBehavior の既定値は allow である", ({ expect }) => {
    // 実行と検証
    expect(new KeyPrefix("tenant:").clearBehavior).toBe("allow");
    expect(new KeyPrefix("tenant:", {}).clearBehavior).toBe("allow");
    expect(new KeyPrefix("tenant:", undefined).clearBehavior).toBe("allow");
    expect(new KeyPrefix("tenant:", { clearBehavior: undefined }).clearBehavior).toBe("allow");
  });

  test("clearBehavior に allow と deny を指定できる", ({ expect }) => {
    // 実行と検証
    expect(new KeyPrefix("tenant:", { clearBehavior: "deny" }).clearBehavior).toBe("deny");
    expect(new KeyPrefix("tenant:", { clearBehavior: "allow" }).clearBehavior).toBe("allow");
  });
});

describe("コンストラクターの検証", () => {
  test("clearBehavior に不正な文字列を指定したとき、InvalidClearBehaviorError を投げる", ({
    expect,
  }) => {
    // 実行
    const error = captureThrown(
      () => new KeyPrefix("tenant:", { clearBehavior: "alllow" as never }),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidClearBehaviorError);
    expect((error as InvalidClearBehaviorError).meta).toStrictEqual({ actual: "alllow" });
  });

  test("clearBehavior に数値を指定したとき、InvalidClearBehaviorError を投げる", ({ expect }) => {
    // 実行
    const error = captureThrown(() => new KeyPrefix("", { clearBehavior: 123 as never }));

    // 検証
    expect(error).toBeInstanceOf(InvalidClearBehaviorError);
    expect((error as InvalidClearBehaviorError).meta).toStrictEqual({ actual: 123 });
  });

  test("clearBehavior に null を指定したとき、InvalidClearBehaviorError を投げる", ({ expect }) => {
    // 実行
    const error = captureThrown(() => new KeyPrefix("", { clearBehavior: null as never }));

    // 検証
    expect(error).toBeInstanceOf(InvalidClearBehaviorError);
    expect((error as InvalidClearBehaviorError).meta).toStrictEqual({ actual: null });
  });

  test("name は KeyPrefixInvalidClearBehaviorError である", ({ expect }) => {
    // 実行
    const error = captureThrown(() => new KeyPrefix("", { clearBehavior: "deny!" as never }));

    // 検証
    expect((error as InvalidClearBehaviorError).name).toBe("KeyPrefixInvalidClearBehaviorError");
  });

  test("正規の clearBehavior を指定したとき、エラーを投げない", ({ expect }) => {
    // 実行と検証
    expect(() => new KeyPrefix("")).not.toThrow();
    expect(() => new KeyPrefix("", {})).not.toThrow();
    expect(() => new KeyPrefix("", { clearBehavior: undefined })).not.toThrow();
    expect(() => new KeyPrefix("", undefined)).not.toThrow();
    expect(() => new KeyPrefix("", { clearBehavior: "allow" })).not.toThrow();
    expect(() => new KeyPrefix("", { clearBehavior: "deny" })).not.toThrow();
  });
});

describe("データの透過", () => {
  test("encode は受け取ったオブジェクトを同じ参照で返す", ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:");
    const data = { foo: "bar" };

    // 実行
    const output = prefix.encode({ data });

    // 検証
    expect(output).toBe(data);
  });

  test("decode は受け取ったバイト列を同じ参照で返す", ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:");
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const output = prefix.decode({ data });

    // 検証
    expect(output).toBe(data);
  });

  test("getEncodable はチャンクをそのまま出力する", async ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:");
    const chunks = ["a", "bc", ""];

    // 実行
    const output = await pipeChunks(prefix.getEncodable(), chunks);

    // 検証
    expect(output).toStrictEqual(chunks);
  });

  test("getDecodable はチャンクをそのまま出力する", async ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:");
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];

    // 実行
    const output = await pipeChunks(prefix.getDecodable(), chunks);

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
    expect(prefix.mapKey({ key: "k1" })).toBe("tenant:k1");
  });

  test("プレフィックスが空文字のとき、キーをそのまま返す", ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("");

    // 実行と検証
    expect(prefix.mapKey({ key: "k1" })).toBe("k1");
  });

  test("二重に適用したとき、登録順にプレフィックスが付与される", ({ expect }) => {
    // 準備
    const outer = new KeyPrefix("a:");
    const inner = new KeyPrefix("b:");

    // 実行
    const mapped = inner.mapKey({ key: outer.mapKey({ key: "k1" }) });

    // 検証
    expect(mapped).toBe("b:a:k1");
  });
});
