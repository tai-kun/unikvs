import { Redis as Ioredis } from "ioredis";
import { describe, vi } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import {
  bytesEqual,
  collectBytes,
  concatBytes,
  createAllByteValues,
  createPseudoRandomBytes,
  listKeys,
  test,
} from "./_helpers.js";

describe("書き込みストリーム", () => {
  test("複数のチャンクを流し込んだとき、連結された内容が保存される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-chunks.dat";
    const chunks = [
      new Uint8Array([10, 20, 30]),
      new TextEncoder().encode("middle chunk"),
      new Uint8Array([200, 201]),
    ];
    const expected = new Uint8Array(chunks.flatMap((chunk) => Array.from(chunk)));
    const writer = storage.getWritable({ key, signal, vars: {} }).getWriter();

    // 実行
    for (const chunk of chunks) {
      await writer.write(chunk);
    }
    await writer.close();

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(expected);
  });

  test("全バイト値を含む複数の大きなチャンクを流し込んだとき、全データが正しく保存される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-large.dat";
    const chunks = Array.from({ length: 10 }, (_, index) =>
      createAllByteValues(1024 * 1024 + index),
    );
    const expected = concatBytes(chunks);
    const writer = storage.getWritable({ key, signal, vars: {} }).getWriter();

    // 実行
    for (const chunk of chunks) {
      await writer.write(chunk);
    }
    await writer.close();

    // 検証
    const result = await storage.read({ key, signal });
    expect(bytesEqual(result, expected)).toBe(true);
  });

  test("一度も書き込まずに close したとき、空のデータとして保存される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-empty.dat";
    const writer = storage.getWritable({ key, signal, vars: {} }).getWriter();

    // 実行
    await writer.close();

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(true);
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(new Uint8Array(0));
  });

  test("close するまで既存のデータは置き換わらない", async ({ expect, signal, storage }) => {
    // 準備
    const key = "stream-swap.dat";
    const original = new Uint8Array([1, 2, 3]);
    const replacement = createPseudoRandomBytes(4096, 1);
    await storage.write({ key, data: original, signal, vars: {} });
    const writer = storage.getWritable({ key, signal, vars: {} }).getWriter();

    // 実行
    await writer.write(replacement);

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(original);

    // 実行
    await writer.close();

    // 検証
    const result = await storage.read({ key, signal });
    expect(bytesEqual(result, replacement)).toBe(true);
  });

  test("close が失敗したとき、既存のデータは保たれ一時キーも残らない", async ({
    client,
    expect,
    keyPrefix,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-rename-failure.dat";
    const original = new Uint8Array([4, 5, 6]);
    await storage.write({ key, data: original, signal, vars: {} });
    const writer = storage.getWritable({ key, signal, vars: {} }).getWriter();
    await writer.write(new Uint8Array([9, 9, 9]));
    const temporaryKeys = (await listKeys(client, `${keyPrefix}*`)).filter((entry) =>
      entry.endsWith(".tmp"),
    );
    // 一時キーを消し、close 時の RENAME を失敗させます。
    await client.del(...temporaryKeys);

    // 実行と検証
    await expect(writer.close()).rejects.toThrow();
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(original);
    await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([`${keyPrefix}${key}`]);
  });
});

describe("書き込みストリームの中断", () => {
  test("書き込み中に中断したとき、既存のデータが保たれ一時キーも残らない", async ({
    client,
    expect,
    keyPrefix,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-abort.dat";
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    await storage.write({ key, data: original, signal, vars: {} });
    const controller = new AbortController();
    const writer = storage.getWritable({ key, signal: controller.signal, vars: {} }).getWriter();
    await writer.write(new Uint8Array(1024).fill(0x41));

    // 実行
    controller.abort();

    // 検証
    await expect(writer.close()).rejects.toThrow();
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(original);
    await vi.waitFor(async () => {
      await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([
        `${keyPrefix}${key}`,
      ]);
    });
  });

  test("中断後に書き込もうとすると拒否される", async ({ expect, storage }) => {
    // 準備
    const key = "stream-abort-write.dat";
    const controller = new AbortController();
    const writer = storage.getWritable({ key, signal: controller.signal, vars: {} }).getWriter();
    await writer.write(new Uint8Array([1]));

    // 実行
    controller.abort();

    // 検証
    await expect(writer.write(new Uint8Array([2]))).rejects.toThrow();
  });

  test("新規キーの書き込み中に中断したとき、キーは作られない", async ({
    client,
    expect,
    keyPrefix,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-abort-new.dat";
    const controller = new AbortController();
    const writer = storage.getWritable({ key, signal: controller.signal, vars: {} }).getWriter();
    await writer.write(new Uint8Array(1024).fill(0x42));

    // 実行
    controller.abort();

    // 検証
    await expect(writer.close()).rejects.toThrow();
    await expect(storage.exists({ key, signal })).resolves.toBe(false);
    await vi.waitFor(async () => {
      await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([]);
    });
  });

  test("writer.abort を呼び出したとき、一時キーが削除される", async ({
    client,
    expect,
    keyPrefix,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-writer-abort.dat";
    const writer = storage.getWritable({ key, signal, vars: {} }).getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行
    await writer.abort(new Error("中断"));

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(false);
    await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([]);
  });

  test("中断済みの signal を渡したとき、getWritable は同期エラーになる", ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    expect(() =>
      storage.getWritable({ key: "aborted.dat", signal: controller.signal, vars: {} }),
    ).toThrow();
  });
});

describe("読み取りストリーム", () => {
  test("複数チャンクで構成されたデータの全内容を読み取れる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-read.dat";
    const expected = createPseudoRandomBytes(1536 * 1024, 2);
    await storage.write({ key, data: expected, signal, vars: {} });

    // 実行
    const result = await collectBytes(storage.getReadable({ key, signal }));

    // 検証
    expect(bytesEqual(result, expected)).toBe(true);
  });

  test("存在しないキーを読み取ろうとしたとき、KeyNotFoundError になる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-missing.dat";

    // 実行と検証
    await expect(collectBytes(storage.getReadable({ key, signal }))).rejects.toThrow(
      KeyNotFoundError,
    );
  });

  test("中断済みの signal を渡したとき、getReadable は同期エラーになる", ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    expect(() => storage.getReadable({ key: "aborted.dat", signal: controller.signal })).toThrow();
  });
});

describe("同一キーへの並行ストリーム書き込み", () => {
  test("同時に close したとき、どちらか一方のデータが丸ごと残る", async ({
    client,
    expect,
    keyPrefix,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-race.dat";
    const payloads = [createAllByteValues(2048), createPseudoRandomBytes(2048, 3)];
    const writers = payloads.map(() => storage.getWritable({ key, signal, vars: {} }).getWriter());

    // 実行
    await Promise.all(writers.map((writer, index) => writer.write(payloads[index]!)));
    await Promise.all(writers.map((writer) => writer.close()));

    // 検証
    const result = await storage.read({ key, signal });
    expect(payloads.some((payload) => bytesEqual(result, payload))).toBe(true);
    await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([`${keyPrefix}${key}`]);
  });
});

describe("書き込みストリームの失敗処理", () => {
  test("開始に失敗したとき、write は拒否され一時キーが残らない", async ({
    client,
    expect,
    keyPrefix,
    signal,
    storage,
  }) => {
    // 準備
    // `set` の単発失敗を再現し、`start()` 内の失敗経路を通す。
    // `start()` はストリーム構築時に即時実行されるため、中断ではなく spy で失敗させる。
    vi.spyOn(Ioredis.prototype, "set").mockRejectedValueOnce(new Error("set failure"));
    const key = "stream-start-failure.dat";
    const writer = storage.getWritable({ key, signal, vars: {} }).getWriter();

    try {
      // 実行と検証
      await expect(writer.write(new Uint8Array([1]))).rejects.toThrow("set failure");
      await vi.waitFor(async () => {
        await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([]);
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("追記に失敗したとき、write は拒否され一時キーが残らない", async ({
    client,
    expect,
    keyPrefix,
    signal,
    storage,
  }) => {
    // 準備
    // `append` の単発失敗を再現し、`write()` 内の失敗経路を通す。
    const appendSpy = vi
      .spyOn(Ioredis.prototype, "append")
      .mockRejectedValueOnce(new Error("append failure"));
    const key = "stream-append-failure.dat";
    const writer = storage.getWritable({ key, signal, vars: {} }).getWriter();

    try {
      // 実行と検証
      await expect(writer.write(new Uint8Array([1, 2, 3]))).rejects.toThrow("append failure");
      expect(appendSpy).toHaveBeenCalled();
      await vi.waitFor(async () => {
        await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([]);
      });
    } finally {
      vi.restoreAllMocks();
    }
  });
});
