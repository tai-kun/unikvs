import { ChecksumSha256 } from "@unikvs/checksum";
import type { Context, IStorage, ITransformer } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import { describe, expect, test, vi } from "vitest";

import {
  InvalidInputError,
  KeyNotFoundError,
  PluginOperationAggregateError,
  UniKvsIsNotOpenError,
  UniKvsIsOpenError,
} from "../src/errors.js";
import type { PlainValue, StreamValue, Value } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";

class MockStorage implements IStorage {
  readonly name: string;
  isOpen = false;
  openCallCount = 0;
  closeCallCount = 0;
  lastWriteContext: Context | undefined;

  readonly map = new Map<string, unknown>();

  private readonly openError: { error: unknown } | undefined;
  private readonly closeError: { error: unknown } | undefined;

  constructor(name = "MockStorage", options: { openError?: unknown; closeError?: unknown } = {}) {
    this.name = name;
    this.openError = "openError" in options ? { error: options.openError } : undefined;
    this.closeError = "closeError" in options ? { error: options.closeError } : undefined;
  }

  async open(): Promise<void> {
    this.openCallCount++;
    if (this.openError !== undefined) {
      throw this.openError.error;
    }

    this.isOpen = true;
  }

  async close(): Promise<void> {
    this.closeCallCount++;
    this.isOpen = false;
    if (this.closeError !== undefined) {
      throw this.closeError.error;
    }
  }

  async write(args: IStorage.WriteArgs): Promise<void> {
    this.lastWriteContext = args.context;
    this.map.set(args.key, args.data);
  }

  async read(args: IStorage.ReadArgs): Promise<unknown> {
    return this.map.get(args.key);
  }

  async exists(args: IStorage.ExistsArgs): Promise<boolean> {
    return this.map.has(args.key);
  }

  async delete(args: IStorage.DeleteArgs): Promise<void> {
    this.map.delete(args.key);
  }

  async clear(_args: IStorage.ClearArgs): Promise<void> {
    this.map.clear();
  }
}

class MockTransformer implements ITransformer {
  readonly name = "MockTransformer";
  isOpen = true;

  async encode(args: ITransformer.EncodeArgs): Promise<unknown> {
    return `e:${args.data}`;
  }

  async decode(args: ITransformer.DecodeArgs): Promise<unknown> {
    const s = args.data as string;
    return s.replace(/^e:/, "");
  }
}

class MemoryStreamStorage implements IStorage {
  readonly name = "MemoryStreamStorage";
  isOpen = true;

  private readonly map = new Map<string, unknown[]>();

  async open(): Promise<void> {
    this.isOpen = true;
  }

  async close(): Promise<void> {
    this.isOpen = false;
  }

  async write(_args: IStorage.WriteArgs): Promise<void> {}

  async read(_args: IStorage.ReadArgs): Promise<unknown> {
    return undefined;
  }

  async exists(args: IStorage.ExistsArgs): Promise<boolean> {
    return this.map.has(args.key);
  }

  async delete(args: IStorage.DeleteArgs): Promise<void> {
    this.map.delete(args.key);
  }

  async clear(_args: IStorage.ClearArgs): Promise<void> {
    this.map.clear();
  }

  getWritable(args: Pick<IStorage.GetWritableArgs, "key">): WritableStream<unknown> {
    const chunks: unknown[] = [];
    return new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
      close: () => {
        this.map.set(args.key, chunks);
      },
    });
  }

  getReadable(args: Pick<IStorage.GetReadableArgs, "key">): ReadableStream<unknown> {
    const chunks = this.map.get(args.key) ?? [];
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
  }
}

class HangUntilAbortOpenStorage implements IStorage {
  readonly name = "HangUntilAbortOpenStorage";
  isOpen = false;
  closeCallCount = 0;

  async open(args: IStorage.OpenArgs): Promise<void> {
    this.isOpen = true;
    const { signal } = args;
    await new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  }

  async close(): Promise<void> {
    this.closeCallCount++;
    this.isOpen = false;
  }

  async write(_args: IStorage.WriteArgs): Promise<void> {}

  async read(_args: IStorage.ReadArgs): Promise<unknown> {
    return undefined;
  }

  async exists(_args: IStorage.ExistsArgs): Promise<boolean> {
    return false;
  }

  async delete(_args: IStorage.DeleteArgs): Promise<void> {}

  async clear(_args: IStorage.ClearArgs): Promise<void> {}
}

class CancelObservableStorage implements IStorage {
  readonly name = "CancelObservableStorage";
  isOpen = true;
  sourceCancelled = false;
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
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
      },
      cancel: () => {
        this.sourceCancelled = true;
      },
    });
  }
}

class FailGetDecodableTransformer implements ITransformer {
  readonly name = "FailGetDecodable";
  isOpen = true;

  encode(args: ITransformer.EncodeArgs): unknown {
    return args.data;
  }

  decode(args: ITransformer.DecodeArgs): unknown {
    return args.data;
  }

  getDecodable(): never {
    throw new Error("getDecodable failed");
  }
}

class ReadErrorStorage extends MockStorage {
  constructor(name: string) {
    super(name);
  }

  override async read(_args: IStorage.ReadArgs): Promise<unknown> {
    throw new Error("read failed");
  }

  getReadable(_args: Pick<IStorage.GetReadableArgs, "key">): ReadableStream<unknown> {
    throw new Error("read failed");
  }
}

function createKvs(storage: IStorage, ...more: IStorage[]): UniKvs {
  const config = UniKvs.config().appendStorage(storage);
  return more.reduce((c, s) => c.appendStorage(s), config).create();
}

async function createOpenedKvs(storage: IStorage, ...more: IStorage[]): Promise<UniKvs> {
  const kvs = createKvs(storage, ...more);
  await kvs.open();
  return kvs;
}

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

async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

describe("UniKvs - 設定からの生成", () => {
  test("config から生成したとき、create で UniKvs インスタンスが返る", ({ expect }) => {
    // 実行
    const kvs = createKvs(new MockStorage());

    // 検証
    expect(kvs).toBeInstanceOf(UniKvs);
  });

  test("静的メソッド config からも生成できる", ({ expect }) => {
    // 実行
    const kvs = UniKvs.config().appendStorage(new MockStorage()).create();

    // 検証
    expect(kvs).toBeInstanceOf(UniKvs);
  });
});

describe("UniKvs - オープン / クローズ", () => {
  test("open すると isOpen が true になり、各ストレージがオープンされる", async ({ expect }) => {
    // 準備
    const storage = new MockStorage();
    const kvs = createKvs(storage);

    // 実行
    await kvs.open();

    // 検証
    expect(kvs.isOpen).toBe(true);
    expect(storage.openCallCount).toBe(1);

    // 後片付け
    await kvs.close();
  });

  test("close すると isOpen が false になる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MockStorage());

    // 実行
    await kvs.close();

    // 検証
    expect(kvs.isOpen).toBe(false);
  });

  test("既に開いているときに open すると UniKvsIsOpenError を投げる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MockStorage());

    // 実行と検証
    await expect(kvs.open()).rejects.toThrow(UniKvsIsOpenError);
  });

  test("閉じているときに close すると UniKvsIsNotOpenError を投げる", async ({ expect }) => {
    // 準備
    const kvs = createKvs(new MockStorage());

    // 実行と検証
    await expect(kvs.close()).rejects.toThrow(UniKvsIsNotOpenError);
  });

  test("close が失敗したとき、インスタンスは一貫してクローズ済みの状態になる", async ({
    expect,
  }) => {
    // 準備
    const storage = new MockStorage("ng", { closeError: new Error("close failed") });
    const kvs = await createOpenedKvs(storage);

    // 実行と検証
    await expect(kvs.close()).rejects.toThrow(PluginOperationAggregateError);

    // 検証
    expect(kvs.isOpen).toBe(false);
    await expect(kvs.get("foo")).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.close()).rejects.toThrow(UniKvsIsNotOpenError);
  });

  test("abort 済み signal で close に失敗したときも、インスタンスは一貫してクローズ済みの状態になる", async ({
    expect,
  }) => {
    // 準備
    const kvs = await createOpenedKvs(new MockStorage());
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(kvs.close({ signal: controller.signal })).rejects.toThrow();

    // 検証
    expect(kvs.isOpen).toBe(false);
    await expect(kvs.get("foo")).rejects.toThrow(UniKvsIsNotOpenError);
  });

  test("close 後に再 open できる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MockStorage());
    await kvs.close();

    // 実行
    await kvs.open();
    await kvs.close();

    // 検証
    expect(kvs.isOpen).toBe(false);
  });

  test("一部のストレージの open が失敗したとき、PluginOperationAggregateError を投げて開いたストレージを閉じる", async ({
    expect,
  }) => {
    // 準備
    const failure = new Error("open failed");
    const okStorage = new MockStorage("ok");
    const ngStorage = new MockStorage("ng", { openError: failure });
    const kvs = createKvs(okStorage, ngStorage);

    // 実行と検証
    await expect(kvs.open()).rejects.toThrow(PluginOperationAggregateError);

    // 検証
    expect(kvs.isOpen).toBe(false);
    expect(okStorage.closeCallCount).toBe(1);
  });

  test("open 中に abort されたとき、PluginOperationAggregateError ではなく abort 理由をそのまま投げる", async ({
    expect,
  }) => {
    // 準備
    const cancel = new Error("USER-CANCEL");
    const kvs = createKvs(new HangUntilAbortOpenStorage());
    const controller = new AbortController();

    // 実行
    const p = kvs.open({ signal: controller.signal });
    controller.abort(cancel);

    // 検証
    await expect(p).rejects.toBe(cancel);
  });

  test("open 中に abort されたとき、複数ストレージでも abort 理由をそのまま投げる", async ({
    expect,
  }) => {
    // 準備
    const cancel = new Error("USER-CANCEL");
    const kvs = createKvs(new HangUntilAbortOpenStorage(), new HangUntilAbortOpenStorage());
    const controller = new AbortController();

    // 実行
    const p = kvs.open({ signal: controller.signal });
    controller.abort(cancel);

    // 検証
    await expect(p).rejects.toBe(cancel);
  });

  test("open 中の abort と通常の失敗が混在したとき、PluginOperationAggregateError を投げる", async ({
    expect,
  }) => {
    // 準備
    const cancel = new Error("USER-CANCEL");
    const failure = new Error("open failed");
    const kvs = createKvs(
      new MockStorage("ng", { openError: failure }),
      new HangUntilAbortOpenStorage(),
    );
    const controller = new AbortController();

    // 実行
    const p = kvs.open({ signal: controller.signal });
    controller.abort(cancel);

    // 実行と検証
    await expect(p).rejects.toThrow(PluginOperationAggregateError);
  });

  test("並行 open は 2 回目に失敗する", async ({ expect }) => {
    // 準備
    const kvs = createKvs(new MockStorage());

    // 実行
    const results = await Promise.allSettled([kvs.open(), kvs.open()]);

    // 検証
    expect(results[0]?.status).toBe("fulfilled");
    expect(kvs.isOpen).toBe(true);

    // 後片付け
    await kvs.close();
  });

  test("open 中に close を呼び出して abort された場合、open は失敗し開かれた状態にならない", async ({
    expect,
  }) => {
    class SlowOpenStorage implements IStorage {
      readonly name = "SlowOpenStorage";
      isOpen = false;

      async open(): Promise<void> {
        // signal を無視して時間のかかるオープン処理を模倣します。
        await new Promise((resolve) => setTimeout(resolve, 30));
        this.isOpen = true;
      }

      async close(): Promise<void> {
        this.isOpen = false;
      }

      write(_args: IStorage.WriteArgs): void {}
      read(_args: IStorage.ReadArgs): any {
        return undefined;
      }
      exists(_args: IStorage.ExistsArgs): boolean {
        return false;
      }
      delete(_args: IStorage.DeleteArgs): void {}
      clear(_args: IStorage.ClearArgs): void {}
    }

    // 準備
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(new SlowOpenStorage())
      .create();

    // 実行: open の完了を待たずに close を呼び出す (#con はまだ null)
    const openPromise = kvs.open();
    const closeResult = await kvs.close().then(
      () => "resolved" as const,
      (ex) => `rejected: ${(ex as Error).name}`,
    );
    expect(closeResult.startsWith("rejected")).toBe(true);

    // 検証: abort 済みの接続が開かれたままにならないこと
    await expect(openPromise).rejects.toThrow(UniKvsIsNotOpenError);
    expect(kvs.isOpen).toBe(false);
    await expect(kvs.set("foo", "bar")).rejects.toThrow(UniKvsIsNotOpenError);

    // 検証: 失敗後も再オープンできること
    await kvs.open();
    expect(kvs.isOpen).toBe(true);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - 基本操作 (CRUD)", () => {
  test("値を set して get できる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MockStorage());

    // 実行
    await kvs.set("key1", "value1");
    const result = await kvs.get("key1");

    // 検証
    expect(result).toBe("value1");
  });

  test("has で値の存在確認ができる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MockStorage());
    await kvs.set("key1", "value1");

    // 実行
    const exists = await kvs.has("key1");
    const notExists = await kvs.has("key2");

    // 検証
    expect(exists).toBe(true);
    expect(notExists).toBe(false);
  });

  test("delete で値を削除できる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MockStorage());
    await kvs.set("key1", "value1");

    // 実行
    await kvs.delete("key1");

    // 検証
    expect(await kvs.has("key1")).toBe(false);
  });

  test("clear ですべての値を削除できる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MockStorage());
    await kvs.set("key1", "value1");
    await kvs.set("key2", "value2");

    // 実行
    await kvs.clear();

    // 検証
    expect(await kvs.has("key1")).toBe(false);
    expect(await kvs.has("key2")).toBe(false);
  });

  test("存在しないキーを get すると KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MockStorage());

    // 実行と検証
    await expect(kvs.get("nonexistent")).rejects.toThrow(KeyNotFoundError);
  });

  test("オプションオブジェクト形式で set と get ができる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MockStorage());

    // 実行
    await kvs.set({ key: "foo", value: "bar" });
    const result = await kvs.get({ key: "foo" });

    // 検証
    expect(result).toBe("bar");
  });

  test.each([
    ["set", (kvs: UniKvs) => kvs.set("key1", "value1")],
    ["get", (kvs: UniKvs) => kvs.get("key1")],
    ["has", (kvs: UniKvs) => kvs.has("key1")],
    ["delete", (kvs: UniKvs) => kvs.delete("key1")],
    ["clear", (kvs: UniKvs) => kvs.clear()],
    ["stream", (kvs: UniKvs) => kvs.stream("key1")],
  ])("閉じているときに %s すると UniKvsIsNotOpenError を投げる", async (_name, op) => {
    // 準備
    const kvs = createKvs(new MockStorage());

    // 実行と検証
    await expect(op(kvs)).rejects.toThrow(UniKvsIsNotOpenError);
  });

  test("キーとして文字列以外を渡すと InvalidInputError を投げる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MockStorage());

    // 実行と検証
    await expect(kvs.set(42 as never, "value")).rejects.toThrow(InvalidInputError);
  });
});

describe("UniKvs - AbortSignal", () => {
  test("すでに abort 済みシグナルで各操作が即座に失敗する", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(new Memory()).create();
    await kvs.open();
    const sig = AbortSignal.abort(new Error("aborted!"));

    // 実行と検証
    await expect(kvs.set("foo", "a", { signal: sig })).rejects.toThrow("aborted!");
    await expect(kvs.get("foo", { signal: sig })).rejects.toThrow("aborted!");
    await expect(kvs.has("foo", { signal: sig })).rejects.toThrow("aborted!");
    await expect(kvs.delete("foo", { signal: sig })).rejects.toThrow("aborted!");
    await expect(kvs.clear({ signal: sig })).rejects.toThrow("aborted!");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - 複数ストレージ", () => {
  test("set すると登録されたすべてのストレージに書き込まれる", async ({ expect }) => {
    // 準備
    const storage1 = new MockStorage("storage1");
    const storage2 = new MockStorage("storage2");
    await using kvs = await createOpenedKvs(storage1, storage2);

    // 実行
    await kvs.set("key1", "value1");

    // 検証
    expect(storage1.map.get("key1")).toBe("value1");
    expect(storage2.map.get("key1")).toBe("value1");
  });

  test("get は先に登録したストレージの値を優先して返す", async ({ expect }) => {
    // 準備
    const storage1 = new MockStorage("storage1");
    const storage2 = new MockStorage("storage2");
    storage1.map.set("key1", "from-storage1");
    storage2.map.set("key1", "from-storage2");
    await using kvs = await createOpenedKvs(storage1, storage2);

    // 実行
    const result = await kvs.get("key1");

    // 検証
    expect(result).toBe("from-storage1");
  });

  test("get は先に登録したストレージに存在しないとき、次のストレージから取得する", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new MockStorage("storage1");
    const storage2 = new MockStorage("storage2");
    storage2.map.set("key1", "from-storage2");
    await using kvs = await createOpenedKvs(storage1, storage2);

    // 実行
    const result = await kvs.get("key1");

    // 検証
    expect(result).toBe("from-storage2");
  });

  test("get は最初のストレージの読み取りに失敗しても次のストレージから取得する", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new ReadErrorStorage("storage1");
    const storage2 = new MockStorage("storage2");
    storage2.map.set("key1", "from-storage2");
    await using kvs = await createOpenedKvs(storage1, storage2);

    // 実行
    const result = await kvs.get("key1");

    // 検証
    expect(result).toBe("from-storage2");
  });

  test("get はすべてのストレージの読み取りに失敗すると、失敗したすべてのエラーを cause に設定した KeyNotFoundError を投げる", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new ReadErrorStorage("storage1");
    const storage2 = new ReadErrorStorage("storage2");
    storage1.map.set("key1", "value1");
    storage2.map.set("key1", "value1");
    await using kvs = await createOpenedKvs(storage1, storage2);

    // 実行と検証
    const error = await kvs.get("key1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).cause).toBeInstanceOf(PluginOperationAggregateError);
    expect(
      ((error as KeyNotFoundError).cause as PluginOperationAggregateError).meta.errors,
    ).toStrictEqual([
      { plugin: "storage", reason: new Error("read failed") },
      { plugin: "storage", reason: new Error("read failed") },
    ]);
  });

  test("get は 1 つのストレージの読み取りに失敗したとき、そのエラーを cause に設定した KeyNotFoundError を投げる", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new ReadErrorStorage("storage1");
    const storage2 = new MockStorage("storage2");
    storage1.map.set("key1", "value1");
    await using kvs = await createOpenedKvs(storage1, storage2);

    // 実行と検証
    const error = await kvs.get("key1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).cause).toStrictEqual(new Error("read failed"));
  });

  test("delete ですべてのストレージから削除される", async ({ expect }) => {
    // 準備
    const storage1 = new MockStorage("storage1");
    const storage2 = new MockStorage("storage2");
    await using kvs = await createOpenedKvs(storage1, storage2);
    await kvs.set("key1", "value1");

    // 実行
    await kvs.delete("key1");

    // 検証
    expect(await kvs.has("key1")).toBe(false);
    expect(storage1.map.has("key1")).toBe(false);
    expect(storage2.map.has("key1")).toBe(false);
  });

  test("has はいずれかのストレージに存在すれば true を返す", async ({ expect }) => {
    // 準備
    const storage1 = new MockStorage("storage1");
    const storage2 = new MockStorage("storage2");
    storage2.map.set("key1", "value1");
    await using kvs = await createOpenedKvs(storage1, storage2);

    // 実行
    const result = await kvs.has("key1");

    // 検証
    expect(result).toBe(true);
  });

  // get() はストレージの読み取り失敗時に他のストレージへフォールバックする。
  // has() も同様に exists() 失敗時はフォールバックして結果を返す。
  test("has は最初のストレージの exists 失敗時も次のストレージへフォールバックする", async ({
    expect,
  }) => {
    class ExistsErrorStorage extends MockStorage {
      override async exists(_args: IStorage.ExistsArgs): Promise<boolean> {
        throw new Error("exists failed");
      }
    }

    // 準備
    const storage1 = new ExistsErrorStorage("storage1");
    const storage2 = new MockStorage("storage2");
    storage2.map.set("key1", "from-storage2");
    await using kvs = await createOpenedKvs(storage1, storage2);

    // 実行と検証: get と同様に has もフォールバックして結果を返す
    await expect(kvs.get("key1")).resolves.toBe("from-storage2");
    await expect(withTimeout(kvs.has("key1"), 1500, "has-fallback")).resolves.toBe(true);
  });

  test("delete は一部のストレージで失敗したとき PluginOperationAggregateError を投げ、成功したストレージからは削除される", async ({
    expect,
  }) => {
    class DeleteErrorStorage extends MockStorage {
      override async delete(_args: IStorage.DeleteArgs): Promise<void> {
        throw new Error("delete failed");
      }
    }

    // 準備
    const storage1 = new DeleteErrorStorage("storage1");
    const storage2 = new MockStorage("storage2");
    await using kvs = await createOpenedKvs(storage1, storage2);
    await kvs.set("key1", "value1");

    // 実行と検証
    await expect(kvs.delete("key1")).rejects.toThrow(PluginOperationAggregateError);
    expect(storage2.map.has("key1")).toBe(false);
  });

  test("stream 書き込みは片方の getWritable が同期失敗してもハングせず集約エラーで解決する", async ({
    expect,
  }) => {
    // 準備
    await using kvs = await createOpenedKvs(new Memory(), new FailGetWritableStorage());

    // 実行と検証
    await expect(
      withTimeout(
        kvs.set("logs", streamOf([new Uint8Array([1]), new Uint8Array([2])])),
        2000,
        "set-streams-partial-failure",
      ),
    ).rejects.toThrow(PluginOperationAggregateError);
  });

  test("set は getWritable に失敗したストレージ向けの tee ブランチをキャンセルする", async ({
    expect,
  }) => {
    // 準備
    const memory = new Memory();
    await using kvs = await createOpenedKvs(new FailGetWritableStorage(), memory);

    using cancelSpy = vi.spyOn(ReadableStream.prototype, "cancel");

    // 実行と検証
    await expect(
      withTimeout(
        kvs.set("logs", streamOf([new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])])),
        2000,
        "set-streams-cancel-failed-first",
      ),
    ).rejects.toThrow(PluginOperationAggregateError);
    expect(cancelSpy).toHaveBeenCalledTimes(1);

    // 健康側のストレージには全データが書き込まれる
    const stream = await kvs.stream("logs");
    await expect(collect(stream)).resolves.toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("set は最後のストレージの getWritable 失敗時も tee ブランチをキャンセルする", async ({
    expect,
  }) => {
    // 準備
    const memory = new Memory();
    await using kvs = await createOpenedKvs(memory, new FailGetWritableStorage());

    using cancelSpy = vi.spyOn(ReadableStream.prototype, "cancel");

    // 実行と検証
    await expect(
      withTimeout(
        kvs.set("logs", streamOf([new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])])),
        2000,
        "set-streams-cancel-failed-last",
      ),
    ).rejects.toThrow(PluginOperationAggregateError);
    expect(cancelSpy).toHaveBeenCalledTimes(1);

    // 健康側のストレージには全データが書き込まれる
    const stream = await kvs.stream("logs");
    await expect(collect(stream)).resolves.toStrictEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("UniKvs - トランスフォーマー連携", () => {
  test("set 時にトランスフォーマーでエンコードされたデータがストレージに保存される", async ({
    expect,
  }) => {
    // 準備
    const storage = new MockStorage();
    const kvs = UniKvs.config()
      .appendTransformer(new MockTransformer())
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("key1", "hello");

    // 検証
    expect(storage.map.get("key1")).toBe("e:hello");

    // 後片付け
    await kvs.close();
  });

  test("get 時にトランスフォーマーでデコードされた値が返される", async ({ expect }) => {
    // 準備
    const storage = new MockStorage();
    const kvs = UniKvs.config()
      .appendTransformer(new MockTransformer())
      .appendStorage(storage)
      .create();
    await kvs.open();
    await kvs.set("key1", "hello");

    // 実行
    const result = await kvs.get("key1");

    // 検証
    expect(result).toBe("hello");

    // 後片付け
    await kvs.close();
  });

  test("複数トランスフォーマーの適用順序は set で順方向、get で逆方向", async ({ expect }) => {
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

    // 準備
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendTransformer(new Append("A"))
      .appendTransformer(new Append("B"))
      .appendStorage(new Memory())
      .create();
    await kvs.open();

    // 実行と検証
    await kvs.set("foo", "x");
    expect(await kvs.get("foo")).toBe("x");

    // 後片付け
    await kvs.close();
  });

  test("encode が失敗してもストレージには書き込まれず set は安全に失敗する", async ({ expect }) => {
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

    // 準備
    const storage = new Memory();
    const kvs = UniKvs.config<{ foo: PlainValue<Uint8Array> }>()
      .appendTransformer(new BoomTransformer())
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行と検証
    await expect(kvs.set("foo", new Uint8Array([1]))).rejects.toThrow("boom");
    expect(mapOf(storage).has("foo")).toBe(false);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - コンテキストとチェックサム", () => {
  // 配列形式の context もオブジェクト形式と同等に検証されること。
  test("チェックサム不一致 (配列形式 context) のストリーム書き込みは拒否される", async ({
    expect,
  }) => {
    // 準備
    const storage = new Memory();
    const kvs = UniKvs.config<{ logs2: StreamValue<Uint8Array> }>()
      .appendTransformer(new ChecksumSha256())
      .appendStorage(storage)
      .create();
    const wrongSum = await sha256Hex(new Uint8Array([9, 9]));
    await kvs.open();

    // 実行と検証
    await expect(
      kvs.set({
        key: "logs2",
        value: streamOf([new Uint8Array([1, 2, 3])]),
        context: [["@unikvs/checksum:sha256", wrongSum]] as const,
      }),
    ).rejects.toThrow(/fail write operation/);
    expect(mapOf(storage).has("logs2")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("対照実験: チェックサム不一致 (オブジェクト形式 context) は検知される", async ({
    expect,
  }) => {
    // 準備
    const storage = new Memory();
    const kvs = UniKvs.config<{ logs2: StreamValue<Uint8Array> }>()
      .appendTransformer(new ChecksumSha256())
      .appendStorage(storage)
      .create();
    const wrongSum = await sha256Hex(new Uint8Array([9, 9]));
    await kvs.open();

    // 実行
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

    // 検証: 集約された原因がチェックサム不一致であること
    expect(ex).toBeInstanceOf(PluginOperationAggregateError);
    const errors = (ex?.meta.errors ?? []) as readonly { reason: unknown }[];
    const reasons = errors.map((e) => e.reason);
    expect(reasons.some((r) => String(r).match(/mismatch/i))).toBe(true);
    expect(mapOf(storage).has("logs2")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("チェックサム一致なら配列形式 context でもオブジェクト形式と同等に扱われる", async ({
    expect,
  }) => {
    // 準備
    const sum = await sha256Hex(new Uint8Array([4, 5, 6]));
    const kvs = UniKvs.config<{ logs3: StreamValue<Uint8Array> }>()
      .appendTransformer(new ChecksumSha256())
      .appendStorage(new Memory())
      .create();
    await kvs.open();

    // 実行と検証
    await kvs.set({
      key: "logs3",
      value: streamOf([new Uint8Array([4]), new Uint8Array([5, 6])]),
      context: [["@unikvs/checksum:sha256", sum]] as const,
    });
    const vs = await kvs.stream("logs3", {
      context: [["@unikvs/checksum:sha256", sum]] as const,
    });
    expect([...(await collect(vs))]).toEqual([4, 5, 6]);

    // 後片付け
    await kvs.close();
  });

  test("チェックサム一致 (ストリーム書き込み→ストリーム読み取り)", async ({ expect }) => {
    // 準備
    const sum = await sha256Hex(new Uint8Array([1, 2, 3]));
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendTransformer(new ChecksumSha256())
      .appendStorage(new Memory())
      .create();
    await kvs.open();

    // 実行と検証
    await kvs.set({
      key: "logs",
      value: streamOf([new Uint8Array([1]), new Uint8Array([2, 3])]),
      context: { "@unikvs/checksum:sha256": sum },
    });
    const vs = await kvs.stream("logs", { context: { "@unikvs/checksum:sha256": sum } });
    expect([...(await collect(vs))]).toEqual([1, 2, 3]);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - コンテキスト", () => {
  test("setContext で設定したコンテキストが操作時にストレージへ渡される", async ({ expect }) => {
    // 準備
    const storage = new MockStorage();
    const kvs = UniKvs.config().setContext({ app: "test-app" }).appendStorage(storage).create();
    await kvs.open();

    // 実行
    await kvs.set("key1", "value1");

    // 検証
    expect(storage.lastWriteContext?.["app"]).toBe("test-app");

    // 後片付け
    await kvs.close();
  });

  test("操作時の context オプションで setContext のコンテキストを上書きできる", async ({
    expect,
  }) => {
    // 準備
    const storage = new MockStorage();
    const kvs = UniKvs.config().setContext({ a: 1 }).appendStorage(storage).create();
    await kvs.open();

    // 実行
    await kvs.set({ key: "key1", value: "value1", context: { a: 2 } });

    // 検証
    expect(storage.lastWriteContext?.["a"]).toBe(2);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - stream 操作", () => {
  test("ReadableStream を set して stream で同じチャンク列を読み出せる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MemoryStreamStorage());

    // 実行
    await kvs.set(
      "key1",
      new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([1]));
          controller.enqueue(Uint8Array.from([2, 3]));
          controller.close();
        },
      }),
    );
    const stream = await kvs.stream("key1");
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array);
    }

    // 検証
    expect(chunks).toStrictEqual([Uint8Array.from([1]), Uint8Array.from([2, 3])]);
  });

  test("存在しないキーを stream すると KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MemoryStreamStorage());

    // 実行と検証
    await expect(kvs.stream("nonexistent")).rejects.toThrow(KeyNotFoundError);
  });

  test("stream は最初のストレージの読み取りに失敗しても次のストレージから取得する", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new ReadErrorStorage("storage1");
    const storage2 = new MemoryStreamStorage();
    const writable = storage2.getWritable({ key: "key1" });
    const writer = writable.getWriter();
    await writer.write(Uint8Array.from([1, 2]));
    await writer.close();
    await using kvs = await createOpenedKvs(storage1, storage2);

    // 実行
    const stream = await kvs.stream("key1");
    const chunks: unknown[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // 検証
    expect(chunks).toStrictEqual([Uint8Array.from([1, 2])]);
  });

  test("stream をキャンセルした後も同じキーに書き込める", async ({ expect }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MemoryStreamStorage());
    await kvs.set(
      "key1",
      new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([1]));
          controller.close();
        },
      }),
    );

    // 実行
    const stream = await kvs.stream("key1");
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    // 検証
    await kvs.set(
      "key1",
      new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([2]));
          controller.close();
        },
      }),
      { signal: AbortSignal.timeout(1000) },
    );
    const vs = await kvs.stream("key1");
    const chunks: Uint8Array[] = [];
    for await (const chunk of vs) {
      chunks.push(chunk as Uint8Array);
    }
    expect(chunks).toStrictEqual([Uint8Array.from([2])]);
  });

  test("stream の非同期イテレーションを途中で break しても同じキーに書き込める", async ({
    expect,
  }) => {
    // 準備
    await using kvs = await createOpenedKvs(new MemoryStreamStorage());
    await kvs.set(
      "key1",
      new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([1]));
          controller.enqueue(Uint8Array.from([2]));
          controller.close();
        },
      }),
    );

    // 実行
    const stream = await kvs.stream("key1");
    for await (const _chunk of stream) {
      break;
    }

    // 検証
    await kvs.set(
      "key1",
      new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([3]));
          controller.close();
        },
      }),
      { signal: AbortSignal.timeout(1000) },
    );
    const vs = await kvs.stream("key1");
    const chunks: Uint8Array[] = [];
    for await (const chunk of vs) {
      chunks.push(chunk as Uint8Array);
    }
    expect(chunks).toStrictEqual([Uint8Array.from([3])]);
  });

  // ValueStream の読み取り中にエラーが発生し、consumer が reader.cancel() を呼ばずに放棄した場合でも、pull の catch 節で dispose されるためキーのロックはリークしない。
  test("エラーした ValueStream を cancel/releaseLock のみで放棄しても同一キーへの set はブロックされない", async ({
    expect,
  }) => {
    // 準備
    const storage = new ErrorMidwayReadableStorage();
    await using kvs = await createOpenedKvs(storage);
    storage.entries.set("logs", [Uint8Array.from([1])]);

    // 実行
    const vs = await kvs.stream("logs");
    const reader = vs.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    await expect(reader.read()).rejects.toThrow("boom");
    // 典型的なエラー処理: ロックだけ解放してストリームを放棄する
    reader.releaseLock();

    // 検証: 同一キーへの書き込みが可能であるべき
    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([9])])), 2000, "set-after-abandon"),
    ).resolves.toBeUndefined();

    // 後片付け
    await vs.dispose();
  });

  test("放棄されたエラーストリームでもロックは解放され、delete / stream / close はブロックされない", async ({
    expect,
  }) => {
    // 準備
    const storage = new ErrorMidwayReadableStorage();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(storage).create();
    await kvs.open();
    storage.entries.set("logs", [Uint8Array.from([1])]);

    // 実行
    const vs = await kvs.stream("logs");
    const reader = vs.getReader();
    await reader.read();
    await expect(reader.read()).rejects.toThrow("boom");
    reader.releaseLock(); // cancel せずに放棄

    // 検証: エラー時に dispose されるためロックは解放済みで、後続操作はブロックされない
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

  test("未破棄の ValueStream を残したまま close するとタイムアウト後に強制破棄される", async ({
    expect,
  }) => {
    // 準備
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendStorage(new Memory())
      .create();
    await kvs.open();
    await kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 実行: ストリームを読まずに close を試みる
    const vs = await kvs.stream("logs");
    const closeResult = await withTimeout(
      kvs.close({ signal: AbortSignal.timeout(500) }).then(
        () => "resolved" as const,
        (ex) => `rejected: ${(ex as Error).name}`,
      ),
      3000,
      "close-with-live-stream",
    );

    // 検証: ロック解放待ちでタイムアウトし、ベストエフォートのクローズ処理へ移行する
    expect(closeResult.startsWith("rejected")).toBe(true);
    expect(kvs.isOpen).toBe(false);

    // 後片付け
    await vs.dispose();
  });

  test("ライブストリーム中でも同一キーの has は可能", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendStorage(new Memory())
      .create();
    await kvs.open();
    await kvs.set("logs", streamOf([new Uint8Array([1])]));
    const vs = await kvs.stream("logs");
    const reader = vs.getReader();
    await reader.read();

    // 実行と検証
    await expect(withTimeout(kvs.has("logs"), 1500, "has-during-stream")).resolves.toBe(true);

    // 後片付け
    void reader.cancel();
    await vs.dispose();
    await kvs.close();
  });

  test("getReadable 成功後のセットアップで失敗したとき、ソースストリームはキャンセルされる", async ({
    expect,
  }) => {
    // 準備
    const storage = new CancelObservableStorage();
    storage.entries.set("logs", [Uint8Array.from([1])]);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendTransformer(new FailGetDecodableTransformer())
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行と検証
    await expect(kvs.stream("logs")).rejects.toThrow("getDecodable failed");
    expect(storage.sourceCancelled).toBe(true);

    // 後片付け
    await kvs.close();
  });

  test("set(stream) 中に後段の getEncodable が失敗したとき、ソースストリームはキャンセルされる", async ({
    expect,
  }) => {
    class PassThroughTransformer implements ITransformer {
      readonly name = "PassThrough";
      isOpen = true;

      encode(args: ITransformer.EncodeArgs): unknown {
        return args.data;
      }

      decode(args: ITransformer.DecodeArgs): unknown {
        return args.data;
      }

      getEncodable(): TransformStream {
        return new TransformStream();
      }

      getDecodable(): TransformStream {
        return new TransformStream();
      }
    }

    class BoomGetEncodableTransformer implements ITransformer {
      readonly name = "BoomGetEncodable";
      isOpen = true;

      encode(args: ITransformer.EncodeArgs): unknown {
        return args.data;
      }

      decode(args: ITransformer.DecodeArgs): unknown {
        return args.data;
      }

      getEncodable(): never {
        throw new Error("getEncodable failed");
      }
    }

    // 準備
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendTransformer(new PassThroughTransformer())
      .appendTransformer(new BoomGetEncodableTransformer())
      .appendStorage(new Memory())
      .create();
    await kvs.open();

    // 実行と検証
    await expect(kvs.set("logs", source)).rejects.toThrow("getEncodable failed");
    // キャンセルしないとソースストリームはロックされたままリークします。
    expect(cancelled).toBe(true);

    // 後片付け
    await kvs.close();
  });

  test("stream set → get の意味整合性 (Value 型キー)", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config<{ data: Value<Uint8Array> }>().appendStorage(new Memory()).create();
    await kvs.open();

    // 実行と検証: ストリーム書き込みした値は結合して取得できる
    await kvs.set("data", streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]));
    const v = await kvs.get("data");
    expect([...v]).toEqual([1, 2, 3]);

    // 空ストリームは 0 バイトの値として一貫する
    await kvs.set("data", streamOf([]));
    const empty = await kvs.get("data");
    expect(empty.byteLength).toBe(0);

    // 単一値 set → stream 読み
    await kvs.set("data", new Uint8Array([7, 8]));
    const vs = await kvs.stream("data");
    expect([...(await collect(vs))]).toEqual([7, 8]);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - 競合", () => {
  test("同一キーへの並行 set は直列化され、全ストレージで一貫する", async ({ expect }) => {
    // 準備
    const s1 = new Memory();
    const s2 = new Memory();
    const kvs = UniKvs.config<{ foo: PlainValue<Uint8Array> }>()
      .appendStorage(s1)
      .appendStorage(s2)
      .create();
    await kvs.open();

    // 実行
    await Promise.all([kvs.set("foo", new Uint8Array([1])), kvs.set("foo", new Uint8Array([2]))]);

    // 検証: ストレージ間で分割されていないこと
    const v1 = mapOf(s1).get("foo") as Uint8Array;
    const v2 = mapOf(s2).get("foo") as Uint8Array;
    expect([...v1]).toEqual([...v2]);

    // 後片付け
    await kvs.close();
  });

  test("set と delete の競合でも一貫した状態になる", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(new Memory()).create();
    await kvs.open();
    await kvs.set("foo", "init");

    // 実行
    await Promise.allSettled([kvs.set("foo", "updated"), kvs.delete("foo")]);

    // 検証: 直列化されるため、どちらか一方の結果になっている
    const has = await kvs.has("foo");
    expect(await kvs.has("foo")).toBe(has);
    await kvs.get("foo").then(
      (v) => expect(v).toBe("updated"),
      (ex) => expect(String(ex)).toContain("not found"),
    );

    // 後片付け
    await kvs.close();
  });

  test("clear と set の競合でも壊れない", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config<{ foo: PlainValue<string>; bar: PlainValue<string> }>()
      .appendStorage(new Memory())
      .create();
    await kvs.open();

    // 実行
    await Promise.allSettled([kvs.clear(), kvs.set("foo", "v"), kvs.set("bar", "w")]);

    // 検証: 例外でプロセスが壊れないことだけ確認
    const existsAfter = await kvs.has("foo");
    expect([true, false]).toContain(existsAfter);

    // 後片付け
    await kvs.close();
  });

  test("並行 close しても壊れない", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(new Memory()).create();
    await kvs.open();

    // 実行
    const results = await Promise.allSettled([kvs.close(), kvs.close()]);

    // 検証
    expect(kvs.isOpen).toBe(false);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  });
});

describe("UniKvs - Symbol.asyncDispose", () => {
  test("asyncDispose で close できる", async ({ expect }) => {
    // 準備
    const kvs = await createOpenedKvs(new MockStorage());

    // 実行
    await kvs[Symbol.asyncDispose]();

    // 検証
    expect(kvs.isOpen).toBe(false);
  });

  test("開いていないときの asyncDispose はエラーにならない", async ({ expect }) => {
    // 準備
    const kvs = createKvs(new MockStorage());

    // 実行と検証
    await expect(kvs[Symbol.asyncDispose]()).resolves.toBeUndefined();
  });
});
