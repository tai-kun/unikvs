import type { IStorage } from "@unikvs/core";
import { afterEach, describe, test, vi } from "vitest";

import { PluginOperationAggregateError, UniKvsIsNotOpenError } from "../src/errors.js";
import type { PlainValue, StreamValue } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import {
  FakeStorage,
  FakeStreamStorage,
  FakeStreamTransformer,
  FakeTransformer,
  Gate,
  collect,
  isPending,
  streamOf,
} from "./_helpers.js";

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

describe("UniKvs - set のキーロック待機中の abort", () => {
  test("キーロック待機中の abort は構築済みのストリームをキャンセルして abort 理由で失敗する", async ({
    expect,
  }) => {
    // 準備: 同じキーの読み取りロックを ValueStream で保持し、set をキーロック待機させる
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(storage).create();
    await kvs.open();
    const holder = await kvs.stream("logs");
    const { promise: cancelled, resolve: onCancelled } = Promise.withResolvers<void>();
    const source = new ReadableStream<Uint8Array>({
      cancel() {
        onCancelled();
      },
    });
    const controller = new AbortController();

    // 実行
    const pending = kvs.set("logs", source, { signal: controller.signal });
    await expect(isPending(pending)).resolves.toBe(true);
    controller.abort(reason);

    // 検証: abort 理由が伝播し、構築済みのソースストリームがキャンセルされる
    await expect(pending).rejects.toBe(reason);
    await expect(cancelled).resolves.toBeUndefined();

    // 後片付け: 読み取りロックを解放すると同じキーへの操作が再開できる
    await holder.dispose();
    await kvs.set("logs", streamOf([new Uint8Array([2])]));
    const vs = await kvs.stream("logs");
    await expect(collect(vs)).resolves.toStrictEqual([new Uint8Array([2])]);
    await vs.dispose();
    await kvs.close();
  });

  test("トランスフォーマー経由で構築されたストリームもキーロック待機中の abort でキャンセルされる", async ({
    expect,
  }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendTransformer(new FakeStreamTransformer())
      .appendStorage(storage)
      .create();
    await kvs.open();
    const holder = await kvs.stream("logs");
    const { promise: cancelled, resolve: onCancelled } = Promise.withResolvers<void>();
    const source = new ReadableStream<Uint8Array>({
      cancel() {
        onCancelled();
      },
    });
    const controller = new AbortController();

    // 実行
    const pending = kvs.set("logs", source, { signal: controller.signal });
    await expect(isPending(pending)).resolves.toBe(true);
    controller.abort(reason);

    // 検証
    await expect(pending).rejects.toBe(reason);
    await expect(cancelled).resolves.toBeUndefined();

    // 後片付け
    await holder.dispose();
    await kvs.close();
  });

  test("キーロック待機中の abort でキャンセルが失敗しても abort 理由が伝播する", async ({
    expect,
  }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);
    const kvs = UniKvs.config().appendStorage(storage).create();
    await kvs.open();
    const holder = await kvs.stream("logs");
    let cancelCalled = false;
    const source = new ReadableStream<Uint8Array>({
      cancel() {
        cancelCalled = true;
        throw new Error("CANCEL-FAILED");
      },
    });
    const controller = new AbortController();

    // 実行
    const pending = kvs.set("logs", source, { signal: controller.signal });
    await expect(isPending(pending)).resolves.toBe(true);
    controller.abort(reason);

    // 検証
    await expect(pending).rejects.toBe(reason);
    expect(cancelCalled).toBe(true);

    // 後片付け
    await holder.dispose();
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

/**
 * `new AbortController()` で生成されたインスタンスを生成順に記録します。
 * private な #acSet から中断済みの AbortController が解放されているかを、
 * close() の一括 abort に巻き込まれないことで間接的に検証するために使用します。
 */
function captureAbortControllers(): AbortController[] {
  const OriginalAbortController = AbortController;
  const created: AbortController[] = [];
  vi.stubGlobal(
    "AbortController",
    class extends OriginalAbortController {
      public constructor() {
        super();
        created.push(this);
      }
    },
  );
  return created;
}

describe("UniKvs - open のロック待機中の abort", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("ロック待機中の abort は abort 理由で失敗し、中断された AbortController は #acSet に残らない", async ({
    expect,
  }) => {
    // 準備
    const reason = new Error("USER-CANCEL");
    const storage = new FakeStorage();
    const { entered, release } = gateMethod(storage, "open");
    const kvs = UniKvs.config().appendStorage(storage).create();
    const controller = new AbortController();
    const created = captureAbortControllers();

    // 実行: 1 つ目の open がロックを保持したままストレージの open で保留になる
    const first = kvs.open();
    await entered.wait();

    // 実行: 2 つ目の open はロック待機に入り、待機中に abort される
    const second = kvs.open({ signal: controller.signal });
    controller.abort(reason);

    // 検証: abort 理由がそのまま伝播する
    await expect(second).rejects.toBe(reason);

    // 後片付け: 1 つ目の open を完了させて通常どおり close する
    release.open();
    await expect(first).resolves.toBeUndefined();
    await expect(kvs.close()).resolves.toBeUndefined();

    // 検証: 2 つ目の AbortController が #acSet に残っていれば close() の一括 abort に巻き込まれる
    expect(created).toHaveLength(2);
    expect(created[1]!.signal.aborted).toBe(false);
  });

  test("実行前に abort 済みの signal で open すると AbortController は #acSet に追加されない", async ({
    expect,
  }) => {
    // 準備
    const reason = new Error("open aborted");
    const kvs = UniKvs.config().appendStorage(new FakeStorage()).create();
    const created = captureAbortControllers();

    // 実行と検証: 事前 abort はストレージを開かず abort 理由で失敗する
    await expect(kvs.open({ signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
    expect(kvs.isOpen).toBe(false);

    // 検証: Set に追加されていれば close() の一括 abort に巻き込まれる
    await expect(kvs.close()).rejects.toThrow(UniKvsIsNotOpenError);
    expect(created).toHaveLength(1);
    expect(created[0]!.signal.aborted).toBe(false);
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
