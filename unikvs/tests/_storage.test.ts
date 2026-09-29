import type { Variables, IStorage, IReadableStream, IWritableStream } from "@unikvs/core";
import { describe, test } from "vitest";

import UniKvsStorage from "../src/_storage.js";
import {
  StorageIsNotOpenError,
  ReadableStreamNotSupportedError,
  WritableStreamNotSupportedError,
} from "../src/errors.js";

const TEST_VARS: Variables = {};
const TEST_SIGNAL = new AbortController().signal;

/**
 * Map 上にデータを保存し、open/close の呼び出し回数を記録するストレージモックです。
 */
class MockStorage implements IStorage {
  readonly name = "MockStorage";
  isOpen = true;
  readonly map = new Map<string, any>();
  openCallCount = 0;
  closeCallCount = 0;

  async open(_args: IStorage.OpenArgs): Promise<void> {
    this.openCallCount++;
    this.isOpen = true;
  }

  async close(_args: IStorage.CloseArgs): Promise<void> {
    this.closeCallCount++;
    this.isOpen = false;
  }

  async write(args: IStorage.WriteArgs): Promise<void> {
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

describe("UniKvsStorage - 初期化と接続管理", () => {
  test("ラップしたストレージがオープンされているとき、open で open が呼ばれない", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockStorage();
    mock.isOpen = true;
    const storage = new UniKvsStorage(mock);

    // 実行
    await storage.open(TEST_VARS, TEST_SIGNAL);

    // 検証
    expect(mock.openCallCount).toBe(0);
  });

  test("ラップしたストレージがクローズされているとき、open で open が呼ばれる", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockStorage();
    mock.isOpen = false;
    const storage = new UniKvsStorage(mock);

    // 実行
    await storage.open(TEST_VARS, TEST_SIGNAL);

    // 検証
    expect(mock.openCallCount).toBe(1);
  });
});

describe("UniKvsStorage - 基本操作 (CRUD)", () => {
  test("write / read でデータを保存および取得できる", async ({ expect }) => {
    // 準備
    const storage = new UniKvsStorage(new MockStorage());
    await storage.open(TEST_VARS, TEST_SIGNAL);

    // 実行
    await storage.write(TEST_VARS, TEST_SIGNAL, "k1", "v1");
    const result = await storage.read(TEST_VARS, TEST_SIGNAL, "k1");

    // 検証
    expect(result).toBe("v1");
  });

  test("exists がデータの有無を正しく返す", async ({ expect }) => {
    // 準備
    const storage = new UniKvsStorage(new MockStorage());
    await storage.open(TEST_VARS, TEST_SIGNAL);
    await storage.write(TEST_VARS, TEST_SIGNAL, "k1", "v1");

    // 実行
    const exists = await storage.exists(TEST_VARS, TEST_SIGNAL, "k1");
    const notExists = await storage.exists(TEST_VARS, TEST_SIGNAL, "k2");

    // 検証
    expect(exists).toBe(true);
    expect(notExists).toBe(false);
  });

  test("delete でデータが削除される", async ({ expect }) => {
    // 準備
    const storage = new UniKvsStorage(new MockStorage());
    await storage.open(TEST_VARS, TEST_SIGNAL);
    await storage.write(TEST_VARS, TEST_SIGNAL, "k1", "v1");

    // 実行
    await storage.delete(TEST_VARS, TEST_SIGNAL, "k1");

    // 検証
    expect(await storage.exists(TEST_VARS, TEST_SIGNAL, "k1")).toBe(false);
  });

  test("clear で全データが削除される", async ({ expect }) => {
    // 準備
    const storage = new UniKvsStorage(new MockStorage());
    await storage.open(TEST_VARS, TEST_SIGNAL);
    await storage.write(TEST_VARS, TEST_SIGNAL, "k1", "v1");
    await storage.write(TEST_VARS, TEST_SIGNAL, "k2", "v2");

    // 実行
    await storage.clear(TEST_VARS, TEST_SIGNAL);

    // 検証
    expect(await storage.exists(TEST_VARS, TEST_SIGNAL, "k1")).toBe(false);
    expect(await storage.exists(TEST_VARS, TEST_SIGNAL, "k2")).toBe(false);
  });
});

describe("UniKvsStorage - 異常系・エラーハンドリング", () => {
  test("write 時にストレージが閉じていると StorageIsNotOpenError を投げる", async ({ expect }) => {
    // 準備
    const mock = new MockStorage();
    mock.isOpen = false;
    const storage = new UniKvsStorage(mock);

    // 実行と検証
    await expect(storage.write(TEST_VARS, TEST_SIGNAL, "k1", "v1")).rejects.toThrow(
      StorageIsNotOpenError,
    );
  });

  test("read 時にストレージが閉じていると StorageIsNotOpenError を投げる", async ({ expect }) => {
    // 準備
    const mock = new MockStorage();
    mock.isOpen = false;
    const storage = new UniKvsStorage(mock);

    // 実行と検証
    await expect(storage.read(TEST_VARS, TEST_SIGNAL, "k1")).rejects.toThrow(StorageIsNotOpenError);
  });

  test("getReadable でストレージがサポートしていないとき ReadableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockStorage();
    const storage = new UniKvsStorage(mock);
    await storage.open(TEST_VARS, TEST_SIGNAL);

    // 実行と検証
    await expect(storage.getReadable(TEST_VARS, TEST_SIGNAL, "k1")).rejects.toThrow(
      ReadableStreamNotSupportedError,
    );
  });

  test("getWritable でストレージがサポートしていないとき WritableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockStorage();
    const storage = new UniKvsStorage(mock);
    await storage.open(TEST_VARS, TEST_SIGNAL);

    // 実行と検証
    await expect(storage.getWritable(TEST_VARS, TEST_SIGNAL, "k1")).rejects.toThrow(
      WritableStreamNotSupportedError,
    );
  });
});

describe("UniKvsStorage - ストリーム", () => {
  test("getReadable は ReadableStream を継承しない互換オブジェクトも受け入れる", async ({
    expect,
  }) => {
    // 準備
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([1]));
        controller.close();
      },
    });
    const compatible = {
      getReader: source.getReader.bind(source),
      pipeThrough: source.pipeThrough.bind(source),
      pipeTo: source.pipeTo.bind(source),
      tee: source.tee.bind(source),
      cancel: source.cancel.bind(source),
    } as unknown as IReadableStream<Uint8Array>;
    class StreamStorage extends MockStorage {
      getReadable(): IReadableStream {
        return compatible;
      }
    }
    const storage = new UniKvsStorage(new StreamStorage());
    await storage.open(TEST_VARS, TEST_SIGNAL);

    // 実行
    const readable = await storage.getReadable(TEST_VARS, TEST_SIGNAL, "k1");

    // 検証
    const reader = readable.getReader();
    expect(await reader.read()).toStrictEqual({ done: false, value: Uint8Array.from([1]) });
    await reader.cancel();
  });

  test("getWritable は WritableStream を継承しない互換オブジェクトも受け入れる", async ({
    expect,
  }) => {
    // 準備
    const chunks: Uint8Array[] = [];
    const target = new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk);
      },
    });
    const compatible = {
      getWriter: target.getWriter.bind(target),
      abort: target.abort.bind(target),
      close: target.close.bind(target),
    } as unknown as IWritableStream<Uint8Array>;
    class StreamStorage extends MockStorage {
      getWritable(): IWritableStream {
        return compatible;
      }
    }
    const storage = new UniKvsStorage(new StreamStorage());
    await storage.open(TEST_VARS, TEST_SIGNAL);

    // 実行
    const writable = await storage.getWritable(TEST_VARS, TEST_SIGNAL, "k1");
    const writer = writable.getWriter();
    await writer.write(Uint8Array.from([1]));
    await writer.close();

    // 検証
    expect(chunks).toStrictEqual([Uint8Array.from([1])]);
  });
});
