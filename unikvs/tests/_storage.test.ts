import type { IStorage, IReadableStream, IWritableStream } from "@unikvs/core";
import { describe, test } from "vitest";

import PipelineContext from "../src/_context.js";
import UniKvsStorage from "../src/_storage.js";
import {
  StorageIsNotOpenError,
  ReadableStreamNotSupportedError,
  WritableStreamNotSupportedError,
} from "../src/errors.js";

function openContext(): IStorage.OpenContext {
  return new PipelineContext({ action: "open" }) as IStorage.OpenContext;
}

function setContext(key: string): IStorage.WriteContext {
  return new PipelineContext({ action: "set", key }) as IStorage.WriteContext;
}

function getContext(key: string): IStorage.ReadContext {
  return new PipelineContext({ action: "get", key }) as IStorage.ReadContext;
}

function hasContext(key: string): IStorage.ExistsContext {
  return new PipelineContext({ action: "has", key }) as IStorage.ExistsContext;
}

function deleteContext(key: string): IStorage.DeleteContext {
  return new PipelineContext({ action: "delete", key }) as IStorage.DeleteContext;
}

function clearContext(): IStorage.ClearContext {
  return new PipelineContext({ action: "clear", key: "" }) as IStorage.ClearContext;
}

/**
 * Map 上にデータを保存し、open/close の呼び出し回数を記録するストレージモックです。
 */
class MockStorage implements IStorage {
  readonly name = "MockStorage";
  isOpen = true;
  readonly map = new Map<string, any>();
  openCallCount = 0;
  closeCallCount = 0;

  async open(_c: IStorage.OpenContext): Promise<void> {
    this.openCallCount++;
    this.isOpen = true;
  }

  async close(_c: IStorage.CloseContext): Promise<void> {
    this.closeCallCount++;
    this.isOpen = false;
  }

  async write(c: IStorage.WriteContext, data: unknown): Promise<void> {
    this.map.set(c.key, data);
  }

  async read(c: IStorage.ReadContext): Promise<unknown> {
    return this.map.get(c.key);
  }

  async exists(c: IStorage.ExistsContext): Promise<boolean> {
    return this.map.has(c.key);
  }

  async delete(c: IStorage.DeleteContext): Promise<void> {
    this.map.delete(c.key);
  }

  async clear(_c: IStorage.ClearContext): Promise<void> {
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
    await storage.open(openContext());

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
    await storage.open(openContext());

    // 検証
    expect(mock.openCallCount).toBe(1);
  });
});

describe("UniKvsStorage - 基本操作 (CRUD)", () => {
  test("write / read でデータを保存および取得できる", async ({ expect }) => {
    // 準備
    const storage = new UniKvsStorage(new MockStorage());
    await storage.open(openContext());

    // 実行
    await storage.write(setContext("k1"), "v1");
    const result = await storage.read(getContext("k1"));

    // 検証
    expect(result).toBe("v1");
  });

  test("exists がデータの有無を正しく返す", async ({ expect }) => {
    // 準備
    const storage = new UniKvsStorage(new MockStorage());
    await storage.open(openContext());
    await storage.write(setContext("k1"), "v1");

    // 実行
    const exists = await storage.exists(hasContext("k1"));
    const notExists = await storage.exists(hasContext("k2"));

    // 検証
    expect(exists).toBe(true);
    expect(notExists).toBe(false);
  });

  test("delete でデータが削除される", async ({ expect }) => {
    // 準備
    const storage = new UniKvsStorage(new MockStorage());
    await storage.open(openContext());
    await storage.write(setContext("k1"), "v1");

    // 実行
    await storage.delete(deleteContext("k1"));

    // 検証
    expect(await storage.exists(hasContext("k1"))).toBe(false);
  });

  test("clear で全データが削除される", async ({ expect }) => {
    // 準備
    const storage = new UniKvsStorage(new MockStorage());
    await storage.open(openContext());
    await storage.write(setContext("k1"), "v1");
    await storage.write(setContext("k2"), "v2");

    // 実行
    await storage.clear(clearContext());

    // 検証
    expect(await storage.exists(hasContext("k1"))).toBe(false);
    expect(await storage.exists(hasContext("k2"))).toBe(false);
  });
});

describe("UniKvsStorage - 異常系・エラーハンドリング", () => {
  test("write 時にストレージが閉じていると StorageIsNotOpenError を投げる", async ({ expect }) => {
    // 準備
    const mock = new MockStorage();
    mock.isOpen = false;
    const storage = new UniKvsStorage(mock);

    // 実行と検証
    await expect(storage.write(setContext("k1"), "v1")).rejects.toThrow(StorageIsNotOpenError);
  });

  test("read 時にストレージが閉じていると StorageIsNotOpenError を投げる", async ({ expect }) => {
    // 準備
    const mock = new MockStorage();
    mock.isOpen = false;
    const storage = new UniKvsStorage(mock);

    // 実行と検証
    await expect(storage.read(getContext("k1"))).rejects.toThrow(StorageIsNotOpenError);
  });

  test("getReadable でストレージがサポートしていないとき ReadableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockStorage();
    const storage = new UniKvsStorage(mock);
    await storage.open(openContext());

    // 実行と検証
    const c = new PipelineContext({
      action: "stream",
      key: "k1",
    }) as IStorage.GetReadableContext;
    await expect(storage.getReadable(c)).rejects.toThrow(ReadableStreamNotSupportedError);
  });

  test("getWritable でストレージがサポートしていないとき WritableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockStorage();
    const storage = new UniKvsStorage(mock);
    await storage.open(openContext());

    // 実行と検証
    const c = new PipelineContext({
      action: "set",
      key: "k1",
    }) as IStorage.GetWritableContext;
    await expect(storage.getWritable(c)).rejects.toThrow(WritableStreamNotSupportedError);
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
    await storage.open(openContext());

    // 実行
    const c = new PipelineContext({
      action: "stream",
      key: "k1",
    }) as IStorage.GetReadableContext;
    const readable = await storage.getReadable(c);

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
    await storage.open(openContext());

    // 実行
    const c = new PipelineContext({
      action: "set",
      key: "k1",
    }) as IStorage.GetWritableContext;
    const writable = await storage.getWritable(c);
    const writer = writable.getWriter();
    await writer.write(Uint8Array.from([1]));
    await writer.close();

    // 検証
    expect(chunks).toStrictEqual([Uint8Array.from([1])]);
  });
});
