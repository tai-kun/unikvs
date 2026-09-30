import type { IStorage } from "@unikvs/core";
import { describe, test } from "vitest";

import { PluginOperationAggregateError } from "../src/errors.js";
import type { PlainValue, StreamValue } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import { FakeStorage, FakeTransformer, Gate, collect } from "./_helpers.js";

/**
 * exists がゲートで保留され、解放時に中断を確認するフックを設定します。
 * 操作の実行中 abort を決定的に再現するために使用します。
 */
function gateMethod(storage: FakeStorage, method: string): { entered: Gate; release: Gate } {
  const entered = new Gate();
  const release = new Gate();
  storage.hook = async (call) => {
    if (call.method === method) {
      entered.open();
      await release.wait();
      call.signal?.throwIfAborted();
    }
  };

  return { entered, release };
}

/**
 * abort されると読み取りストリームがエラーになるストレージです。
 * ストリーム読み取り中の中断を検証するために使用します。
 */
class AbortableReadableStorage extends FakeStorage {
  public getReadable(args: IStorage.GetReadableArgs): ReadableStream<Uint8Array> {
    const chunk = this.map.get(args.key) as Uint8Array | undefined;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        if (chunk) {
          controller.enqueue(chunk);
        }
        args.signal.addEventListener("abort", () => controller.error(args.signal.reason), {
          once: true,
        });
      },
    });
  }
}

describe("UniKvs - 実行前 abort", () => {
  test("abort 済み signal の stream は abort 理由で失敗する", async ({ expect }) => {
    // 準備
    const reason = new Error("stream aborted");
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(storage).create();
    await kvs.open();

    // 実行と検証
    await expect(kvs.stream("logs", { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);

    // 後片付け
    await kvs.close();
  });

  test("理由なしの abort は AbortError として伝播する", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(new FakeStorage())
      .create();
    await kvs.open();

    // 実行
    const error = await kvs
      .set("foo", "value", { signal: AbortSignal.abort() })
      .catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - 実行中 abort", () => {
  test("set のストレージ書き込み中に abort すると abort 理由を含む集約エラーになる", async ({
    expect,
  }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStorage();
    const { entered, release } = gateMethod(storage, "write");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage).create();
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
    expect((error as PluginOperationAggregateError).meta.errors).toStrictEqual([
      { plugin: "storage", reason },
    ]);
    expect(storage.map.has("foo")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("get の存在確認中に abort すると abort 理由がそのまま伝播する", async ({ expect }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStorage();
    const { entered, release } = gateMethod(storage, "exists");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage).create();
    await kvs.open();
    const controller = new AbortController();

    // 実行
    const pending = kvs.get("foo", { signal: controller.signal });
    await entered.wait();
    controller.abort(reason);
    release.open();

    // 検証
    await expect(pending).rejects.toBe(reason);

    // 後片付け
    await kvs.close();
  });

  test("has の存在確認中に abort すると abort 理由がそのまま伝播する", async ({ expect }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStorage();
    const { entered, release } = gateMethod(storage, "exists");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage).create();
    await kvs.open();
    const controller = new AbortController();

    // 実行
    const pending = kvs.has("foo", { signal: controller.signal });
    await entered.wait();
    controller.abort(reason);
    release.open();

    // 検証
    await expect(pending).rejects.toBe(reason);

    // 後片付け
    await kvs.close();
  });

  test("delete の存在確認中に abort すると集約エラーになる", async ({ expect }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStorage();
    const { entered, release } = gateMethod(storage, "exists");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage).create();
    await kvs.open();
    const controller = new AbortController();

    // 実行
    const pending = kvs.delete("foo", { signal: controller.signal });
    await entered.wait();
    controller.abort(reason);
    release.open();

    // 検証
    const error = await pending.catch((ex: unknown) => ex);
    expect(error).toBeInstanceOf(PluginOperationAggregateError);

    // 後片付け
    await kvs.close();
  });

  test("clear の実行中に abort すると集約エラーになる", async ({ expect }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStorage();
    const { entered, release } = gateMethod(storage, "clear");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage).create();
    await kvs.open();
    const controller = new AbortController();

    // 実行
    const pending = kvs.clear({ signal: controller.signal });
    await entered.wait();
    controller.abort(reason);
    release.open();

    // 検証
    const error = await pending.catch((ex: unknown) => ex);
    expect(error).toBeInstanceOf(PluginOperationAggregateError);

    // 後片付け
    await kvs.close();
  });

  test("stream のセットアップ中に abort すると abort 理由がそのまま伝播する", async ({
    expect,
  }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStorage();
    const { entered, release } = gateMethod(storage, "exists");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(storage).create();
    await kvs.open();
    const controller = new AbortController();

    // 実行
    const pending = kvs.stream("logs", { signal: controller.signal });
    await entered.wait();
    controller.abort(reason);
    release.open();

    // 検証
    await expect(pending).rejects.toBe(reason);

    // 後片付け
    await kvs.close();
  });

  test("transformer の encode 中に abort すると abort 理由がそのまま伝播する", async ({
    expect,
  }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const transformer = new FakeTransformer();
    const entered = new Gate();
    const release = new Gate();
    transformer.hook = async (call) => {
      if (call.method === "encode") {
        entered.open();
        await release.wait();
        call.signal?.throwIfAborted();
      }
    };
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendTransformer(transformer)
      .appendStorage(storage)
      .create();
    await kvs.open();
    const controller = new AbortController();

    // 実行
    const pending = kvs.set("foo", "value", { signal: controller.signal });
    await entered.wait();
    controller.abort(reason);
    release.open();

    // 検証
    await expect(pending).rejects.toBe(reason);
    expect(storage.map.has("foo")).toBe(false);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - transformer の decode 中の abort", () => {
  test("get の decode 中に abort すると abort 理由がそのまま伝播する", async ({ expect }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");
    const transformer = new FakeTransformer();
    const entered = new Gate();
    const release = new Gate();
    transformer.hook = async (call) => {
      if (call.method === "decode") {
        entered.open();
        await release.wait();
        call.signal?.throwIfAborted();
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendTransformer(transformer)
      .appendStorage(storage)
      .create();
    await kvs.open();
    const controller = new AbortController();

    // 実行
    const pending = kvs.get("foo", { signal: controller.signal });
    await entered.wait();
    controller.abort(reason);
    release.open();

    // 検証
    await expect(pending).rejects.toBe(reason);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - ストリーム読み取り中の abort", () => {
  test("読み取りストリームが abort でエラーになるとイテレーションが abort 理由で失敗する", async ({
    expect,
  }) => {
    // 準備
    const reason = new Error("read aborted");
    const storage = new AbortableReadableStorage();
    storage.map.set("logs", new Uint8Array([1, 2]));
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(storage).create();
    await kvs.open();
    const controller = new AbortController();
    const vs = await kvs.stream("logs", { signal: controller.signal });

    // 実行
    controller.abort(reason);

    // 検証
    await expect(collect(vs)).rejects.toBe(reason);

    // 後片付け
    await vs.dispose();
    await kvs.close();
  });
});

describe("UniKvs - abort 後の回復", () => {
  test("abort された操作の後でも同じキーへの操作が成功する", async ({ expect }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStorage();
    const { entered, release } = gateMethod(storage, "write");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage).create();
    await kvs.open();
    const controller = new AbortController();

    // 実行
    const pending = kvs.set("foo", "first", { signal: controller.signal });
    await entered.wait();
    controller.abort(reason);
    release.open();
    await pending.catch(() => {});

    // 実行
    storage.hook = undefined;
    await kvs.set("foo", "second");

    // 検証
    expect(await kvs.get("foo")).toBe("second");

    // 後片付け
    await kvs.close();
  });

  test("操作完了後に abort しても結果は保持される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage).create();
    await kvs.open();
    const controller = new AbortController();

    // 実行
    await kvs.set("foo", "value", { signal: controller.signal });
    controller.abort(new Error("too late"));

    // 検証
    expect(await kvs.get("foo")).toBe("value");

    // 後片付け
    await kvs.close();
  });
});
