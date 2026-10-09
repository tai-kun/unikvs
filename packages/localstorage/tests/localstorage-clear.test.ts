import { describe, test as vitest } from "vitest";

import { ClearWithoutPrefixNotAllowedError } from "../src/errors.js";
import LocalStorage from "../src/localstorage.js";
import { abortedSignal, captureThrown, createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとに空のフェイク背後 Storage を提供します。
 * clear の削除範囲を検証するために使用します。
 */
const test = vitest.extend<{ backend: Storage }>({
  // oxlint-disable-next-line no-empty-pattern
  async backend({}, use) {
    await use(createFakeStorage());
  },
});

describe("clear の振る舞い", () => {
  test("prefix 配下のみ消去する", ({ expect, backend }) => {
    // 準備
    const storage = new LocalStorage({ storage: backend });
    storage.write({ key: "k1", data: "v1", vars: {}, signal });
    storage.write({ key: "k2", data: "v2", vars: {}, signal });

    // 実行
    storage.clear({ signal });

    // 検証
    expect(storage.exists({ key: "k1", signal })).toBe(false);
    expect(storage.exists({ key: "k2", signal })).toBe(false);
  });

  test("異なる prefix の値は消去されない", ({ expect, backend }) => {
    // 準備
    const storageA = new LocalStorage({ storage: backend, keyPrefix: "a:" });
    const storageB = new LocalStorage({ storage: backend, keyPrefix: "b:" });
    storageA.write({ key: "k1", data: "va", vars: {}, signal });
    storageB.write({ key: "k1", data: "vb", vars: {}, signal });

    // 実行
    storageA.clear({ signal });

    // 検証
    expect(storageA.exists({ key: "k1", signal })).toBe(false);
    expect(storageB.exists({ key: "k1", signal })).toBe(true);
  });

  test("空 prefix の既定では走査前に拒否する", ({ expect, backend }) => {
    // 準備
    const storage = new LocalStorage({ storage: backend, keyPrefix: "" });
    storage.write({ key: "k1", data: "v1", vars: {}, signal });

    // 実行
    const error = captureThrown(() => storage.clear({ signal }));

    // 検証
    expect(error).toBeInstanceOf(ClearWithoutPrefixNotAllowedError);
    expect(storage.exists({ key: "k1", signal })).toBe(true);
  });

  test("空 prefix でも中断済みならガードが signal より先に評価される", ({ expect, backend }) => {
    // 準備
    const storage = new LocalStorage({ storage: backend, keyPrefix: "" });

    // 実行
    const error = captureThrown(() => storage.clear({ signal: abortedSignal() }));

    // 検証
    expect(error).toBeInstanceOf(ClearWithoutPrefixNotAllowedError);
  });

  test("allowClearWithoutPrefix では prefix 外のキーまで削除される", ({ expect, backend }) => {
    // 準備
    const storage = new LocalStorage({
      storage: backend,
      keyPrefix: "",
      allowClearWithoutPrefix: true,
    });
    backend.setItem("other:k1", "v1");
    storage.write({ key: "k2", data: "v2", vars: {}, signal });

    // 実行
    storage.clear({ signal });

    // 検証
    expect(backend.getItem("other:k1")).toBe(null);
    expect(storage.exists({ key: "k2", signal })).toBe(false);
  });

  test("空の状態で clear を呼んでもエラーにならない", ({ expect, backend }) => {
    // 準備
    const storage = new LocalStorage({ storage: backend });

    // 実行と検証
    expect(() => storage.clear({ signal })).not.toThrow();
  });

  test("key の列挙で null が返っても添字ずれなく完了する", ({ expect }) => {
    // 準備
    const nullKeyBackend = createFakeStorage({ keyAt: () => null });
    nullKeyBackend.setItem("unikvs:k1", "v1");
    const storage = new LocalStorage({ storage: nullKeyBackend });

    // 実行
    storage.clear({ signal });

    // 検証
    expect(nullKeyBackend.getItem("unikvs:k1")).toBe("v1");
  });
});
