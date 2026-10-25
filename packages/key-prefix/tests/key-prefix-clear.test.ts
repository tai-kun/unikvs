import type { IStorage, IMiddleware } from "@unikvs/core";
import {
  createNext,
  abortedSignal,
  captureRejection,
  createHasContext,
  createSetContext,
  createClearContext,
} from "@unikvs/testing";
import { PluginOperationAggregateError } from "unikvs";
import { test, describe } from "vite-plus/test";

import { KeyPrefixClearDeniedError } from "../src/errors.js";
import KeyPrefix from "../src/key-prefix.js";
import { createPrefixedKvs } from "./_helpers.js";

describe("use による clear の挙動", () => {
  test("プレフィックスが非空で allowClear が既定のとき、next に委譲する", async ({ expect }) => {
    // 準備：
    const prefix = new KeyPrefix("tenant:");
    let called = false;

    // 実行：
    await prefix.use(createClearContext() as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証：
    expect(called).toBe(true);
  });

  test("プレフィックスが非空で allowClear が false のとき、next に委譲する", async ({ expect }) => {
    // 準備：
    const prefix = new KeyPrefix("tenant:", { allowClear: false });
    let called = false;

    // 実行：
    await prefix.use(createClearContext() as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証：
    expect(called).toBe(true);
  });

  test("プレフィックスが非空で allowClear が true のとき、KeyPrefixClearDeniedError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const prefix = new KeyPrefix("tenant:", { allowClear: true });

    // 実行：
    const error = await captureRejection(
      prefix.use(createClearContext() as IMiddleware.UseContext, createNext()),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyPrefixClearDeniedError);
    expect((error as KeyPrefixClearDeniedError).meta).toStrictEqual({
      prefix: "tenant:",
      allowClear: true,
    });
  });

  test("clear 以外の操作では next に委譲する", async ({ expect }) => {
    // 準備：
    const prefix = new KeyPrefix("tenant:", { allowClear: true });
    let called = false;

    // 実行：
    await prefix.use(createSetContext("k1") as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証：
    expect(called).toBe(true);
  });

  test("name は KeyPrefixClearDeniedError である", async ({ expect }) => {
    // 実行：
    const error = await captureRejection(
      new KeyPrefix("t:", { allowClear: true }).use(
        createClearContext() as IMiddleware.UseContext,
        createNext(),
      ),
    );

    // 検証：
    expect((error as KeyPrefixClearDeniedError).name).toBe("KeyPrefixClearDeniedError");
  });

  test("プレフィックスが空文字で allowClear が true のとき、next に委譲する", async ({
    expect,
  }) => {
    // 準備：
    const prefix = new KeyPrefix("", { allowClear: true });
    let called = false;

    // 実行：
    await prefix.use(createClearContext() as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証：
    expect(called).toBe(true);
  });

  test("プレフィックスが空文字で allowClear が false のとき、next に委譲する", async ({
    expect,
  }) => {
    // 準備：
    const prefix = new KeyPrefix("", { allowClear: false });
    let called = false;

    // 実行：
    await prefix.use(createClearContext() as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証：
    expect(called).toBe(true);
  });
});

describe("UniKvs.clear との連動", () => {
  test("allowClear が true のとき、UniKvs.clear が拒否されデータが残る", async ({ expect }) => {
    // 準備：
    const { kvs, storage } = await createPrefixedKvs("tenant:", { allowClear: true });
    await kvs.set("k1", "v1");

    // 実行：
    const error = await captureRejection(kvs.clear());

    // 検証：
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect((error as PluginOperationAggregateError).meta.action).toBe("clear");
    expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);

    const reason = (error as PluginOperationAggregateError).meta.errors[0]?.reason;
    expect(reason).toBeInstanceOf(KeyPrefixClearDeniedError);
    expect((reason as KeyPrefixClearDeniedError).meta).toStrictEqual({
      prefix: "tenant:",
      allowClear: true,
    });

    expect(storage.exists(createHasContext("tenant:k1") as IStorage.ExistsContext)).toBe(true);
    expect(await kvs.get("k1")).toBe("v1");

    // 後片付け。
    await kvs.close();
  });

  test("allowClear が既定のとき、UniKvs.clear が委譲されデータが削除される", async ({ expect }) => {
    // 準備：
    const { kvs, storage } = await createPrefixedKvs("tenant:");
    await kvs.set("k1", "v1");

    // 実行：
    await kvs.clear();

    // 検証：
    expect(storage.exists(createHasContext("tenant:k1") as IStorage.ExistsContext)).toBe(false);
    expect(await kvs.has("k1")).toBe(false);

    // 後片付け。
    await kvs.close();
  });

  test("中断済みシグナルでの clear は中断される", async ({ expect }) => {
    // 準備：
    const { kvs } = await createPrefixedKvs("tenant:");

    // 実行と検証：
    await expect(kvs.clear({ signal: abortedSignal() })).rejects.toThrow();

    // 後片付け。
    await kvs.close();
  });
});
