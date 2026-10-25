// oxlint-disable vitest/require-top-level-describe
import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { test, describe, afterEach, beforeEach } from "vite-plus/test";

import Opfs from "../src/opfs.js";

const { signal } = new AbortController();

let storage: Opfs;
const TEST_ROOT = ".unikvs/test";
beforeEach(async (): Promise<void> => {
  // 実際の OPFS を使用してインスタンスを作成します。
  storage = new Opfs(TEST_ROOT);

  // 前のテストの影響を除去するために、初期化してクリアします。
  await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
  await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
});
afterEach(async (): Promise<void> => {
  // テスト終了後のクリーンアップをします。
  if (storage.isOpen) {
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
  }
});
describe("初期化の振る舞い", () => {
  test("デフォルト設定でオープンしたとき、ディレクトリが確保され、使用可能状態になる", async ({
    expect,
  }) => {
    // 準備と実行をします。
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 検証：
    expect(storage.isOpen).toBe(true);
  });

  test("ルート直下を指定してオープンしたとき、ルートディレクトリが操作対象として設定される", async ({
    expect,
  }) => {
    // 準備：
    const rootStorage = new Opfs("");

    // 実行：
    await rootStorage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 検証：
    expect(rootStorage.isOpen).toBe(true);
  });

  test("オープンしていない状態で操作を試みたとき、実行時エラーが発生する", async ({ expect }) => {
    // 準備：
    const uninitializedStorage = new Opfs(TEST_ROOT);
    const key = "test.bin";

    // 実行と検証：
    await expect(
      uninitializedStorage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).rejects.toThrow();
  });
});
describe("基本操作 (CRUD) の振る舞い", () => {
  beforeEach(async (): Promise<void> => {
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
  });

  test("データを書き込んだとき、エラーなく正常に終了する", async ({ expect }) => {
    // 準備：
    const key = "test.bin";
    const data = new Uint8Array([1, 2, 3]);

    // 実行と検証：
    await expect(
      storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
    ).resolves.not.toThrow();
  });

  test("保存されたデータを読み取ったとき、書き込み時と同じ内容が取得できる", async ({ expect }) => {
    // 準備：
    const key = "test.bin";
    const expectedData = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, expectedData);

    // 実行：
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証：
    expect(result).toStrictEqual(expectedData);
  });

  test("存在するキーに対して存在確認をしたとき、真を返す", async ({ expect }) => {
    // 準備：
    const key = "exists.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([0]),
    );

    // 実行：
    const exists = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(exists).toBe(true);
  });

  test("存在しないキーに対して存在確認をしたとき、偽を返す", async ({ expect }) => {
    // 準備：
    const key = "non_existent.bin";

    // 実行：
    const exists = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(exists).toBe(false);
  });

  test("データを削除したとき、その後の存在確認で偽を返す", async ({ expect }) => {
    // 準備：
    const key = "delete_me.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([0]),
    );

    // 実行：
    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

    const exists = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(exists).toBe(false);
  });

  test("書き込み途中で失敗したとき、既存データが破壊されない", async ({ expect }) => {
    // 準備：
    const key = "atomic.bin";
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, original);
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(original);

    // createWritable を差し替え、write() が必ず失敗するが close() は成功する (＝ 部分的な書き込み内容がコミットされる) ストリームを返します。
    // 実際の OPFS ではクォータ超過・I/O エラーなどで書き込み途中に失敗し得ます。
    // oxlint-disable-next-line typescript/unbound-method
    const originalCreateWritable = FileSystemFileHandle.prototype.createWritable;

    class FailingWritableStream extends WritableStream<Uint8Array> {
      readonly #real: FileSystemWritableFileStream;

      constructor(real: FileSystemWritableFileStream) {
        super();
        this.#real = real;
      }

      write(): Promise<void> {
        return Promise.reject(new DOMException("quota exceeded (simulated)", "QuotaExceededError"));
      }

      override close(): Promise<void> {
        // 実ストリームへコミットします。
        return this.#real.close();
      }

      override abort(reason?: unknown): Promise<void> {
        return this.#real.abort(reason);
      }
    }

    FileSystemFileHandle.prototype.createWritable =
      async function (): Promise<FileSystemWritableFileStream> {
        const real: FileSystemWritableFileStream = await originalCreateWritable.call(this);

        return new FailingWritableStream(real) as unknown as FileSystemWritableFileStream;
      };

    try {
      // 実行と検証：
      await expect(
        storage.write(
          createSetContext(key, { signal }) as IStorage.WriteContext,
          new Uint8Array([9, 9, 9]),
        ),
      ).rejects.toThrow(/quota exceeded/u);
    } finally {
      FileSystemFileHandle.prototype.createWritable = originalCreateWritable;
    }

    // 検証：失敗した書き込みによって既存データが破壊されていないことを確認します。
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(original);
  });
});
describe("ストリーム操作の振る舞い", () => {
  beforeEach(async (): Promise<void> => {
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
  });

  test("書き込み用ストリームを取得したとき、WritableStream のインスタンスが返される", async ({
    expect,
  }) => {
    // 準備：
    const key = "stream_write.bin";

    // 実行：
    const writable = await storage.getWritable(
      createSetContext(key, { signal }) as IStorage.GetWritableContext,
    );

    // 検証：
    expect(writable).toBeInstanceOf(WritableStream);
    await writable.close();
  });

  test("既存ファイルから読み取り用ストリームを取得したとき、ReadableStream のインスタンスが返される", async ({
    expect,
  }) => {
    // 準備：
    const key = "stream_read.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行：
    const readable = await storage.getReadable(
      createStreamContext(key, { signal }) as IStorage.GetReadableContext,
    );

    // 検証：
    expect(readable).toBeInstanceOf(ReadableStream);
  });

  test("存在しないファイルから読み取り用ストリームを取得しようとしたとき、例外が発生する", async ({
    expect,
  }) => {
    // 準備：
    const key = "missing_stream.bin";

    // 実行と検証：
    await expect(
      storage.getReadable(createStreamContext(key, { signal }) as IStorage.GetReadableContext),
    ).rejects.toThrow();
  });
});
describe("一括削除 (Clear) の振る舞い", () => {
  test("クリアを実行したとき、保存されていたすべてのデータが削除される", async ({ expect }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key1 = "file1.bin";
    const key2 = "file2.bin";
    await storage.write(
      createSetContext(key1, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext(key2, { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    expect(await storage.exists(createHasContext(key1, { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(await storage.exists(createHasContext(key2, { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });
});
describe("境界値・異常系の振る舞い", () => {
  beforeEach(async (): Promise<void> => {
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
  });

  test("不正なファイル名で操作を試みたとき、検証エラーが発生する", async ({ expect }) => {
    // 準備：
    const invalidKey = "/invalid/path";

    // 実行と検証：
    await expect(
      storage.write(
        createSetContext(invalidKey, { signal }) as IStorage.WriteContext,
        new Uint8Array(),
      ),
    ).rejects.toThrow();
  });

  test("空のデータを書き込んだとき、サイズ 0 のファイルとして正常に保存される", async ({
    expect,
  }) => {
    // 準備：
    const key = "empty.bin";
    const emptyData = new Uint8Array(0);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, emptyData);

    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証：
    expect(result.length).toBe(0);
    expect(result).toStrictEqual(emptyData);
  });

  test("存在しないファイルを読み取ろうとしたとき、例外が発生する", async ({ expect }) => {
    // 準備：
    const key = "never_created.bin";

    // 実行と検証：
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).rejects.toThrow();
  });
});
