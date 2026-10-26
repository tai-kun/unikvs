import type { IStorage, IReadableStream, IWritableStream } from "@unikvs/core";
import { test, describe } from "vite-plus/test";

import {
  GetContext,
  HasContext,
  SetContext,
  OpenContext,
  ClearContext,
  CloseContext,
  DeleteContext,
  StreamContext,
} from "../src/_contexts.js";
import UniKvsStorage from "../src/_storage.js";
import {
  StorageIsNotOpenError,
  ReadableStreamNotSupportedError,
  WritableStreamNotSupportedError,
} from "../src/errors.js";
import { Gate } from "./_helpers.js";

function openContext(): IStorage.OpenContext {
  return new OpenContext({ signal: new AbortController().signal });
}

function closeContext(): IStorage.CloseContext {
  return new CloseContext({ signal: new AbortController().signal });
}

function setContext(key: string): IStorage.WriteContext {
  return new SetContext({
    key,
    signal: new AbortController().signal,
  });
}

function getContext(key: string): IStorage.ReadContext {
  return new GetContext({
    key,
    signal: new AbortController().signal,
  });
}

function hasContext(key: string): IStorage.ExistsContext {
  return new HasContext({
    key,
    signal: new AbortController().signal,
  });
}

function deleteContext(key: string): IStorage.DeleteContext {
  return new DeleteContext({
    key,
    signal: new AbortController().signal,
  });
}

function clearContext(): IStorage.ClearContext {
  return new ClearContext({
    signal: new AbortController().signal,
  });
}

/**
 * Map 上にデータを保存し、open/close の呼び出し回数を記録するストレージモックです。
 */
class MockStorage implements IStorage {
  public readonly name = "MockStorage";

  public isOpen = true;

  public readonly map = new Map<string, any>();

  public openCallCount = 0;

  public closeCallCount = 0;

  public async open(_c: IStorage.OpenContext): Promise<void> {
    this.openCallCount++;
    this.isOpen = true;
  }

  public async close(_c: IStorage.CloseContext): Promise<void> {
    this.closeCallCount++;
    this.isOpen = false;
  }

  public async write(c: IStorage.WriteContext, data: unknown): Promise<void> {
    this.map.set(c.key, data);
  }

  public async read(c: IStorage.ReadContext): Promise<unknown> {
    return this.map.get(c.key);
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    return this.map.has(c.key);
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    this.map.delete(c.key);
  }

  public async clear(_c: IStorage.ClearContext): Promise<void> {
    this.map.clear();
  }
}

describe("UniKvsStorage - 初期化と接続管理", () => {
  test("ラップしたストレージがオープンされているとき、open で open が呼ばれない", async ({
    expect,
  }) => {
    // 準備：
    const mock = new MockStorage();
    mock.isOpen = true;

    const storage = UniKvsStorage.from(mock);

    // 実行：
    await storage.open(openContext());

    // 検証：
    expect(mock.openCallCount).toBe(0);
  });

  test("ラップしたストレージがクローズされているとき、open で open が呼ばれる", async ({
    expect,
  }) => {
    // 準備：
    const mock = new MockStorage();
    mock.isOpen = false;

    const storage = UniKvsStorage.from(mock);

    // 実行：
    await storage.open(openContext());

    // 検証：
    expect(mock.openCallCount).toBe(1);
  });

  test("close を持たないストレージは参照を数えず、外部で閉じられた後の open で再度実 open する", async ({
    expect,
  }) => {
    // 準備 : close を持たないストレージ。
    const mock = new MockStorage();
    mock.isOpen = false;
    // プロトタイプのメソッドは delete できないため、own property を undefined にして close 未定義の分岐を踏みます。
    Object.defineProperty(mock, "close", {
      value: undefined,
      configurable: true,
    });
    expect(Object.getOwnPropertyDescriptor(mock, "close")?.value).toBeUndefined();

    const storage = UniKvsStorage.from(mock);

    // 実行 : open を繰り返す。
    await storage.open(openContext());
    await storage.open(openContext());

    // 検証 : 参照が積み上がらず実 open は 1 回だけ。
    expect(mock.openCallCount).toBe(1);

    // 実行 : 外部要因で閉じられた後に再度 open する。
    mock.isOpen = false;
    await storage.open(openContext());

    // 検証 : 残った参照にスキップされず実 open がやり直される。
    expect(mock.openCallCount).toBe(2);

    // 実行 : close は持たないため no-op。
    await storage.close(closeContext());

    // 検証 : 実体は開いたまま。
    expect(mock.isOpen).toBe(true);
  });

  test("close が同期的に投げても失敗として扱われ、再 open/close できる", async ({ expect }) => {
    // 準備 : close が同期的に投げるストレージ。
    class SyncThrowStorage extends MockStorage {
      public failSync = true;

      public override close(_c: IStorage.CloseContext): Promise<void> {
        this.closeCallCount++;
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (this.failSync) {
          throw new Error("sync close failure");
        }

        this.isOpen = false;

        return Promise.resolve();
      }
    }

    const mock = new SyncThrowStorage();
    mock.isOpen = false;

    const storage = UniKvsStorage.from(mock);
    await storage.open(openContext());

    // 実行と検証 : 同期 throw も close 失敗として記録され、実体は開いたまま。
    await expect(storage.close(closeContext())).rejects.toThrow("sync close failure");

    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(1);

    // 実行 : 失敗状態からの close を再試行する。
    mock.failSync = false;
    await storage.close(closeContext());

    // 検証 : 再試行で閉じられる。
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(2);

    // 検証 : 再度 open して close できる。
    await storage.open(openContext());
    expect(mock.openCallCount).toBe(2);
    await storage.close(closeContext());
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(3);
  });

  test("close 失敗後に新しい open が所有権を引き継いだ場合、retryClose は参照を解放しない", async ({
    expect,
  }) => {
    // 準備 : 最初の close だけ失敗するストレージ。
    class FailOnceStorage extends MockStorage {
      public failNextClose = true;

      public override async close(_c: IStorage.CloseContext): Promise<void> {
        this.closeCallCount++;
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (this.failNextClose) {
          this.failNextClose = false;
          throw new Error("close failed");
        }

        this.isOpen = false;
      }
    }

    const mock = new FailOnceStorage();
    mock.isOpen = false;

    const storage = UniKvsStorage.from(mock);
    await storage.open(openContext());
    await expect(storage.close(closeContext())).rejects.toThrow("close failed");

    // 実行 : 別の利用者が open して所有権を引き継ぐ。
    await storage.open(openContext());

    // 実行 : 失敗した close の再試行は新しい参照を解放しない。
    await storage.retryClose(closeContext());

    // 検証 : 実体は開いたままで、実 close も増えていない。
    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(1);

    // 後片付け : 引き継いだ利用者の close で実体が閉じられる。
    await storage.close(closeContext());
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(2);
  });

  test("実 open 保留中の並行 open でも片方の close で実体は閉じられず、もう片方が操作できる", async ({
    expect,
  }) => {
    // 準備 : 実 open をゲートで保留するストレージ。
    class GatedOpenStorage extends MockStorage {
      public readonly entered = new Gate();

      public readonly release = new Gate();

      public override async open(c: IStorage.OpenContext): Promise<void> {
        this.entered.open();
        await this.release.wait();
        await super.open(c);
      }
    }

    const mock = new GatedOpenStorage();
    mock.isOpen = false;

    const storage = UniKvsStorage.from(mock);

    // 実行 : 1 つ目の実 open を保留したまま 2 つ目の open を並行に開始する。
    const first = storage.open(openContext());

    await mock.entered.wait();
    const second = storage.open(openContext());

    mock.release.open();
    await first;
    await second;

    // 実行と検証 : 片方の close ではまだ利用者が残るため実体は閉じられない。
    await storage.close(closeContext());
    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(0);

    // 検証 : もう片方の利用者は操作を続けられる。
    await storage.write(setContext("k1"), "v1");
    await expect(storage.read(getContext("k1"))).resolves.toBe("v1");

    // 後片付け : 最後の close で実体が閉じられる。
    await storage.close(closeContext());
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(1);
  });

  test("実 open 保留中に 3 つの open が並行しても 2 回の close では閉じられず、3 回目で閉じられる", async ({
    expect,
  }) => {
    // 準備 : 実 open をゲートで保留するストレージ。
    class GatedOpenStorage extends MockStorage {
      public readonly entered = new Gate();

      public readonly release = new Gate();

      public override async open(c: IStorage.OpenContext): Promise<void> {
        this.entered.open();
        await this.release.wait();
        await super.open(c);
      }
    }

    const mock = new GatedOpenStorage();
    mock.isOpen = false;

    const storage = UniKvsStorage.from(mock);

    // 実行 : 1 つ目の実 open を保留したまま 3 つの open を並行に開始する。
    const first = storage.open(openContext());

    await mock.entered.wait();
    const second = storage.open(openContext());
    const third = storage.open(openContext());

    mock.release.open();
    await first;
    await second;
    await third;

    // 実行と検証 : 2 回の close ではまだ利用者が残るため実体は閉じられない。
    await storage.close(closeContext());
    await storage.close(closeContext());
    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(0);

    // 後片付け : 最後の close で実体が閉じられる。
    await storage.close(closeContext());
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(1);
  });

  test("retryClose は進行中の close を待ってから失敗した実 close を再試行する", async ({
    expect,
  }) => {
    // 準備 : 最初の close をゲートで保留してから失敗させるストレージ。
    class GatedFailOnceStorage extends MockStorage {
      public failNextClose = true;

      public readonly entered = new Gate();

      public readonly release = new Gate();

      public override async close(_c: IStorage.CloseContext): Promise<void> {
        this.closeCallCount++;
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (this.failNextClose) {
          this.failNextClose = false;
          this.entered.open();
          await this.release.wait();
          throw new Error("close failed");
        }

        this.isOpen = false;
      }
    }

    const mock = new GatedFailOnceStorage();
    mock.isOpen = false;

    const storage = UniKvsStorage.from(mock);
    await storage.open(openContext());

    // 実行 : 先行 close の完了前に retryClose を開始する。
    const closing = storage.close(closeContext());

    await mock.entered.wait();
    const retrying = storage.retryClose(closeContext());

    mock.release.open();

    // 検証 : 先行 close の失敗を待ってから再試行し、実体は閉じられる。
    await expect(closing).rejects.toThrow("close failed");
    await retrying;
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(2);
  });

  test("retryClose は進行中の open が所有権を引き継いだときは実 close しない", async ({
    expect,
  }) => {
    // 準備 : close は実体を閉じてから失敗し、次の open をゲートで保留するストレージ。
    class GatedOpenStorage extends MockStorage {
      public failNextClose = true;

      public gateOpens = false;

      public readonly entered = new Gate();

      public readonly release = new Gate();

      public override async open(c: IStorage.OpenContext): Promise<void> {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (this.gateOpens) {
          this.entered.open();
          await this.release.wait();
        }

        await super.open(c);
      }

      public override async close(_c: IStorage.CloseContext): Promise<void> {
        this.closeCallCount++;
        this.isOpen = false;
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (this.failNextClose) {
          this.failNextClose = false;
          throw new Error("close failed");
        }
      }
    }

    const mock = new GatedOpenStorage();
    mock.isOpen = false;

    const storage = UniKvsStorage.from(mock);
    await storage.open(openContext());
    await expect(storage.close(closeContext())).rejects.toThrow("close failed");

    // 実行 : 所有権を引き継ぐ実 open を保留したまま retryClose を開始する。
    mock.gateOpens = true;
    const opening = storage.open(openContext());

    await mock.entered.wait();
    const retrying = storage.retryClose(closeContext());

    mock.release.open();
    await opening;
    await retrying;

    // 検証 : open が所有権を引き継いだため retryClose は実 close しない。
    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(1);

    // 後片付け : 引き継いだ利用者の close で実体が閉じられる。
    await storage.close(closeContext());
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(2);
  });

  test("retryClose は実体が既に閉じられているとき失敗状態だけを解消する", async ({ expect }) => {
    // 準備 : 実体を閉じてから失敗するストレージ。
    class CloseThenThrowStorage extends MockStorage {
      public failOnce = true;

      public override async close(_c: IStorage.CloseContext): Promise<void> {
        this.closeCallCount++;
        this.isOpen = false;
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (this.failOnce) {
          this.failOnce = false;
          throw new Error("close failed");
        }
      }
    }

    const mock = new CloseThenThrowStorage();
    mock.isOpen = false;

    const storage = UniKvsStorage.from(mock);
    await storage.open(openContext());
    await expect(storage.close(closeContext())).rejects.toThrow("close failed");

    // 実行 : 実体が閉じられた状態で retryClose する。
    await storage.retryClose(closeContext());

    // 検証 : 実 close はやり直されず、失敗状態も解消されている。
    expect(mock.closeCallCount).toBe(1);
    expect(mock.isOpen).toBe(false);
    mock.isOpen = true;
    await storage.close(closeContext());
    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(1);
  });
});

describe("UniKvsStorage - 基本操作 (CRUD)", () => {
  test("write / read でデータを保存および取得できる", async ({ expect }) => {
    // 準備：
    const storage = UniKvsStorage.from(new MockStorage());
    await storage.open(openContext());

    // 実行：
    await storage.write(setContext("k1"), "v1");

    const result = await storage.read(getContext("k1"));

    // 検証：
    expect(result).toBe("v1");
  });

  test("exists がデータの有無を正しく返す", async ({ expect }) => {
    // 準備：
    const storage = UniKvsStorage.from(new MockStorage());
    await storage.open(openContext());
    await storage.write(setContext("k1"), "v1");

    // 実行：
    const exists = await storage.exists(hasContext("k1"));
    const notExists = await storage.exists(hasContext("k2"));

    // 検証：
    expect(exists).toBe(true);
    expect(notExists).toBe(false);
  });

  test("delete でデータが削除される", async ({ expect }) => {
    // 準備：
    const storage = UniKvsStorage.from(new MockStorage());
    await storage.open(openContext());
    await storage.write(setContext("k1"), "v1");

    // 実行：
    await storage.delete(deleteContext("k1"));

    // 検証：
    await expect(storage.exists(hasContext("k1"))).resolves.toBe(false);
  });

  test("clear で全データが削除される", async ({ expect }) => {
    // 準備：
    const storage = UniKvsStorage.from(new MockStorage());
    await storage.open(openContext());
    await storage.write(setContext("k1"), "v1");
    await storage.write(setContext("k2"), "v2");

    // 実行：
    await storage.clear(clearContext());

    // 検証：
    await expect(storage.exists(hasContext("k1"))).resolves.toBe(false);
    await expect(storage.exists(hasContext("k2"))).resolves.toBe(false);
  });
});

describe("UniKvsStorage - 異常系・エラーハンドリング", () => {
  test("write 時にストレージが閉じていると StorageIsNotOpenError を投げる", async ({ expect }) => {
    // 準備：
    const mock = new MockStorage();
    mock.isOpen = false;

    const storage = UniKvsStorage.from(mock);

    // 実行と検証：
    await expect(storage.write(setContext("k1"), "v1")).rejects.toThrow(StorageIsNotOpenError);
  });

  test("read 時にストレージが閉じていると StorageIsNotOpenError を投げる", async ({ expect }) => {
    // 準備：
    const mock = new MockStorage();
    mock.isOpen = false;

    const storage = UniKvsStorage.from(mock);

    // 実行と検証：
    await expect(storage.read(getContext("k1"))).rejects.toThrow(StorageIsNotOpenError);
  });

  test("getReadable でストレージがサポートしていないとき ReadableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const mock = new MockStorage();
    const storage = UniKvsStorage.from(mock);
    await storage.open(openContext());

    // 実行と検証：
    const c = new StreamContext({
      key: "k1",
      signal: new AbortController().signal,
    });
    await expect(storage.getReadable(c)).rejects.toThrow(ReadableStreamNotSupportedError);
  });

  test("getWritable でストレージがサポートしていないとき WritableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const mock = new MockStorage();
    const storage = UniKvsStorage.from(mock);
    await storage.open(openContext());

    // 実行と検証：
    const c = new SetContext({
      key: "k1",
      signal: new AbortController().signal,
    });
    await expect(storage.getWritable(c)).rejects.toThrow(WritableStreamNotSupportedError);
  });
});

describe("UniKvsStorage - ストリーム", () => {
  test("getReadable は ReadableStream を継承しない互換オブジェクトも受け入れる", async ({
    expect,
  }) => {
    // 準備：
    const source = new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(Uint8Array.from([1]));
        controller.close();
      },
    });
    const compatible = {
      tee: source.tee.bind(source),
      cancel: source.cancel.bind(source),
      pipeTo: source.pipeTo.bind(source),
      getReader: source.getReader.bind(source),
      pipeThrough: source.pipeThrough.bind(source),
    } as unknown as IReadableStream<Uint8Array>;

    class StreamStorage extends MockStorage {
      public getReadable(): IReadableStream {
        return compatible;
      }
    }

    const storage = UniKvsStorage.from(new StreamStorage());
    await storage.open(openContext());

    // 実行：
    const c = new StreamContext({
      key: "k1",
      signal: new AbortController().signal,
    });
    const readable = await storage.getReadable(c);

    // 検証：
    const reader = readable.getReader();
    await expect(reader.read()).resolves.toStrictEqual({
      done: false,
      value: Uint8Array.from([1]),
    });
    await reader.cancel();
  });

  test("getWritable は WritableStream を継承しない互換オブジェクトも受け入れる", async ({
    expect,
  }) => {
    // 準備：
    const chunks: Uint8Array[] = [];
    const target = new WritableStream<Uint8Array>({
      write(chunk): void {
        chunks.push(chunk);
      },
    });
    const compatible = {
      abort: target.abort.bind(target),
      close: target.close.bind(target),
      getWriter: target.getWriter.bind(target),
    } as unknown as IWritableStream<Uint8Array>;

    class StreamStorage extends MockStorage {
      public getWritable(): IWritableStream {
        return compatible;
      }
    }

    const storage = UniKvsStorage.from(new StreamStorage());
    await storage.open(openContext());

    // 実行：
    const c = new SetContext({
      key: "k1",
      signal: new AbortController().signal,
    });
    const writable = await storage.getWritable(c);
    const writer = writable.getWriter();
    await writer.write(Uint8Array.from([1]));
    await writer.close();

    // 検証：
    expect(chunks).toStrictEqual([Uint8Array.from([1])]);
  });
});
