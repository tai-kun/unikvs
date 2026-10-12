import { Variables } from "@unikvs/core";
import { captureThrown } from "@unikvs/testing";
import { describe, test } from "vitest";

import LruCache from "../src/lru-cache.js";

describe("clone オプション", () => {
  test("clone を省略したとき、structuredClone で複製される", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache();
    await storage.open({ signal });
    const source = { nested: { value: 1 } };

    // 実行
    storage.write({ vars: new Variables(), key: "k1", data: source });
    source.nested.value = 99;

    // 検証
    expect(storage.read({ key: "k1" })).toStrictEqual({ nested: { value: 1 } });
  });

  test("clone に undefined を明示しても structuredClone で複製される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = new LruCache({ clone: undefined });
    await storage.open({ signal });
    const source = new Uint8Array([1, 2, 3]);

    // 実行
    storage.write({ vars: new Variables(), key: "k1", data: source });
    source[0] = 99;

    // 検証
    expect(storage.read({ key: "k1" })).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("clone は書き込み時と読み取り時に呼ばれる", async ({ expect, signal }) => {
    // 準備
    const calls: unknown[] = [];
    const storage = new LruCache({
      clone: <T>(value: T): T => {
        calls.push(value);
        return structuredClone(value);
      },
    });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: new Variables(), key: "k1", data: "v1" });
    storage.read({ key: "k1" });

    // 検証
    expect(calls).toStrictEqual(["v1", "v1"]);
  });

  test("clone の戻り値が保存される", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({
      clone: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
    });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: new Variables(), key: "k1", data: new Date("2024-01-02T03:04:05.678Z") });

    // 検証
    expect(storage.read({ key: "k1" })).toBe("2024-01-02T03:04:05.678Z");
  });

  test("clone が書き込み時に投げたとき、値は保存されない", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({
      clone: <T>(_value: T): T => {
        throw new Error("clone failed");
      },
    });
    await storage.open({ signal });

    // 実行
    const error = captureThrown(() =>
      storage.write({ vars: new Variables(), key: "k1", data: "v1" }),
    );

    // 検証
    expect((error as Error).message).toBe("clone failed");
    expect(storage.exists({ key: "k1" })).toBe(false);
  });

  test("clone が読み取り時に投げたとき、そのエラーが伝播する", async ({ expect, signal }) => {
    // 準備
    let calls = 0;
    const storage = new LruCache({
      clone: <T>(value: T): T => {
        calls += 1;
        if (calls === 2) {
          throw new Error("clone failed");
        }
        return structuredClone(value);
      },
    });
    await storage.open({ signal });
    storage.write({ vars: new Variables(), key: "k1", data: "v1" });

    // 実行
    const error = captureThrown(() => storage.read({ key: "k1" }));

    // 検証
    expect((error as Error).message).toBe("clone failed");
    expect(storage.exists({ key: "k1" })).toBe(true);
  });

  test("ArrayBuffer のビューを保存したとき、ビューの範囲だけが複製される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = new LruCache();
    await storage.open({ signal });
    const buffer = new Uint8Array([0, 1, 2, 3]).buffer;
    const view = new Uint8Array(buffer, 1, 2);

    // 実行
    storage.write({ vars: new Variables(), key: "k1", data: view });

    // 検証
    expect(storage.read({ key: "k1" })).toStrictEqual(new Uint8Array([1, 2]));
  });
});
