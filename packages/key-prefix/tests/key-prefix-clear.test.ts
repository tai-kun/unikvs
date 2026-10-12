import { abortedSignal, captureThrown } from "@unikvs/testing";
import { describe, test } from "vitest";

import { KeyPrefixClearNotSupportedError } from "../src/errors.js";
import KeyPrefix from "../src/key-prefix.js";
import { createPrefixedKvs } from "./_helpers.js";

describe("onClear の挙動", () => {
  test("プレフィックスが非空で clearBehavior が allow のとき、何もしない", ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:", { clearBehavior: "allow" });

    // 実行と検証
    expect(() => prefix.onClear()).not.toThrow();
  });

  test("プレフィックスが非空で clearBehavior が deny のとき、KeyPrefixClearNotSupportedError を投げる", ({
    expect,
  }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:", { clearBehavior: "deny" });

    // 実行
    const error = captureThrown(() => prefix.onClear());

    // 検証
    expect(error).toBeInstanceOf(KeyPrefixClearNotSupportedError);
    expect((error as KeyPrefixClearNotSupportedError).meta).toStrictEqual({
      prefix: "tenant:",
      clearBehavior: "deny",
    });
  });

  test("name は KeyPrefixClearNotSupportedError である", ({ expect }) => {
    // 実行
    const error = captureThrown(() => new KeyPrefix("t:", { clearBehavior: "deny" }).onClear());

    // 検証
    expect((error as KeyPrefixClearNotSupportedError).name).toBe("KeyPrefixClearNotSupportedError");
  });

  test("プレフィックスが空文字で clearBehavior が deny のとき、透過として何もしない", ({
    expect,
  }) => {
    // 準備
    const prefix = new KeyPrefix("", { clearBehavior: "deny" });

    // 実行と検証
    expect(() => prefix.onClear()).not.toThrow();
  });

  test("プレフィックスが空文字で clearBehavior が allow のとき、何もしない", ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("", { clearBehavior: "allow" });

    // 実行と検証
    expect(() => prefix.onClear()).not.toThrow();
  });
});

describe("UniKvs.clear との連動", () => {
  test("clearBehavior が deny のとき、UniKvs.clear が拒否されデータが残る", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createPrefixedKvs("tenant:", { clearBehavior: "deny" });
    await kvs.set("k1", "v1");

    // 実行
    let error: unknown;
    try {
      await kvs.clear();
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(KeyPrefixClearNotSupportedError);
    expect(storage.exists({ key: "tenant:k1" })).toBe(true);
    expect(await kvs.get("k1")).toBe("v1");

    // 後片付け
    await kvs.close();
  });

  test("clearBehavior が allow のとき、UniKvs.clear が委譲されデータが削除される", async ({
    expect,
  }) => {
    // 準備
    const { kvs, storage } = await createPrefixedKvs("tenant:", { clearBehavior: "allow" });
    await kvs.set("k1", "v1");

    // 実行
    await kvs.clear();

    // 検証
    expect(storage.exists({ key: "tenant:k1" })).toBe(false);
    expect(await kvs.has("k1")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("中断済みシグナルでの clear は中断される", async ({ expect }) => {
    // 準備
    const { kvs } = await createPrefixedKvs("tenant:");

    // 実行と検証
    await expect(kvs.clear({ signal: abortedSignal() })).rejects.toThrow();

    // 後片付け
    await kvs.close();
  });
});
