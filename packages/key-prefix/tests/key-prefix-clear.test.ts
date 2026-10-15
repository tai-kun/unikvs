import type { IMiddleware, IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createClearContext,
  createHasContext,
  createNext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { KeyPrefixClearNotSupportedError } from "../src/errors.js";
import KeyPrefix from "../src/key-prefix.js";
import { createPrefixedKvs } from "./_helpers.js";

describe("use による clear の挙動", () => {
  test("プレフィックスが非空で clearBehavior が allow のとき、next に委譲する", async ({
    expect,
  }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:", { clearBehavior: "allow" });
    let called = false;

    // 実行
    await prefix.use(createClearContext() as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証
    expect(called).toBe(true);
  });

  test("プレフィックスが非空で clearBehavior が deny のとき、KeyPrefixClearNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:", { clearBehavior: "deny" });

    // 実行
    const error = await captureRejection(
      prefix.use(createClearContext() as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyPrefixClearNotSupportedError);
    expect((error as KeyPrefixClearNotSupportedError).meta).toStrictEqual({
      prefix: "tenant:",
      clearBehavior: "deny",
    });
  });

  test("clear 以外の操作では next に委譲する", async ({ expect }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:", { clearBehavior: "deny" });
    let called = false;

    // 実行
    await prefix.use(createSetContext("k1") as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証
    expect(called).toBe(true);
  });

  test("name は KeyPrefixClearNotSupportedError である", async ({ expect }) => {
    // 実行
    const error = await captureRejection(
      new KeyPrefix("t:", { clearBehavior: "deny" }).use(
        createClearContext() as IMiddleware.UseContext,
        createNext(),
      ),
    );

    // 検証
    expect((error as KeyPrefixClearNotSupportedError).name).toBe("KeyPrefixClearNotSupportedError");
  });

  test("プレフィックスが空文字で clearBehavior が deny のとき、next に委譲する", async ({
    expect,
  }) => {
    // 準備
    const prefix = new KeyPrefix("", { clearBehavior: "deny" });
    let called = false;

    // 実行
    await prefix.use(createClearContext() as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証
    expect(called).toBe(true);
  });

  test("プレフィックスが空文字で clearBehavior が allow のとき、next に委譲する", async ({
    expect,
  }) => {
    // 準備
    const prefix = new KeyPrefix("", { clearBehavior: "allow" });
    let called = false;

    // 実行
    await prefix.use(createClearContext() as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証
    expect(called).toBe(true);
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
    expect(storage.exists(createHasContext("tenant:k1") as IStorage.ExistsContext)).toBe(true);
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
    expect(storage.exists(createHasContext("tenant:k1") as IStorage.ExistsContext)).toBe(false);
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
