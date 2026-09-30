import type { IStorage } from "@unikvs/core";
import { describe, test as vitest } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import WriteOnly from "../src/write-only.js";

/**
 * WriteOnly から委譲された操作をそのまま保持するストレージです。
 * 内部ストレージへの委譲と、削除の抑止を検証するために使用します。
 */
class TestStorage implements IStorage {
  public readonly name: string = "TestStorage";

  public readonly map: Map<string, any> = new Map();

  public openCount: number = 0;

  public closeCount: number = 0;

  public otherWriteErrorCount: number = 0;

  public get isOpen(): boolean {
    return true;
  }

  public open(): void {
    this.openCount += 1;
  }

  public close(): void {
    this.closeCount += 1;
  }

  public onOtherWriteError(): void {
    this.otherWriteErrorCount += 1;
  }

  public write(args: Pick<IStorage.WriteArgs<any>, "key" | "data">): void {
    this.map.set(args.key, args.data);
  }

  public read(args: Pick<IStorage.ReadArgs, "key">): any {
    if (!this.map.has(args.key)) {
      throw new Error(`Key not found: ${args.key}`);
    }

    return this.map.get(args.key);
  }

  public exists(args: Pick<IStorage.ExistsArgs, "key">): boolean {
    return this.map.has(args.key);
  }

  public delete(args: Pick<IStorage.DeleteArgs, "key">): void {
    this.map.delete(args.key);
  }

  public clear(): void {
    this.map.clear();
  }
}

/**
 * 書き込み用ストリームに対応したテスト用ストレージです。
 * getWritable の委譲と、非対応時の公開抑止を検証するために使用します。
 */
class StreamTestStorage extends TestStorage {
  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "key">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    const chunks: Uint8Array<ArrayBuffer>[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      write: (chunk) => {
        chunks.push(chunk);
      },
      close: () => {
        const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(size);
        let offset = 0;

        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }

        this.map.set(args.key, merged);
      },
    });
  }
}

/**
 * 各テストに新しい内部ストレージと、それをラップした WriteOnly を提供するフィクスチャーです。
 */
const test = vitest.extend<{
  inner: StreamTestStorage;
  storage: WriteOnly;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async inner({}, use) {
    await use(new StreamTestStorage());
  },
  async storage({ inner }, use) {
    await use(new WriteOnly(inner));
  },
});

describe("初期化と接続管理", () => {
  test("isOpen は内部ストレージへ委譲する", ({ expect, inner, storage }) => {
    // 実行と検証
    expect(storage.isOpen).toBe(inner.isOpen);
  });

  test("open を呼び出したとき、内部ストレージの open が呼ばれる", async ({
    expect,
    inner,
    storage,
  }) => {
    // 実行
    await storage.open({ vars: {}, signal: new AbortController().signal });

    // 検証
    expect(inner.openCount).toBe(1);
  });

  test("close を呼び出したとき、内部ストレージの close が呼ばれる", async ({
    expect,
    inner,
    storage,
  }) => {
    // 実行
    await storage.close({ vars: {}, signal: new AbortController().signal });

    // 検証
    expect(inner.closeCount).toBe(1);
  });

  test("onOtherWriteError を呼び出したとき、内部ストレージへ委譲する", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const args = {
      key: "k1",
      vars: {},
      signal: new AbortController().signal,
      error: {} as IStorage.OnOtherWriteErrorArgs["error"],
    };

    // 実行
    await storage.onOtherWriteError(args);

    // 検証
    expect(inner.otherWriteErrorCount).toBe(1);
  });
});

describe("書き込み", () => {
  test("write を呼び出したとき、内部ストレージにデータが保存される", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const key = "k1";
    const data = "v1";

    // 実行
    await storage.write({ key, data, vars: {}, signal: new AbortController().signal });

    // 検証
    expect(inner.map.get(key)).toBe(data);
  });

  test("getWritable で書き込んだとき、内部ストレージに結合されたデータが保存される", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const key = "s1";
    const writable = await storage.getWritable!({
      key,
      vars: {},
      signal: new AbortController().signal,
    });
    const writer = writable.getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    await writer.write(new Uint8Array([3]));
    await writer.close();

    // 検証
    expect(inner.map.get(key)).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("内部ストレージが書き込み用ストリームに対応していないとき、getWritable は未定義になる", ({
    expect,
  }) => {
    // 準備
    const storage = new WriteOnly(new TestStorage());

    // 実行と検証
    expect(storage.getWritable).toBeUndefined();
  });
});

describe("読み出し", () => {
  test("データが保存されていても、read は KeyNotFoundError を投げる", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "k1";
    await storage.write({ key, data: "v1", vars: {}, signal: new AbortController().signal });

    // 実行と検証
    expect(() => storage.read({ key })).toThrow(KeyNotFoundError);
  });

  test("read が投げる KeyNotFoundError はキーを保持する", async ({ expect, storage }) => {
    // 準備
    const key = "k1";
    await storage.write({ key, data: "v1", vars: {}, signal: new AbortController().signal });
    let error: unknown;

    // 実行
    try {
      storage.read({ key });
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({ meta: { key } });
  });

  test("データが保存されていても、getReadable は KeyNotFoundError を投げる", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "k1";
    await storage.write({ key, data: "v1", vars: {}, signal: new AbortController().signal });

    // 実行と検証
    expect(() => storage.getReadable({ key })).toThrow(KeyNotFoundError);
  });

  test("データが保存されていても、exists は false を返す", async ({ expect, inner, storage }) => {
    // 準備
    const key = "k1";
    await storage.write({ key, data: "v1", vars: {}, signal: new AbortController().signal });

    // 実行
    const result = storage.exists({ key });

    // 検証
    expect(inner.map.has(key)).toBe(true);
    expect(result).toBe(false);
  });
});

describe("削除", () => {
  test("allowDelete の既定値は false である", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.allowDelete).toBe(false);
  });

  test("既定では delete を呼び出しても内部ストレージのデータが残る", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const key = "k1";
    inner.map.set(key, "v1");

    // 実行
    await storage.delete({ key, vars: {}, signal: new AbortController().signal });

    // 検証
    expect(inner.map.has(key)).toBe(true);
  });

  test("既定では clear を呼び出しても内部ストレージのデータが残る", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    inner.map.set("k1", "v1");
    inner.map.set("k2", "v2");

    // 実行
    await storage.clear({ vars: {}, signal: new AbortController().signal });

    // 検証
    expect(inner.map.size).toBe(2);
  });

  test("allowDelete が true のとき、delete は内部ストレージへ委譲する", async ({
    expect,
    inner,
  }) => {
    // 準備
    const key = "k1";
    inner.map.set(key, "v1");
    const storage = new WriteOnly(inner, { allowDelete: true });

    // 実行
    await storage.delete({ key, vars: {}, signal: new AbortController().signal });

    // 検証
    expect(inner.map.has(key)).toBe(false);
  });

  test("allowDelete が true のとき、clear は内部ストレージへ委譲する", async ({
    expect,
    inner,
  }) => {
    // 準備
    inner.map.set("k1", "v1");
    inner.map.set("k2", "v2");
    const storage = new WriteOnly(inner, { allowDelete: true });

    // 実行
    await storage.clear({ vars: {}, signal: new AbortController().signal });

    // 検証
    expect(inner.map.size).toBe(0);
  });
});
