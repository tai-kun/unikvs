import { describe, test } from "vitest";

import Memory from "../src/memory.js";

/**
 * 関数を実行して投げられた例外を返します。
 * clone が投げるエラーが呼び出し元へ伝播することを検証するために使用します。
 */
function captureThrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  throw new Error("例外が投げられませんでした");
}

describe("clone オプション", () => {
  test("clone を省略したとき、structuredClone で複製される", ({ expect }) => {
    // 準備
    const storage = new Memory();
    const source = { nested: { value: 1 } };

    // 実行
    storage.write({ key: "k1", data: source });
    source.nested.value = 99;

    // 検証
    expect(storage.read({ key: "k1" })).toStrictEqual({ nested: { value: 1 } });
  });

  test("clone に undefined を明示しても structuredClone で複製される", ({ expect }) => {
    // 準備
    const storage = new Memory({ clone: undefined });
    const source = new Uint8Array([1, 2, 3]);

    // 実行
    storage.write({ key: "k1", data: source });
    source[0] = 99;

    // 検証
    expect(storage.read({ key: "k1" })).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("clone は書き込み時と読み取り時に呼ばれる", ({ expect }) => {
    // 準備
    const calls: unknown[] = [];
    const storage = new Memory({
      clone: <T>(value: T): T => {
        calls.push(value);
        return structuredClone(value);
      },
    });

    // 実行
    storage.write({ key: "k1", data: "v1" });
    storage.read({ key: "k1" });

    // 検証
    expect(calls).toStrictEqual(["v1", "v1"]);
  });

  test("clone の戻り値が保存される", ({ expect }) => {
    // 準備
    const storage = new Memory({
      clone: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
    });

    // 実行
    storage.write({ key: "k1", data: new Date("2024-01-02T03:04:05.678Z") });

    // 検証
    expect(storage.read({ key: "k1" })).toBe("2024-01-02T03:04:05.678Z");
  });

  test("clone が書き込み時に投げたとき、値は保存されない", ({ expect }) => {
    // 準備
    const storage = new Memory({
      clone: <T>(_value: T): T => {
        throw new Error("clone failed");
      },
    });

    // 実行
    const error = captureThrown(() => storage.write({ key: "k1", data: "v1" }));

    // 検証
    expect((error as Error).message).toBe("clone failed");
    expect(storage.exists({ key: "k1" })).toBe(false);
  });

  test("clone が読み取り時に投げたとき、そのエラーが伝播する", ({ expect }) => {
    // 準備
    let calls = 0;
    const storage = new Memory({
      clone: <T>(value: T): T => {
        calls += 1;
        if (calls === 2) {
          throw new Error("clone failed");
        }
        return structuredClone(value);
      },
    });
    storage.write({ key: "k1", data: "v1" });

    // 実行
    const error = captureThrown(() => storage.read({ key: "k1" }));

    // 検証
    expect((error as Error).message).toBe("clone failed");
    expect(storage.exists({ key: "k1" })).toBe(true);
  });
});
