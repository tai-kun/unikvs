import type { IStorage } from "@unikvs/core";
import { describe, test } from "vitest";

import { KeyNotFoundError, PluginOperationAggregateError } from "../src/errors.js";
import type { PlainValue, StreamValue } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import {
  FakeStorage,
  FakeStreamStorage,
  Gate,
  isPending,
  streamOf,
  withTimeout,
} from "./_helpers.js";

/**
 * 指定したキーへの exists が常に失敗するストレージです。
 * 読み取りフォールバックの検証に使用します。
 */
class ExistsErrorStorage extends FakeStorage {
  public constructor(name: string) {
    super(name);
    this.hook = (call) => {
      if (call.method === "exists") {
        throw new Error("exists failed");
      }
    };
  }
}

describe("UniKvs - 複数ストレージへの並列書き込み", () => {
  test("set は 1 つのストレージがゲートで保留中でも他のストレージへ並列に書き込む", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const entered1 = new Gate();
    const entered2 = new Gate();
    const release1 = new Gate();
    storage1.hook = async (call) => {
      if (call.method === "write") {
        entered1.open();
        await release1.wait();
      }
    };
    storage2.hook = (call) => {
      if (call.method === "write") {
        entered2.open();
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    const pending = kvs.set("foo", "value");
    await Promise.all([entered1.wait(), entered2.wait()]);

    // 検証: 両方の書き込みが開始しており、storage1 の解放を待たずに処理が進む
    await expect(isPending(pending)).resolves.toBe(true);
    expect(storage1.callsOf("write")).toHaveLength(1);
    expect(storage2.callsOf("write")).toHaveLength(1);

    // 後片付け
    release1.open();
    await pending;
    expect(storage1.map.get("foo")).toBe("value");
    expect(storage2.map.get("foo")).toBe("value");
    await kvs.close();
  });

  test("clear は 1 つのストレージがゲートで保留中でも他のストレージを並列に空にする", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    storage1.map.set("a", "1");
    storage2.map.set("a", "1");
    const entered1 = new Gate();
    const release1 = new Gate();
    storage1.hook = async (call) => {
      if (call.method === "clear") {
        entered1.open();
        await release1.wait();
      }
    };
    const kvs = UniKvs.config<{ a: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    const pending = kvs.clear();
    await entered1.wait();

    // 検証
    await expect(isPending(pending)).resolves.toBe(true);
    expect(storage1.callsOf("clear")).toHaveLength(1);
    expect(storage2.callsOf("clear")).toHaveLength(1);

    // 後片付け
    release1.open();
    await pending;
    expect(storage1.map.size).toBe(0);
    expect(storage2.map.size).toBe(0);
    await kvs.close();
  });
});

describe("UniKvs - 書き込みエラーの集約と通知", () => {
  test("片方の書き込みが失敗すると集約エラーを投げ、成功した側の onOtherWriteError が呼ばれる", async ({
    expect,
  }) => {
    // 準備
    const failure = new Error("write failed");
    const storage1 = new FakeStorage("storage1");
    storage1.errors["write"] = failure;
    const storage2 = new FakeStorage("storage2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.set("foo", "value").catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    const aggregate = error as PluginOperationAggregateError;
    expect(aggregate.meta.action).toBe("write");
    expect(aggregate.meta.errors).toStrictEqual([
      { plugin: "storage", name: "storage1", index: 0, reason: failure },
    ]);
    expect(storage2.otherWriteErrors).toStrictEqual([aggregate]);
    expect(storage1.otherWriteErrors).toHaveLength(0);
    expect(storage2.map.get("foo")).toBe("value");

    // 後片付け
    await kvs.close();
  });

  test("2 番目のストレージだけが失敗すると name と index で特定できる", async ({ expect }) => {
    // 準備
    const failure = new Error("write failed");
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    storage2.errors["write"] = failure;
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.set("foo", "value").catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    const aggregate = error as PluginOperationAggregateError;
    expect(aggregate.meta.errors).toStrictEqual([
      { plugin: "storage", name: "storage2", index: 1, reason: failure },
    ]);
    expect(storage1.otherWriteErrors).toStrictEqual([aggregate]);
    expect(storage2.otherWriteErrors).toHaveLength(0);
    expect(storage1.map.get("foo")).toBe("value");

    // 後片付け
    await kvs.close();
  });

  test("複数のストレージが失敗するとすべての理由が集約される", async ({ expect }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    storage1.errors["write"] = new Error("write failed 1");
    const storage2 = new FakeStorage("storage2");
    storage2.errors["write"] = new Error("write failed 2");
    const storage3 = new FakeStorage("storage3");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .appendStorage(storage3)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.set("foo", "value").catch((ex: unknown) => ex);

    // 検証
    const aggregate = error as PluginOperationAggregateError;
    expect(aggregate.meta.errors.map((e) => e.reason)).toStrictEqual([
      new Error("write failed 1"),
      new Error("write failed 2"),
    ]);
    expect(storage3.otherWriteErrors).toStrictEqual([aggregate]);

    // 後片付け
    await kvs.close();
  });

  test("onOtherWriteError 自体が失敗しても set は集約エラーを投げる", async ({ expect }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    storage1.errors["write"] = new Error("write failed");
    const storage2 = new FakeStorage("storage2");
    storage2.errors["onOtherWriteError"] = new Error("notification failed");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.set("foo", "value").catch((ex: unknown) => ex);

    // 検証: 通知の失敗は元の集約エラーを置き換えない
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect((error as PluginOperationAggregateError).meta.action).toBe("write");

    // 後片付け
    await kvs.close();
  });

  test("ストリーム書き込みでも片方の失敗時に他のストレージへ通知される", async ({ expect }) => {
    // 準備
    class FailGetWritableStorage extends FakeStreamStorage {
      public override getWritable(): WritableStream<Uint8Array> {
        throw new Error("getWritable failed");
      }
    }

    const storage1 = new FailGetWritableStorage("storage1");
    const storage2 = new FakeStreamStorage("storage2");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.set("logs", streamOf([new Uint8Array([1])])).catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect(storage2.otherWriteErrors).toHaveLength(1);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - 削除系エラーの集約", () => {
  test("clear の片方の失敗は action が clear の集約エラーになる", async ({ expect }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    storage1.errors["clear"] = new Error("clear failed");
    const storage2 = new FakeStorage("storage2");
    storage2.map.set("a", "1");
    const kvs = UniKvs.config<{ a: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.clear().catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect((error as PluginOperationAggregateError).meta.action).toBe("clear");
    expect(storage2.map.size).toBe(0);

    // 後片付け
    await kvs.close();
  });

  test("delete の複数失敗は action が delete の集約エラーになる", async ({ expect }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    storage1.errors["delete"] = new Error("delete failed 1");
    storage1.map.set("a", "1");
    const storage2 = new FakeStorage("storage2");
    storage2.errors["delete"] = new Error("delete failed 2");
    storage2.map.set("a", "1");
    const kvs = UniKvs.config<{ a: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.delete("a").catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    const aggregate = error as PluginOperationAggregateError;
    expect(aggregate.meta.action).toBe("delete");
    expect(aggregate.meta.errors).toHaveLength(2);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - 読み取りフォールバックの集約", () => {
  test("has はすべてのストレージで exists が失敗すると集約された cause 付きの KeyNotFoundError を投げる", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new ExistsErrorStorage("storage1");
    const storage2 = new ExistsErrorStorage("storage2");
    const kvs = UniKvs.config<{ a: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.has("a").catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).cause).toBeInstanceOf(PluginOperationAggregateError);
    expect(
      ((error as KeyNotFoundError).cause as PluginOperationAggregateError).meta.errors,
    ).toHaveLength(2);

    // 後片付け
    await kvs.close();
  });

  test("stream はすべてのストレージで読み取りが失敗すると集約された cause 付きの KeyNotFoundError を投げる", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    storage1.hook = (call) => {
      if (call.method === "getReadable" || call.method === "exists") {
        throw new Error("read failed");
      }
    };
    const storage2 = new FakeStorage("storage2");
    storage2.hook = storage1.hook;
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.stream("logs").catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).cause).toBeInstanceOf(PluginOperationAggregateError);

    // 後片付け
    await kvs.close();
  });

  test("has は最初のストレージの exists 失敗後も次のストレージで存在を確認できる", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new ExistsErrorStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    storage2.map.set("a", "1");
    const kvs = UniKvs.config<{ a: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行と検証
    await expect(withTimeout(kvs.has("a"), 1500, "has-fallback")).resolves.toBe(true);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - 複数ストレージの中断", () => {
  test("書き込み中に abort すると失敗したストレージだけが集約され、他のストレージは書き込み済みのまま残る", async ({
    expect,
  }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const entered = new Gate();
    const release = new Gate();
    storage1.hook = async (call) => {
      if (call.method === "write") {
        entered.open();
        await release.wait();
        call.signal?.throwIfAborted();
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();
    const controller = new AbortController();

    // 実行
    const pending = kvs.set("foo", "value", { signal: controller.signal });
    await entered.wait();
    controller.abort(reason);
    release.open();

    // 検証
    const error = await pending.catch((ex: unknown) => ex);
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    const aggregate = error as PluginOperationAggregateError;
    expect(aggregate.meta.errors).toStrictEqual([
      { plugin: "storage", name: "storage1", index: 0, reason },
    ]);
    expect(storage2.map.get("foo")).toBe("value");
    expect(storage1.map.has("foo")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("abort 後も KVS は壊れず次の操作が成功する", async ({ expect }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const entered = new Gate();
    const release = new Gate();
    storage1.hook = async (call) => {
      if (call.method === "write") {
        entered.open();
        await release.wait();
        call.signal?.throwIfAborted();
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();
    const controller = new AbortController();

    // 実行
    const pending = kvs.set("foo", "first", { signal: controller.signal });
    await entered.wait();
    controller.abort(reason);
    release.open();
    await pending.catch(() => {});

    // 実行
    storage1.hook = undefined;
    await kvs.set("foo", "second");

    // 検証
    expect(await kvs.get("foo")).toBe("second");
    expect(storage1.map.get("foo")).toBe("second");
    expect(storage2.map.get("foo")).toBe("second");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - ストレージごとの独立したチェーン", () => {
  test("片方のストレージだけが失敗しても他方のチェーンは完全なデータを保持する", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendStorage(storage2)
      .create();
    await kvs.open();
    await kvs.set("foo", "value");
    storage1.map.delete("foo");
    storage1.errors["read"] = new Error("read failed");

    // 実行
    const value = await kvs.get("foo");

    // 検証
    expect(value).toBe("value");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - onOtherWriteError 非対応ストレージ", () => {
  test("onOtherWriteError を持たないストレージが混在していても集約エラーは正常に伝播する", async ({
    expect,
  }) => {
    // 準備
    class BareStorage implements IStorage<string> {
      readonly name = "BareStorage";
      isOpen = true;
      readonly map = new Map<string, string>();
      write(): void {
        throw new Error("bare write failed");
      }
      read(args: IStorage.ReadArgs): string {
        return this.map.get(args.key) as string;
      }
      exists(args: IStorage.ExistsArgs): boolean {
        return this.map.has(args.key);
      }
      delete(args: IStorage.DeleteArgs): void {
        this.map.delete(args.key);
      }
      clear(): void {
        this.map.clear();
      }
    }

    const storage2 = new FakeStorage("storage2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(new BareStorage())
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.set("foo", "value").catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect(storage2.otherWriteErrors).toHaveLength(1);
    expect(storage2.map.get("foo")).toBe("value");

    // 後片付け
    await kvs.close();
  });
});
