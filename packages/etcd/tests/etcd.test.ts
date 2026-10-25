import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  collectBytes,
  abortedSignal,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createAllByteValues,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { vi, test, expect, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import Etcd from "../src/etcd.js";
import { closeStorage, createStorage, FakeEtcdClient } from "./_helpers.js";

describe("初期化と接続管理", () => {
  test("ストレージ名は Etcd である", async () => {
    const { storage } = await createStorage();

    try {
      expect(storage.name).toBe("Etcd");
    } finally {
      await closeStorage(storage);
    }
  });

  test("既定の keyPrefix は unikvs: である", async () => {
    const client = new FakeEtcdClient();
    const storage = new Etcd({ client });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      await storage.write(
        createSetContext("default-prefix.bin", {
          signal: new AbortController().signal,
        }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      expect([...client.store.keys()]).toStrictEqual(["unikvs:default-prefix.bin"]);
    } finally {
      await closeStorage(storage);
    }
  });

  test("初期状態のとき、isOpen は false である", () => {
    const unopened = new Etcd({ client: new FakeEtcdClient() });
    expect(unopened.isOpen).toBe(false);
  });

  test("open を実行したとき、isOpen が true になる", async () => {
    const { storage } = await createStorage();

    try {
      expect(storage.isOpen).toBe(true);
    } finally {
      await closeStorage(storage);
    }
  });

  test("close を呼び出すと、isOpen が false に戻る", async () => {
    const { storage } = await createStorage();
    await storage.close(createCloseContext() as IStorage.CloseContext);
    expect(storage.isOpen).toBe(false);
  });

  test("注入したクライアントは close しても破棄されない", async () => {
    const { client, storage } = await createStorage();
    await storage.close(createCloseContext() as IStorage.CloseContext);
    expect(storage.isOpen).toBe(false);
    expect(client.closeCalls).toBe(0);
  });

  test("close を 2 回呼び出すと 2 回目は TypeError で拒否される", async () => {
    const { storage } = await createStorage();
    await storage.close(createCloseContext() as IStorage.CloseContext);
    await expect(storage.close(createCloseContext() as IStorage.CloseContext)).rejects.toThrow(
      TypeError,
    );
  });

  test("open を 2 回呼び出しても isOpen は true のままで操作できる", async () => {
    const { signal, storage } = await createStorage();

    try {
      const data = new TextEncoder().encode("double open");

      await storage.open(createOpenContext() as IStorage.OpenContext);
      await storage.write(
        createSetContext("double-open.txt", { signal }) as IStorage.WriteContext,
        data,
      );

      expect(storage.isOpen).toBe(true);
      await expect(
        storage.read(createGetContext("double-open.txt", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(data);
    } finally {
      await closeStorage(storage);
    }
  });

  test("close 後に open し直しても注入クライアントのデータは残る", async () => {
    const { signal, storage } = await createStorage();

    try {
      const data = new Uint8Array([9, 8, 7, 6]);
      await storage.write(
        createSetContext("reopen.bin", { signal }) as IStorage.WriteContext,
        data,
      );

      await storage.close(createCloseContext() as IStorage.CloseContext);
      await storage.open(createOpenContext() as IStorage.OpenContext);

      expect(storage.isOpen).toBe(true);
      await expect(
        storage.read(createGetContext("reopen.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(data);
    } finally {
      await closeStorage(storage);
    }
  });

  test("close 後の操作は TypeError で拒否される", async () => {
    const { signal, storage } = await createStorage();
    await storage.close(createCloseContext() as IStorage.CloseContext);
    await expect(
      storage.write(
        createSetContext("after-close.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.read(createGetContext("after-close.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.exists(createHasContext("after-close.bin", { signal }) as IStorage.ExistsContext),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.delete(createDeleteContext("after-close.bin", { signal }) as IStorage.DeleteContext),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).rejects.toThrow(TypeError);
    expect(() =>
      storage.getWritable(
        createSetContext("after-close.bin", { signal }) as IStorage.GetWritableContext,
      ),
    ).toThrow(TypeError);
    expect(() =>
      storage.getReadable(
        createStreamContext("after-close.bin", { signal }) as IStorage.GetReadableContext,
      ),
    ).toThrow(TypeError);
  });

  test("プレフィックスが異なるインスタンスは同じキーを共有しない", async () => {
    // 同じバックエンドを共有し、キー空間の分離だけを検証する。
    const client = new FakeEtcdClient();
    const first = await createStorage({ client });
    const second = await createStorage({ client });

    try {
      await first.storage.write(
        createSetContext("isolated.bin", { signal: first.signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      await expect(
        second.storage.exists(
          createHasContext("isolated.bin", { signal: second.signal }) as IStorage.ExistsContext,
        ),
      ).resolves.toBe(false);
      await expect(
        first.storage.exists(
          createHasContext("isolated.bin", { signal: first.signal }) as IStorage.ExistsContext,
        ),
      ).resolves.toBe(true);
    } finally {
      await closeStorage(first.storage);
      await closeStorage(second.storage);
    }
  });

  test("namespace が異なると同じ keyPrefix でも分離される", async () => {
    // 同じバックエンドを共有し、namespace と keyPrefix の連結結果を検証する。
    const client = new FakeEtcdClient();
    const keyPrefix = `unikvs-test-${crypto.randomUUID()}:`;
    const first = await createStorage({
      client,
      keyPrefix,
      namespace: "tenant-a/",
    });
    const second = await createStorage({
      client,
      keyPrefix,
      namespace: "tenant-b/",
    });

    try {
      await first.storage.write(
        createSetContext("config.json", { signal: first.signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      expect(client.store.has(`tenant-a/${keyPrefix}config.json`)).toBe(true);
      expect(client.store.has(`tenant-b/${keyPrefix}config.json`)).toBe(false);
      await expect(
        second.storage.exists(
          createHasContext("config.json", { signal: second.signal }) as IStorage.ExistsContext,
        ),
      ).resolves.toBe(false);
      await expect(
        first.storage.exists(
          createHasContext("config.json", { signal: first.signal }) as IStorage.ExistsContext,
        ),
      ).resolves.toBe(true);
    } finally {
      await closeStorage(first.storage);
      await closeStorage(second.storage);
    }
  });
});

describe("基本操作 (CRUD)", () => {
  test("書き込んだデータが Uint8Array として正しく返される", async () => {
    const { signal, storage } = await createStorage();

    try {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.write(
        createSetContext("read-test.bin", { signal }) as IStorage.WriteContext,
        data,
      );

      const result = await storage.read(
        createGetContext("read-test.bin", { signal }) as IStorage.ReadContext,
      );
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toStrictEqual(data);
    } finally {
      await closeStorage(storage);
    }
  });

  test("全 256 種類のバイト値を含むデータが byte-for-byte で往復する", async () => {
    const { signal, storage } = await createStorage();

    try {
      const data = createAllByteValues(1024);
      await storage.write(
        createSetContext("all-byte-values.bin", { signal }) as IStorage.WriteContext,
        data,
      );

      const result = await storage.read(
        createGetContext("all-byte-values.bin", { signal }) as IStorage.ReadContext,
      );
      expect(bytesEqual(result, data)).toBe(true);
    } finally {
      await closeStorage(storage);
    }
  });

  test("0 バイトのデータも往復し exists が true になる", async () => {
    const { signal, storage } = await createStorage();

    try {
      await storage.write(
        createSetContext("zero-length.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array(0),
      );

      await expect(
        storage.exists(createHasContext("zero-length.bin", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(true);
      await expect(
        storage.read(createGetContext("zero-length.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new Uint8Array(0));
    } finally {
      await closeStorage(storage);
    }
  });

  test("存在しないキーの read は KeyNotFoundError になる", async () => {
    const { signal, storage } = await createStorage();

    try {
      await expect(
        storage.read(createGetContext("missing.bin", { signal }) as IStorage.ReadContext),
      ).rejects.toThrow(KeyNotFoundError);
    } finally {
      await closeStorage(storage);
    }
  });

  test("存在しないキーの exists は false になる", async () => {
    const { signal, storage } = await createStorage();

    try {
      await expect(
        storage.exists(createHasContext("non-existent.txt", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await closeStorage(storage);
    }
  });

  test("クライアントの取得エラーは KeyNotFoundError に変換されずに伝播する", async () => {
    const { client, signal, storage } = await createStorage();
    const failure = new Error("etcd unavailable");
    const spy = vi.spyOn(client, "get").mockRejectedValue(failure);

    try {
      await expect(
        storage.read(createGetContext("unavailable.bin", { signal }) as IStorage.ReadContext),
      ).rejects.toBe(failure);
      await expect(
        storage.exists(createHasContext("unavailable.bin", { signal }) as IStorage.ExistsContext),
      ).rejects.toBe(failure);
    } finally {
      spy.mockRestore();
      await closeStorage(storage);
    }
  });

  test("削除を 2 回行っても 2 回目はエラーにならない", async () => {
    const { signal, storage } = await createStorage();

    try {
      await storage.write(
        createSetContext("delete-twice.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
      await storage.delete(
        createDeleteContext("delete-twice.bin", { signal }) as IStorage.DeleteContext,
      );

      await expect(
        storage.delete(
          createDeleteContext("delete-twice.bin", { signal }) as IStorage.DeleteContext,
        ),
      ).resolves.toBeUndefined();
      await expect(
        storage.exists(createHasContext("delete-twice.bin", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await closeStorage(storage);
    }
  });

  test("上書きで長さが変わっても全体が置き換わる", async () => {
    const { signal, storage } = await createStorage();

    try {
      const longData = createAllByteValues(1024);
      const shortData = new Uint8Array([1, 2, 3]);
      await storage.write(
        createSetContext("shrink.bin", { signal }) as IStorage.WriteContext,
        longData,
      );
      await storage.write(
        createSetContext("shrink.bin", { signal }) as IStorage.WriteContext,
        shortData,
      );
      await expect(
        storage.read(createGetContext("shrink.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(shortData);
    } finally {
      await closeStorage(storage);
    }
  });

  test("clear を実行したとき、プレフィックス配下の全データが削除される", async () => {
    const { client, signal, storage } = await createStorage();

    try {
      await storage.write(
        createSetContext("file1.txt", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
      await storage.write(
        createSetContext("file2.txt", { signal }) as IStorage.WriteContext,
        new Uint8Array([2]),
      );

      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      await expect(
        storage.exists(createHasContext("file1.txt", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
      await expect(
        storage.exists(createHasContext("file2.txt", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
      expect(client.store.size).toBe(0);
    } finally {
      await closeStorage(storage);
    }
  });

  test("clear は名前空間を含む接頭辞だけを deletePrefix に渡す", async () => {
    // 同じバックエンドを共有し、clear が他の名前空間へ波及しないことを検証する。
    const client = new FakeEtcdClient();
    const keyPrefix = "unikvs-test:";
    const first = await createStorage({
      client,
      keyPrefix,
      namespace: "tenant-a/",
    });
    const second = await createStorage({
      client,
      keyPrefix,
      namespace: "tenant-b/",
    });

    try {
      await first.storage.write(
        createSetContext("a.bin", { signal: first.signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
      await second.storage.write(
        createSetContext("b.bin", { signal: second.signal }) as IStorage.WriteContext,
        new Uint8Array([2]),
      );

      await first.storage.clear(
        createClearContext("", { signal: first.signal }) as IStorage.ClearContext,
      );

      expect(client.deletedPrefixes).toStrictEqual([`tenant-a/${keyPrefix}`]);
      await expect(
        first.storage.exists(
          createHasContext("a.bin", { signal: first.signal }) as IStorage.ExistsContext,
        ),
      ).resolves.toBe(false);
      await expect(
        second.storage.read(
          createGetContext("b.bin", { signal: second.signal }) as IStorage.ReadContext,
        ),
      ).resolves.toStrictEqual(new Uint8Array([2]));
    } finally {
      await closeStorage(first.storage);
      await closeStorage(second.storage);
    }
  });

  test("deletePrefix 未対応でも getAll と delete で clear できる", async () => {
    const { client, signal, storage } = await createStorage({ supportsDeletePrefix: false });

    try {
      expect(client.deletePrefix).toBeUndefined();
      await storage.write(
        createSetContext("before-clear-1.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
      await storage.write(
        createSetContext("before-clear-2.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([2]),
      );

      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
      await storage.write(
        createSetContext("after-clear.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([3]),
      );

      await expect(
        storage.exists(
          createHasContext("before-clear-1.bin", { signal }) as IStorage.ExistsContext,
        ),
      ).resolves.toBe(false);
      await expect(
        storage.exists(
          createHasContext("before-clear-2.bin", { signal }) as IStorage.ExistsContext,
        ),
      ).resolves.toBe(false);
      await expect(
        storage.read(createGetContext("after-clear.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new Uint8Array([3]));
    } finally {
      await closeStorage(storage);
    }
  });

  test("中断済みシグナルの操作は中断理由で拒否される", async () => {
    const { storage } = await createStorage();

    try {
      const reason = new Error("独自の中断理由");
      const aborted = abortedSignal(reason);
      await expect(
        storage.write(
          createSetContext("aborted.bin", { signal: aborted }) as IStorage.WriteContext,
          new Uint8Array([1]),
        ),
      ).rejects.toBe(reason);
      await expect(
        storage.read(createGetContext("aborted.bin", { signal: aborted }) as IStorage.ReadContext),
      ).rejects.toBe(reason);
      await expect(
        storage.exists(
          createHasContext("aborted.bin", { signal: aborted }) as IStorage.ExistsContext,
        ),
      ).rejects.toBe(reason);
      await expect(
        storage.delete(
          createDeleteContext("aborted.bin", { signal: aborted }) as IStorage.DeleteContext,
        ),
      ).rejects.toBe(reason);
      await expect(
        storage.clear(createClearContext("", { signal: aborted }) as IStorage.ClearContext),
      ).rejects.toBe(reason);
      expect(() =>
        storage.getWritable(
          createSetContext("aborted.bin", { signal: aborted }) as IStorage.GetWritableContext,
        ),
      ).toThrow(reason.message);
      expect(() =>
        storage.getReadable(
          createStreamContext("aborted.bin", { signal: aborted }) as IStorage.GetReadableContext,
        ),
      ).toThrow(reason.message);
    } finally {
      await closeStorage(storage);
    }
  });
});

describe("ストリーム操作", () => {
  test("getWritable で取得したストリームを使用したとき、データが正しく書き込める", async () => {
    const { signal, storage } = await createStorage();

    try {
      const data = new TextEncoder().encode("Stream Data");
      const writable = storage.getWritable(
        createSetContext("stream-write.txt", { signal }) as IStorage.GetWritableContext,
      );

      const writer = writable.getWriter();
      await writer.write(data);
      await writer.close();
      await expect(
        storage.read(createGetContext("stream-write.txt", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(data);
    } finally {
      await closeStorage(storage);
    }
  });

  test("getWritable は複数チャンクを結合して単発 put する", async () => {
    const { client, signal, storage, keyPrefix } = await createStorage();

    try {
      const writable = storage.getWritable(
        createSetContext("chunked.bin", { signal }) as IStorage.GetWritableContext,
      );

      const writer = writable.getWriter();
      await writer.write(new Uint8Array([1, 2]));
      await writer.write(new Uint8Array([3, 4, 5]));
      await writer.close();

      expect(client.puts).toHaveLength(1);
      expect(client.puts[0]?.key).toBe(`${keyPrefix}chunked.bin`);
      await expect(
        storage.read(createGetContext("chunked.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new Uint8Array([1, 2, 3, 4, 5]));
    } finally {
      await closeStorage(storage);
    }
  });

  test("getWritable の abort では書き込まれない", async () => {
    const { client, signal, storage } = await createStorage();

    try {
      const writable = storage.getWritable(
        createSetContext("aborted-stream.bin", { signal }) as IStorage.GetWritableContext,
      );

      const writer = writable.getWriter();
      await writer.write(new Uint8Array([1, 2, 3]));
      await writer.abort();

      expect(client.puts).toHaveLength(0);
      await expect(
        storage.exists(
          createHasContext("aborted-stream.bin", { signal }) as IStorage.ExistsContext,
        ),
      ).resolves.toBe(false);
    } finally {
      await closeStorage(storage);
    }
  });

  test("getWritable は close 前の中断では put しない", async () => {
    const { client, storage } = await createStorage();
    const controller = new AbortController();
    const reason = new Error("close 前の中断");

    try {
      const writable = storage.getWritable(
        createSetContext("aborted-before-close.bin", {
          signal: controller.signal,
        }) as IStorage.GetWritableContext,
      );
      const writer = writable.getWriter();
      await writer.write(new Uint8Array([1, 2, 3]));

      controller.abort(reason);

      await expect(writer.close()).rejects.toBe(reason);
      expect(client.puts).toHaveLength(0);
    } finally {
      await closeStorage(storage);
    }
  });

  test("getReadable で取得したストリームを使用したとき、内容を正しく読み取れる", async () => {
    const { signal, storage } = await createStorage();

    try {
      const data = new TextEncoder().encode("Readable Stream Content");
      await storage.write(
        createSetContext("stream-read.txt", { signal }) as IStorage.WriteContext,
        data,
      );

      const result = await collectBytes(
        storage.getReadable(
          createStreamContext("stream-read.txt", { signal }) as IStorage.GetReadableContext,
        ),
      );
      expect(result).toStrictEqual(data);
    } finally {
      await closeStorage(storage);
    }
  });

  test("存在しないキーの getReadable は読み取り時に KeyNotFoundError になる", async () => {
    const { signal, storage } = await createStorage();

    try {
      const readable = storage.getReadable(
        createStreamContext("missing-stream.bin", { signal }) as IStorage.GetReadableContext,
      );
      await expect(collectBytes(readable)).rejects.toThrow(KeyNotFoundError);
    } finally {
      await closeStorage(storage);
    }
  });
});
