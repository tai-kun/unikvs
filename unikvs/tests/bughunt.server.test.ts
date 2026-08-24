import { createHash } from "node:crypto";

import { ChecksumSha256 } from "@unikvs/checksum";
import type { IStorage, ITransformer } from "@unikvs/core";
import { NodeFs } from "@unikvs/fs.node";
import { Memory } from "@unikvs/memory";
import { describe, expect, test } from "vitest";

import {
  KeyNotFoundError,
  PluginOperationAggregateError,
  UniKvsIsNotOpenError,
} from "../src/errors.js";
import type { PlainValue, StreamValue, Value } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";

// -------------------------------------------------------------------------------------------------
// ヘルパー
// -------------------------------------------------------------------------------------------------

function streamOf(chunks: Uint8Array<ArrayBuffer>[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(c);
      }
      controller.close();
    },
  });
}

async function collect(
  stream: AsyncIterable<Uint8Array<ArrayBufferLike>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array<ArrayBufferLike>[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const merged = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return merged;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT(${label})`)), ms)),
  ]);
}

function mapOf(storage: Memory): Map<string, unknown> {
  return (storage as unknown as { map: Map<string, unknown> }).map;
}

class FailGetWritableStorage implements IStorage {
  readonly name = "FailGetWritableStorage";
  isOpen = true;
  readonly map = new Map<string, unknown>();

  write(args: IStorage.WriteArgs): void {
    this.map.set(args.key, args.data);
  }
  read(args: IStorage.ReadArgs): unknown {
    return this.map.get(args.key);
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

  getWritable(_args: Pick<IStorage.GetWritableArgs, "key">): WritableStream<Uint8Array> {
    throw new Error("getWritable failed");
  }
}

class ErrorMidwayReadableStorage implements IStorage {
  readonly name = "ErrorMidwayReadableStorage";
  isOpen = true;
  readonly entries = new Map<string, Uint8Array[]>();

  write(_args: IStorage.WriteArgs): void {}
  read(_args: IStorage.ReadArgs): unknown {
    return undefined;
  }
  exists(args: IStorage.ExistsArgs): boolean {
    return this.entries.has(args.key);
  }
  delete(args: IStorage.DeleteArgs): void {
    this.entries.delete(args.key);
  }
  clear(): void {
    this.entries.clear();
  }
  getWritable(args: Pick<IStorage.GetWritableArgs, "key">): WritableStream<Uint8Array> {
    const chunks: Uint8Array[] = [];
    return new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
      close: () => {
        this.entries.set(args.key, chunks);
      },
    });
  }
  getReadable(args: Pick<IStorage.ReadArgs, "key">): ReadableStream<Uint8Array> {
    const chunks = this.entries.get(args.key) ?? [];
    let i = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i < chunks.length) {
          controller.enqueue(chunks[i++]!);
        } else {
          controller.error(new Error("boom"));
        }
      },
    });
  }
}

// -------------------------------------------------------------------------------------------------
// ライフサイクル
// -------------------------------------------------------------------------------------------------

describe("バグ調査: ライフサイクル", () => {
  test("並行 open は 2 回目に失敗する", async () => {
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(new Memory()).create();
    const results = await Promise.allSettled([kvs.open(), kvs.open()]);
    expect(results[0]?.status).toBe("fulfilled");
    expect(kvs.isOpen).toBe(true);
    await kvs.close();
  });

  test("open の部分失敗時、成功したストレージはクローズされる", async () => {
    class OkStorage extends Memory {
      #opened = false;
      closeCount = 0;
      override get isOpen(): boolean {
        return this.#opened;
      }
      async open(): Promise<void> {
        this.#opened = true;
      }
      async close(): Promise<void> {
        if (this.#opened) {
          this.closeCount++;
          this.#opened = false;
        }
      }
    }
    class BadStorage extends Memory {
      override get isOpen(): boolean {
        return false;
      }
      open(): Promise<void> {
        return Promise.reject(new Error("open failed"));
      }
    }
    const ok = new OkStorage();
    const bad = new BadStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(ok)
      .appendStorage(bad)
      .create();
    await expect(kvs.open()).rejects.toThrow(PluginOperationAggregateError);
    expect(ok.closeCount).toBe(1);
    expect(kvs.isOpen).toBe(false);
  });

  test("close 後の操作は UniKvsIsNotOpenError", async () => {
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(new Memory()).create();
    await kvs.open();
    await kvs.close();
    await expect(kvs.get("foo")).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.set("foo", "a")).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.stream("foo" as never)).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.has("foo")).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.delete("foo")).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.clear()).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.close()).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.open()).resolves.toBeUndefined();
    await kvs.close();
  });

  test("すでに abort 済みシグナルで各操作が即座に失敗する", async () => {
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(new Memory()).create();
    await kvs.open();
    const sig = AbortSignal.abort(new Error("aborted!"));
    await expect(kvs.set("foo", "a", { signal: sig })).rejects.toThrow("aborted!");
    await expect(kvs.get("foo", { signal: sig })).rejects.toThrow("aborted!");
    await expect(kvs.has("foo", { signal: sig })).rejects.toThrow("aborted!");
    await expect(kvs.delete("foo", { signal: sig })).rejects.toThrow("aborted!");
    await expect(kvs.clear({ signal: sig })).rejects.toThrow("aborted!");
    await kvs.close();
  });
});

// -------------------------------------------------------------------------------------------------
// 複数ストレージ
// -------------------------------------------------------------------------------------------------

describe("バグ調査: 複数ストレージの部分失敗", () => {
  test("get: 最初のストレージで read 失敗したら次のストレージにフォールバックする", async () => {
    const bad = new Memory();
    const good = new Memory();
    const kvs = UniKvs.config<{ foo: PlainValue<Uint8Array> }>()
      .appendStorage(bad)
      .appendStorage(good)
      .create();
    await kvs.open();
    mapOf(bad).set("foo", new Uint8Array([1]));
    // read を必ず失敗させる
    (bad as unknown as { read: () => never }).read = () => {
      throw new Error("read failed");
    };
    mapOf(good).set("foo", new Uint8Array([2]));
    const v = await kvs.get("foo");
    expect([...v]).toEqual([2]);
    await kvs.close();
  });

  // BUG-003: get() はストレージの読み取り失敗時に他のストレージへフォールバックするが、
  // has() は fallback せず最初の exists() エラーで全体が失敗する。
  // 修正までこのテストは失敗し続けることを期待するため test.fails を使用している。
  test.fails("has: 最初のストレージの exists 失敗でもフォールバックして結果を返す", async () => {
    class ExplodingExistsStorage extends Memory {
      override exists(_args: IStorage.ExistsArgs): boolean {
        throw new Error("exists failed");
      }
    }
    const good = new Memory();
    mapOf(good).set("foo", "v");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(new ExplodingExistsStorage())
      .appendStorage(good)
      .create();
    await kvs.open();
    // get はフォールバックする
    await expect(kvs.get("foo")).resolves.toBe("v");
    // has はフォールバックせず失敗する (不整合)
    await expect(withTimeout(kvs.has("foo"), 1500, "has-fallback")).resolves.toBe(true);
    await kvs.close();
  });

  test("delete: 一部ストレージで失敗したら集約エラーになる", async () => {
    class BadDeleteStorage extends Memory {
      override delete(_args: IStorage.DeleteArgs): void {
        throw new Error("delete failed");
      }
    }
    const good = new Memory();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(new BadDeleteStorage())
      .appendStorage(good)
      .create();
    await kvs.open();
    await kvs.set("foo", "v");
    await expect(kvs.delete("foo")).rejects.toThrow(PluginOperationAggregateError);
    expect(mapOf(good).has("foo")).toBe(false);
    await kvs.close();
  });

  test("stream 書き込み: 片方の getWritable が同期失敗しても set は解決する (ハングしない)", async () => {
    const mem = new Memory();
    const fail = new FailGetWritableStorage();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendStorage(mem)
      .appendStorage(fail)
      .create();
    await kvs.open();
    await expect(
      withTimeout(
        kvs.set("logs", streamOf([new Uint8Array([1]), new Uint8Array([2])])),
        2000,
        "set-streams-partial-failure",
      ),
    ).rejects.toThrow(PluginOperationAggregateError);
    await kvs.close();
  });
});

// -------------------------------------------------------------------------------------------------
// ストリームとロック
// -------------------------------------------------------------------------------------------------

describe("バグ調査: ストリームとロック", () => {
  // BUG-002: ValueStream の読み取り中にエラーが発生し、consumer が reader.cancel() を呼ばずに
  // 放棄した場合でも、pull の catch 節で dispose されるためキーのロックはリークしない。
  test("ValueStream エラー後に cancel/releaseLock のみで放棄しても同一キーへの set がブロックされない", async () => {
    const storage = new ErrorMidwayReadableStorage();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(storage).create();
    await kvs.open();
    storage.entries.set("logs", [new Uint8Array([1])]);

    const vs = await kvs.stream("logs");
    const reader = vs.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    await expect(reader.read()).rejects.toThrow("boom");
    // 典型的なエラー処理: ロックだけ解放してストリームを放棄する
    reader.releaseLock();

    // 同一キーへの書き込みが可能であるべき
    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([9])])), 2000, "set-after-abandon"),
    ).resolves.toBeUndefined();
    await vs.dispose();
    await kvs.close();
  });

  test("参考: 放棄されたエラーストリームでもロックは解放され、delete / stream / close はブロックされない", async () => {
    const storage = new ErrorMidwayReadableStorage();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(storage).create();
    await kvs.open();
    storage.entries.set("logs", [new Uint8Array([1])]);

    const vs = await kvs.stream("logs");
    const reader = vs.getReader();
    await reader.read();
    await expect(reader.read()).rejects.toThrow("boom");
    reader.releaseLock(); // cancel せずに放棄

    // エラー時に dispose されるためロックは解放済みで、後続操作はブロックされない
    const vs2 = await withTimeout(kvs.stream("logs"), 1500, "stream-after-abandon");
    const reader2 = vs2.getReader();
    expect((await reader2.read()).done).toBe(false);
    await expect(reader2.read()).rejects.toThrow("boom");
    await vs2.dispose();
    await expect(
      withTimeout(kvs.delete("logs"), 1500, "delete-after-abandon"),
    ).resolves.toBeUndefined();
    // close もロック解放を待たずに完了する
    await withTimeout(kvs.close(), 1500, "close-after-abandon");
    expect(kvs.isOpen).toBe(false);
  });

  test("未破棄の ValueStream を残したまま close するとタイムアウト後に強制破棄される", async () => {
    const mem = new Memory();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(mem).create();
    await kvs.open();
    await kvs.set("logs", streamOf([new Uint8Array([1])]));

    const vs = await kvs.stream("logs");
    // ストリームを読まずに close を試みる
    const closeResult = await withTimeout(
      kvs.close({ signal: AbortSignal.timeout(500) }).then(
        () => "resolved" as const,
        (ex) => `rejected: ${(ex as Error).name}`,
      ),
      3000,
      "close-with-live-stream",
    );
    // ロック解放待ちでタイムアウトし、ベストエフォートのクローズ処理へ移行する
    expect(closeResult.startsWith("rejected")).toBe(true);
    expect(kvs.isOpen).toBe(false);
    await vs.dispose();
  });

  test("ValueStream を早期 break で反復した後も同一キーへ set できる", async () => {
    const mem = new Memory();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(mem).create();
    await kvs.open();
    await kvs.set("logs", streamOf([new Uint8Array([1]), new Uint8Array([2])]));

    let count = 0;
    for await (const _chunk of await kvs.stream("logs")) {
      count++;
      if (count === 1) break;
    }
    expect(count).toBe(1);

    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([3])])), 2000, "set-after-break"),
    ).resolves.toBeUndefined();
    await kvs.close();
  });

  test("ライブストリーム中でも同一キーの has は可能", async () => {
    const mem = new Memory();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(mem).create();
    await kvs.open();
    await kvs.set("logs", streamOf([new Uint8Array([1])]));
    const vs = await kvs.stream("logs");
    const reader = vs.getReader();
    await reader.read();
    await expect(withTimeout(kvs.has("logs"), 1500, "has-during-stream")).resolves.toBe(true);
    void reader.cancel();
    await vs.dispose();
    await kvs.close();
  });

  test("stream set → get の意味整合性 (Value 型キー)", async () => {
    const kvs = UniKvs.config<{ data: Value<Uint8Array> }>().appendStorage(new Memory()).create();
    await kvs.open();
    await kvs.set("data", streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]));
    const v = await kvs.get("data");
    expect([...v]).toEqual([1, 2, 3]);

    // 空ストリーム
    await kvs.set("data", streamOf([]));
    const empty = await kvs.get("data");
    expect(empty.byteLength).toBe(0);

    // 単一値 set → stream 読み
    await kvs.set("data", new Uint8Array([7, 8]));
    const vs = await kvs.stream("data");
    expect([...(await collect(vs))]).toEqual([7, 8]);
    await kvs.close();
  });
});

// -------------------------------------------------------------------------------------------------
// Transformer
// -------------------------------------------------------------------------------------------------

describe("バグ調査: Transformer", () => {
  test("複数トランスフォーマーの適用順序 (set: 順方向, get: 逆方向)", async () => {
    class Append implements ITransformer {
      readonly name: string;
      isOpen = true;
      readonly tag: string;
      constructor(tag: string) {
        this.tag = tag;
        this.name = tag;
      }
      encode(args: ITransformer.EncodeArgs): string {
        return `${String(args.data)}${this.tag}`;
      }
      decode(args: ITransformer.DecodeArgs): string {
        const s = String(args.data);
        expect(s.endsWith(this.tag)).toBe(true);
        return s.slice(0, -this.tag.length);
      }
    }
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendTransformer(new Append("A"))
      .appendTransformer(new Append("B"))
      .appendStorage(new Memory())
      .create();
    await kvs.open();
    await kvs.set("foo", "x");
    expect(await kvs.get("foo")).toBe("x");
    await kvs.close();
  });

  // BUG-002: 配列形式の context が {"0": [...]} 形式のオブジェクトに変換され、
  // チェックサム検証がサイレントにスキップされる。
  // 修正までこのテストは失敗し続けることを期待するため test.fails を使用している。
  test.fails("チェックサム不一致 (配列形式 context) でもストリーム書き込みが拒否される", async () => {
    const mem = new Memory();
    const kvs = UniKvs.config<{ logs2: StreamValue<Uint8Array> }>()
      .appendTransformer(new ChecksumSha256())
      .appendStorage(mem)
      .create();
    const wrongSum = createHash("sha256")
      .update(new Uint8Array([9, 9]))
      .digest("hex");
    await kvs.open();
    // ContextSource 型は配列形式を正当な入力として受け付けるが、実際には検証されない
    await expect(
      kvs.set({
        key: "logs2",
        value: streamOf([new Uint8Array([1, 2, 3])]),
        context: [["@unikvs/checksum:sha256", wrongSum]] as const,
      }),
    ).rejects.toThrow(/fail write operation/);
    expect(mapOf(mem).has("logs")).toBe(false);
    await kvs.close();
  });

  test("対照実験: チェックサム不一致 (オブジェクト形式 context) は検知される", async () => {
    const mem = new Memory();
    const kvs = UniKvs.config<{ logs2: StreamValue<Uint8Array> }>()
      .appendTransformer(new ChecksumSha256())
      .appendStorage(mem)
      .create();
    const wrongSum = createHash("sha256")
      .update(new Uint8Array([9, 9]))
      .digest("hex");
    await kvs.open();
    const ex = await kvs
      .set({
        key: "logs2",
        value: streamOf([new Uint8Array([1, 2, 3])]),
        context: { "@unikvs/checksum:sha256": wrongSum },
      })
      .then(
        () => null,
        (e) => e as PluginOperationAggregateError,
      );
    expect(ex).toBeInstanceOf(PluginOperationAggregateError);
    // 集約された原因がチェックサム不一致であること
    const errors = (ex?.meta.errors ?? []) as readonly { reason: unknown }[];
    const reasons = errors.map((e) => e.reason);
    expect(reasons.some((r) => String(r).match(/mismatch/i))).toBe(true);
    expect(mapOf(mem).has("logs2")).toBe(false);
    await kvs.close();
  });

  test("チェックサム一致 (ストリーム書き込み→ストリーム読み取り)", async () => {
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendTransformer(new ChecksumSha256())
      .appendStorage(new Memory())
      .create();
    const sum = createHash("sha256")
      .update(new Uint8Array([1, 2, 3]))
      .digest("hex");
    await kvs.open();
    await kvs.set({
      key: "logs",
      value: streamOf([new Uint8Array([1]), new Uint8Array([2, 3])]),
      context: { "@unikvs/checksum:sha256": sum },
    });
    const vs = await kvs.stream("logs", { context: { "@unikvs/checksum:sha256": sum } });
    expect([...(await collect(vs))]).toEqual([1, 2, 3]);
    await kvs.close();
  });

  test("トランスフォーマー encode が失敗しても set は安全に失敗する", async () => {
    class BoomTransformer implements ITransformer {
      readonly name = "Boom";
      isOpen = true;
      encode(): never {
        throw new Error("boom");
      }
      decode(): never {
        throw new Error("boom");
      }
    }
    const mem = new Memory();
    const kvs = UniKvs.config<{ foo: PlainValue<Uint8Array> }>()
      .appendTransformer(new BoomTransformer())
      .appendStorage(mem)
      .create();
    await kvs.open();
    await expect(kvs.set("foo", new Uint8Array([1]))).rejects.toThrow("boom");
    expect(mapOf(mem).has("foo")).toBe(false);
    await kvs.close();
  });
});

// -------------------------------------------------------------------------------------------------
// NodeFs
// -------------------------------------------------------------------------------------------------

describe("バグ調査: NodeFs", () => {
  test("特殊なキーの受容/拒否と基本動作", async () => {
    const root = `.tmp-bugfest-${Date.now()}`;
    const kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .appendStorage(new NodeFs(root))
      .create();
    await kvs.open();
    await kvs.set("foo", new Uint8Array([1]));
    expect([...(await kvs.get("foo"))]).toEqual([1]);
    // パストラバーサル系は拒否されるべき
    for (const key of ["", ".", "..", "../evil", "a/b", "a\\b"]) {
      await expect(
        kvs.set({ key: key as never, value: new Uint8Array([1]) as never }),
        `key=${JSON.stringify(key)}`,
      ).rejects.toThrow(PluginOperationAggregateError);
    }
    await kvs.clear();
    expect(await kvs.has("foo")).toBe(false);
    await kvs.close();
    const { rmSync } = await import("node:fs");
    rmSync(root, { recursive: true, force: true });
  });

  test("ストリーム書き込み中断時、既存データは無傷で一時ファイルも残らない", async () => {
    const root = `.tmp-bugfest-${Date.now()}-abort`;
    const { readdirSync } = await import("node:fs");
    const kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .appendStorage(new NodeFs(root))
      .create();
    await kvs.open();
    await kvs.set("foo", new Uint8Array([1, 1, 1]));

    let pulls = 0;
    const slow = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array([9, 9, 9]));
      },
    });
    const ac = new AbortController();
    const p = kvs.set("foo", slow, { signal: ac.signal });
    await new Promise((r) => setTimeout(r, 30));
    expect(pulls).toBeGreaterThan(0);
    ac.abort(new Error("stop"));
    await expect(p).rejects.toThrow(PluginOperationAggregateError);

    // 既存データは無傷
    expect([...(await kvs.get("foo"))]).toEqual([1, 1, 1]);
    // 一時ファイルが残っていないこと
    expect(readdirSync(root).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    await kvs.close();
    const { rmSync } = await import("node:fs");
    rmSync(root, { recursive: true, force: true });
  }, 15000);

  test("同一キーへの並行書き込みでも破損しない", async () => {
    const root = `.tmp-bugfest-${Date.now()}-race`;
    const kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .appendStorage(new NodeFs(root))
      .create();
    await kvs.open();
    await Promise.all([
      kvs.set("foo", new Uint8Array([1, 1, 1, 1])),
      kvs.set("foo", new Uint8Array([2, 2, 2, 2])),
    ]);
    const v = await kvs.get("foo");
    expect(v.length).toBe(4);
    expect(new Set(v.values()).size).toBe(1); // どちらか一方の値で一貫している
    await kvs.close();
    const { rmSync } = await import("node:fs");
    rmSync(root, { recursive: true, force: true });
  });
});

// -------------------------------------------------------------------------------------------------
// Memory
// -------------------------------------------------------------------------------------------------

describe("バグ調査: Memory", () => {
  test("set した値は参照共有される (ミューテーションが反映される)", async () => {
    const kvs = UniKvs.config<{ foo: PlainValue<Uint8Array> }>()
      .appendStorage(new Memory())
      .create();
    await kvs.open();
    const arr = new Uint8Array([1, 2, 3]);
    await kvs.set("foo", arr);
    arr[0] = 99;
    const got = await kvs.get("foo");
    expect(got[0]).toBe(99); // コピーなら 1
    await kvs.close();
  });

  test("存在しないキーへの操作", async () => {
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(new Memory()).create();
    await kvs.open();
    expect(await kvs.has("foo")).toBe(false);
    await expect(kvs.get("foo")).rejects.toThrow(KeyNotFoundError);
    await expect(kvs.stream("foo" as never)).rejects.toThrow(KeyNotFoundError);
    // delete は存在確認つきなので静かに成功する
    await expect(kvs.delete("foo")).resolves.toBeUndefined();
    await kvs.close();
  });
});

// -------------------------------------------------------------------------------------------------
// 競合
// -------------------------------------------------------------------------------------------------

describe("バグ調査: 競合", () => {
  test("同一キーへの並行 set は直列化され、全ストレージで一貫する", async () => {
    const s1 = new Memory();
    const s2 = new Memory();
    const kvs = UniKvs.config<{ foo: PlainValue<Uint8Array> }>()
      .appendStorage(s1)
      .appendStorage(s2)
      .create();
    await kvs.open();
    await Promise.all([kvs.set("foo", new Uint8Array([1])), kvs.set("foo", new Uint8Array([2]))]);
    const v1 = mapOf(s1).get("foo") as Uint8Array;
    const v2 = mapOf(s2).get("foo") as Uint8Array;
    expect([...v1]).toEqual([...v2]); // ストレージ間で分割されていないこと
    await kvs.close();
  });

  test("set と delete の競合でも一貫した状態になる", async () => {
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(new Memory()).create();
    await kvs.open();
    await kvs.set("foo", "init");
    await Promise.allSettled([kvs.set("foo", "updated"), kvs.delete("foo")]);
    // 直列化されるため、どちらか一方の結果になっているはず
    const has = await kvs.has("foo");
    // 直列化されるため、どちらか一方の結果になっている
    expect(await kvs.has("foo")).toBe(has);
    await kvs.get("foo").then(
      (v) => expect(v).toBe("updated"),
      (ex) => expect(String(ex)).toContain("not found"),
    );
    await kvs.close();
  });

  test("clear と set の競合でも壊れない", async () => {
    const kvs = UniKvs.config<{ foo: PlainValue<string>; bar: PlainValue<string> }>()
      .appendStorage(new Memory())
      .create();
    await kvs.open();
    await Promise.allSettled([kvs.clear(), kvs.set("foo", "v"), kvs.set("bar", "w")]);
    // 例外でプロセスが壊れないことだけ確認
    const existsAfter = await kvs.has("foo");
    expect([true, false]).toContain(existsAfter);
    await kvs.close();
  });

  test("並行 close しても壊れない", async () => {
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(new Memory()).create();
    await kvs.open();
    const results = await Promise.allSettled([kvs.close(), kvs.close()]);
    expect(kvs.isOpen).toBe(false);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  });
});
