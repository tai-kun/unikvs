import type { Context, IStorage, ITransformer } from "@unikvs/core";
import { describe, expect, test } from "vitest";

import {
  InvalidInputError,
  KeyNotFoundError,
  PluginOperationAggregateError,
  UniKvsIsNotOpenError,
  UniKvsIsOpenError,
} from "../src/errors.js";
import UniKvs from "../src/unikvs.js";

class MockStorage implements IStorage {
  readonly name: string;
  isOpen = false;
  openCallCount = 0;
  closeCallCount = 0;
  lastWriteContext: Context | undefined;

  readonly map = new Map<string, unknown>();

  private readonly openError: { error: unknown } | undefined;

  constructor(name = "MockStorage", options: { openError?: unknown } = {}) {
    this.name = name;
    this.openError = "openError" in options ? { error: options.openError } : undefined;
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

function createKvs(storage: IStorage, ...more: IStorage[]): UniKvs {
  const config = UniKvs.config().appendStorage(storage);
  return more.reduce((c, s) => c.appendStorage(s), config).create();
}

async function createOpenedKvs(storage: IStorage, ...more: IStorage[]): Promise<UniKvs> {
  const kvs = createKvs(storage, ...more);
  await kvs.open();
  return kvs;
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
