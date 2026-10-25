import { Memory } from "@unikvs/memory";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError, PluginOperationAggregateError } from "../src/errors.js";
import UniKvs from "../src/unikvs.js";
import type { StreamValue } from "../src/value-schemas.js";
import { Gate, collect, streamOf, isPending, withTimeout, FakeStreamStorage } from "./_helpers.js";

describe("UniKvs - ストリーム書き込み", () => {
  test("ReadableStream を複数のストレージへ書き込むと全チャンクが保存される", async ({
    expect,
  }) => {
    // 準備：
    const storage1 = new FakeStreamStorage("storage1");
    const storage2 = new FakeStreamStorage("storage2");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(storage1)
      .persist(storage2)
      .create();
    await kvs.open();

    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3]), new Uint8Array([4])];

    // 実行：
    await kvs.set("logs", streamOf(chunks));

    // 検証：
    expect(storage1.map.get("logs")).toStrictEqual(chunks);
    expect(storage2.map.get("logs")).toStrictEqual(chunks);
  });

  test("空の Uint8Array チャンクを含む任意境界のチャンク列が保存・復元される", async ({
    expect,
  }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();

    const chunks = [
      new Uint8Array([]),
      new Uint8Array([1]),
      new Uint8Array([2, 3, 4]),
      new Uint8Array([]),
      new Uint8Array([5]),
    ];

    // 実行：
    await kvs.set("logs", streamOf(chunks));

    // 検証：
    await using vs = await kvs.stream("logs");
    await expect(collect(vs)).resolves.toStrictEqual(chunks);
  });

  test("空ストリームは空のまま保存され、has は true になる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();

    // 実行：
    await kvs.set("logs", streamOf([]));

    // 検証：
    await expect(kvs.has("logs")).resolves.toBe(true);
    expect(storage.map.get("logs")).toStrictEqual([]);

    await using vs = await kvs.stream("logs");
    await expect(collect(vs)).resolves.toStrictEqual([]);
  });

  test("書き込み途中でソースがエラーすると集約エラーになり、データは保存されない", async ({
    expect,
  }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();

    const source = new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(new Uint8Array([1]));
        controller.error(new Error("source boom"));
      },
    });

    // 実行と検証：
    await expect(kvs.set("logs", source)).rejects.toThrow(PluginOperationAggregateError);

    expect(storage.map.has("logs")).toBe(false);
  });

  test("書き込み失敗時にソースストリームがキャンセルされる", async ({ expect }) => {
    // 準備：
    class FailingWriteStorage extends FakeStreamStorage {
      public override getWritable(): WritableStream<Uint8Array> {
        return new WritableStream<Uint8Array>({
          write() {
            throw new Error("write failed");
          },
        });
      }
    }

    const storage = new FailingWriteStorage();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();

    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel(): void {
        cancelled = true;
      },
    });

    // 実行と検証：
    await expect(kvs.set("logs", source)).rejects.toThrow(PluginOperationAggregateError);
    expect(cancelled).toBe(true);
  });

  test("書き込みバックプレッシャーでソースの読み取りが先行しない", async ({ expect }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    const entered = Promise.withResolvers<void>();
    const writeGate = new Gate();
    storage.writeGate = writeGate;
    storage.onWriteStart = (): void => {
      entered.resolve();
    };

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();

    const chunks = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
    let pulls = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller): void {
        const chunk = chunks[pulls];
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (chunk !== undefined) {
          controller.enqueue(chunk);
        } else {
          controller.close();
        }

        pulls++;
      },
    });

    // 実行：
    const pending = kvs.set("logs", source);

    await entered.promise;

    // 検証 : 書き込みが保留中でもソースの読み取りが先行し続けない (バッファリングは高々 1 チャンク)。
    const pullsWhileBlocked = pulls;
    expect(pullsWhileBlocked).toBeLessThanOrEqual(2);

    await expect(isPending(pending)).resolves.toBe(true);
    expect(pulls).toBe(pullsWhileBlocked);
    writeGate.open();
    await pending;
    expect(pulls).toBe(chunks.length + 1);
    expect(storage.map.get("logs")).toStrictEqual(chunks);
  });
});

describe("UniKvs - ストリーム読み取り", () => {
  test("最初のストレージのデータが優先して読み出される", async ({ expect }) => {
    // 準備：
    const storage1 = new FakeStreamStorage("storage1");
    storage1.map.set("logs", [new Uint8Array([1])]);

    const storage2 = new FakeStreamStorage("storage2");
    storage2.map.set("logs", [new Uint8Array([2])]);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(storage1)
      .persist(storage2)
      .create();
    await kvs.open();

    // 実行：
    await using vs = await kvs.stream("logs");

    // 検証：
    await expect(collect(vs)).resolves.toStrictEqual([new Uint8Array([1])]);
  });

  test("stream の存在確認は has と一貫している", async ({ expect }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();

    // 実行と検証：
    await expect(kvs.stream("logs")).rejects.toThrow(KeyNotFoundError);
    await expect(kvs.has("logs")).resolves.toBe(false);
  });

  test("getReader で最後まで読むと dispose 後の再書き込みが可能になる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();
    await kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 実行：
    const vs = await kvs.stream("logs");
    const reader = vs.getReader();
    const first = await reader.read();
    const second = await reader.read();

    // 検証：
    expect(first).toStrictEqual({
      done: false,
      value: new Uint8Array([1]),
    });
    expect(second.done).toBe(true);
    await vs.dispose();

    // 実行：
    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([2])])), 1500, "set-after-read"),
    ).resolves.toBeUndefined();

    // 検証：
    await using vs2 = await kvs.stream("logs");
    await expect(collect(vs2)).resolves.toStrictEqual([new Uint8Array([2])]);
  });

  test("dispose は複数回呼んでも安全である", async ({ expect }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();

    const vs = await kvs.stream("logs");

    // 実行と検証：
    await expect(vs.dispose()).resolves.toBeUndefined();
    await expect(vs.dispose()).resolves.toBeUndefined();
  });

  test("await using で読み取りロックが自動解放される", async ({ expect }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();

    // 実行：
    {
      await using vs = await kvs.stream("logs");
      const reader = vs.getReader();
      await reader.read();
    }

    // 検証 : ロックが解放されているため同じキーに書き込める。
    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([2])])), 1500, "set-after-using"),
    ).resolves.toBeUndefined();
  });

  test("非同期イテレーターの break 後も同じキーに書き込める", async ({ expect }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1]), new Uint8Array([2])]);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();

    // 実行：
    for await (const _chunk of await kvs.stream("logs")) {
      break;
    }

    // 検証：
    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([3])])), 1500, "set-after-break"),
    ).resolves.toBeUndefined();
  });

  test("Memory を介したストリーム往復でバイト列が一致する", async ({ expect }) => {
    // 準備：
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(new Memory())
      .create();
    await kvs.open();

    const bytes = Uint8Array.from({ length: 1024 }, (_, i) => i % 256);

    // 実行：
    await kvs.set(
      "logs",
      streamOf([bytes.subarray(0, 100), bytes.subarray(100, 500), bytes.subarray(500)]),
    );

    await using vs = await kvs.stream("logs");

    // 検証：
    await expect(collect(vs)).resolves.toStrictEqual([bytes]);
  });
});
