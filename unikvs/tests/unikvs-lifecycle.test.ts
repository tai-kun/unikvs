import { Memory } from "@unikvs/memory";
import { describe, test } from "vitest";

import {
  PluginOperationAggregateError,
  UniKvsIsNotOpenError,
  UniKvsIsOpenError,
} from "../src/errors.js";
import UniKvs from "../src/unikvs.js";
import type { PlainValue } from "../src/value-schemas.js";
import { FakeStorage, FakeMiddleware, Gate, isPending, withTimeout } from "./_helpers.js";

describe("UniKvs - open の状態遷移", () => {
  test("open 待機中の 2 回目の open は UniKvsIsOpenError を投げる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const entered = new Gate();
    const release = new Gate();
    storage.hook = async (call) => {
      if (call.method === "open") {
        entered.open();
        await release.wait();
      }
    };
    const kvs = UniKvs.config().persist(storage).create();

    // 実行
    const first = kvs.open();
    await entered.wait();
    const second = kvs.open();
    release.open();

    // 検証
    await expect(first).resolves.toBeUndefined();
    await expect(second).rejects.toThrow(UniKvsIsOpenError);
    await expect(kvs.close()).resolves.toBeUndefined();
  });

  test("プラグインの open 完了までは isOpen が false のまま", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const entered = new Gate();
    const release = new Gate();
    storage.hook = async (call) => {
      if (call.method === "open") {
        entered.open();
        await release.wait();
      }
    };
    await using kvs = UniKvs.config().persist(storage).create();

    // 実行
    const pending = kvs.open();
    await entered.wait();

    // 検証
    expect(kvs.isOpen).toBe(false);
    release.open();
    await pending;
    expect(kvs.isOpen).toBe(true);
  });

  test("実行前に abort された signal で open するとストレージを開かずに abort 理由で失敗する", async ({
    expect,
  }) => {
    // 準備
    const reason = new Error("open aborted");
    const storage = new FakeStorage();
    const kvs = UniKvs.config().persist(storage).create();

    // 実行と検証
    await expect(kvs.open({ signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
    expect(kvs.isOpen).toBe(false);
    expect(storage.callsOf("open")).toHaveLength(0);
  });

  test("open → close → open を繰り返しても各プラグインの open/close が対応する", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    const middleware = new FakeMiddleware();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(middleware)
      .persist(storage)
      .create();

    // 実行
    await kvs.open();
    await kvs.close();
    await kvs.open();

    // 検証
    expect(storage.callsOf("open")).toHaveLength(2);
    expect(storage.callsOf("close")).toHaveLength(1);
    expect(middleware.callsOf("open")).toHaveLength(2);
    expect(middleware.callsOf("close")).toHaveLength(1);
    expect(kvs.isOpen).toBe(true);
  });
});

describe("UniKvs - open 失敗時のロールバック", () => {
  test("ミドルウェアの open 失敗でも成功済みのストレージとミドルウェアは close される", async ({
    expect,
  }) => {
    // 準備
    const failure = new Error("middleware open failed");
    const storage = new FakeStorage();
    const okMiddleware = new FakeMiddleware("ok");
    const ngMiddleware = new FakeMiddleware("ng");
    ngMiddleware.errors["open"] = failure;
    const kvs = UniKvs.config()
      .connect(okMiddleware)
      .connect(ngMiddleware)
      .persist(storage)
      .create();

    // 実行と検証
    await expect(kvs.open()).rejects.toThrow(PluginOperationAggregateError);
    expect(kvs.isOpen).toBe(false);
    expect(storage.callsOf("close")).toHaveLength(1);
    expect(okMiddleware.callsOf("close")).toHaveLength(1);
    expect(ngMiddleware.callsOf("close")).toHaveLength(0);
  });

  test("open 失敗後も同じインスタンスで再び open できる", async ({ expect }) => {
    // 準備
    let shouldFail = true;
    const storage = new FakeStorage();
    storage.hook = (call) => {
      if (call.method === "open" && shouldFail) {
        shouldFail = false;
        throw new Error("transient open failure");
      }
    };
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();

    // 実行と検証
    await expect(kvs.open()).rejects.toThrow(PluginOperationAggregateError);
    expect(kvs.isOpen).toBe(false);

    await kvs.open();
    await kvs.set("foo", "value");

    // 検証
    expect(kvs.isOpen).toBe(true);
    expect(storage.map.get("foo")).toBe("value");
  });

  test("open で abort と通常失敗が混在したときは集約エラーに abort 理由も含まれる", async ({
    expect,
  }) => {
    // 準備
    const cancel = new Error("USER-CANCEL");
    const storage = new FakeStorage("ng");
    storage.errors["open"] = new Error("open failed");
    const hangingStorage = new FakeStorage("hanging");
    hangingStorage.hook = async (call) => {
      if (call.method === "open") {
        await new Promise<never>((_, reject) => {
          call.signal?.addEventListener("abort", () => reject(call.signal?.reason), { once: true });
        });
      }
    };
    const kvs = UniKvs.config().persist(storage).persist(hangingStorage).create();
    const controller = new AbortController();

    // 実行
    const pending = kvs.open({ signal: controller.signal });
    await Promise.resolve();
    controller.abort(cancel);

    // 検証
    await expect(pending).rejects.toThrow(PluginOperationAggregateError);
    await expect(pending).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          errors: expect.arrayContaining([expect.objectContaining({ reason: cancel })]),
        }),
      }),
    );
    expect(kvs.isOpen).toBe(false);
  });
});

describe("UniKvs - close の失敗と回復", () => {
  test("close が一時的に失敗しても再 open して操作を継続できる", async ({ expect }) => {
    // 準備
    let shouldFailClose = true;
    const storage = new FakeStorage();
    storage.hook = (call) => {
      if (call.method === "close" && shouldFailClose) {
        shouldFailClose = false;
        throw new Error("transient close failure");
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行と検証
    await expect(kvs.close()).rejects.toThrow(PluginOperationAggregateError);
    expect(kvs.isOpen).toBe(false);

    // 実行
    await kvs.open();
    await kvs.set("foo", "value");

    // 検証
    await expect(kvs.get("foo")).resolves.toBe("value");

    // 後片付け
    await kvs.close();
  });

  test("close の signal が実行前に abort されていても一貫して閉じた状態になる", async ({
    expect,
  }) => {
    // 準備
    const reason = new Error("close aborted");
    const storage = new FakeStorage();
    const kvs = UniKvs.config().persist(storage).create();
    await kvs.open();

    // 実行と検証
    await expect(kvs.close({ signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
    expect(kvs.isOpen).toBe(false);
    await expect(kvs.set("foo", "value")).rejects.toThrow(UniKvsIsNotOpenError);
  });

  test("close の signal が abort しても retry は新しい signal で実 close を完了する", async ({
    expect,
  }) => {
    // 準備: abort 済み signal では close が失敗するストレージ
    const storage = new FakeStorage("abort-sensitive");
    const entered = new Gate();
    const release = new Gate();
    storage.hook = async (call) => {
      if (call.method === "close") {
        entered.open();
        await release.wait();
        call.signal?.throwIfAborted();
      }
    };
    const reason = new Error("close aborted");
    const ac = new AbortController();
    const kvs = UniKvs.config().persist(storage).create();
    await kvs.open();

    // 実行: close を保留中に signal を abort し、通常 close を失敗させる
    const closing = kvs.close({ signal: ac.signal });
    await entered.wait();
    ac.abort(reason);
    release.open();

    // 検証: close は集約エラーで失敗する
    await expect(closing).rejects.toThrow(PluginOperationAggregateError);
    await expect(closing).rejects.toMatchObject({ meta: { action: "close" } });
    await expect(closing).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          errors: [expect.objectContaining({ reason })],
        }),
      }),
    );

    // 検証: retry は新しい signal で実 close を完了し、実体は閉じられる
    expect(storage.isOpen).toBe(false);
    expect(kvs.isOpen).toBe(false);
    expect(storage.callsOf("close")).toHaveLength(2);
  });

  test("close を 2 回呼ぶと 2 回目は UniKvsIsNotOpenError を投げる", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config().persist(new FakeStorage()).create();
    await kvs.open();

    // 実行
    await kvs.close();

    // 検証
    expect(kvs.isOpen).toBe(false);
    await expect(kvs.close()).rejects.toThrow(UniKvsIsNotOpenError);
  });

  test("open 中に close すると開き終えたプラグインは close される", async ({ expect }) => {
    // 準備
    const okStorage = new FakeStorage("ok");
    const hangingStorage = new FakeStorage("hanging");
    const entered = new Gate();
    hangingStorage.hook = async (call) => {
      if (call.method === "open") {
        entered.open();
        await new Promise<never>((_, reject) => {
          call.signal?.addEventListener("abort", () => reject(call.signal?.reason), { once: true });
        });
      }
    };
    const kvs = UniKvs.config().persist(okStorage).persist(hangingStorage).create();

    // 実行
    const openPending = kvs.open();
    await entered.wait();
    const closePending = kvs.close();

    // 検証
    await expect(openPending).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(closePending).rejects.toThrow();
    expect(kvs.isOpen).toBe(false);
    expect(okStorage.callsOf("close").length).toBeGreaterThanOrEqual(1);

    // 実行: 失敗後も再 open できる
    hangingStorage.hook = undefined;
    await kvs.open();

    // 検証
    expect(kvs.isOpen).toBe(true);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - 操作中の close", () => {
  test("読み取り操作がゲートで保留中のとき close は待機し、解放後に完了する", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    const entered = new Gate();
    const gate = new Gate();
    storage.hook = async (call) => {
      if (call.method === "exists" && call.key === "a") {
        entered.open();
        await gate.wait();
      }
    };
    const kvs = UniKvs.config<{ a: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    const hasPending = kvs.has("a");
    await entered.wait();
    const closePending = kvs.close();

    // 検証: close は読み取りロックの解放を待つ
    await expect(isPending(closePending)).resolves.toBe(true);
    gate.open();
    await expect(hasPending).resolves.toBe(false);
    await expect(withTimeout(closePending, 2000, "gated-close")).resolves.toBeUndefined();
    expect(kvs.isOpen).toBe(false);
    expect(storage.callsOf("close")).toHaveLength(1);
  });

  test("書き込み操作がゲートで保留中のとき close を呼んでもデッドロックしない", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    const entered = new Gate();
    const gate = new Gate();
    storage.hook = async (call) => {
      if (call.method === "write") {
        entered.open();
        await gate.wait();
      }
    };
    const kvs = UniKvs.config<{ a: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    const setPending = kvs.set("a", "value");
    await entered.wait();
    const closePending = kvs.close();

    // 検証
    await expect(isPending(closePending)).resolves.toBe(true);
    gate.open();
    await expect(withTimeout(setPending, 2000, "set-finish")).resolves.toBeUndefined();
    await expect(withTimeout(closePending, 2000, "close-finish")).resolves.toBeUndefined();
    expect(kvs.isOpen).toBe(false);
  });
});

describe("UniKvs - 未オープン時の操作", () => {
  test("stream とオプション形式の操作も UniKvsIsNotOpenError を投げる", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config().persist(new FakeStorage()).create();

    // 実行と検証
    await expect(kvs.stream({ key: "logs" })).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.get({ key: "foo" })).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.has({ key: "foo" })).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.delete({ key: "foo" })).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.clear({})).rejects.toThrow(UniKvsIsNotOpenError);
  });

  test("close 前の asyncDispose は何もせず成功する", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config().persist(new Memory()).create();

    // 実行と検証
    await expect(kvs[Symbol.asyncDispose]()).resolves.toBeUndefined();
  });
});
