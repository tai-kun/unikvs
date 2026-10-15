import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  captureThrown,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
  createClearContext,
} from "@unikvs/testing";
import { describe, test as vitest } from "vitest";

import { InvalidSizeOfResultError } from "../src/errors.js";
import LruCache from "../src/lru-cache.js";

/**
 * テストごとに容量上限付きの LruCache インスタンスを提供します。
 * sizeOf の検証と、例外時に値が変わらないことの保証を検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    const storage = new LruCache({ maxBytes: 10 });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);
  },
});

describe("sizeOf の検証", () => {
  test("数値以外を返したとき、InvalidSizeOfResultError を投げる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const bad = new LruCache({ maxBytes: 10, sizeOf: () => "1" as unknown as number });
    await bad.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    const error = captureThrown(() =>
      bad.write(createSetContext("k1") as IStorage.WriteContext, "v1"),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidSizeOfResultError);
    expect((error as InvalidSizeOfResultError).meta).toStrictEqual({ key: "k1", actual: "1" });
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("NaN を返したとき、InvalidSizeOfResultError を投げる", async ({ expect, signal }) => {
    // 準備
    const bad = new LruCache({ maxBytes: 10, sizeOf: () => Number.NaN });
    await bad.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    const error = captureThrown(() =>
      bad.write(createSetContext("k1") as IStorage.WriteContext, "v1"),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidSizeOfResultError);
    expect(bad.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("無限大を返したとき、InvalidSizeOfResultError を投げる", async ({ expect, signal }) => {
    // 準備
    const bad = new LruCache({ maxBytes: 10, sizeOf: () => Number.POSITIVE_INFINITY });
    await bad.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    const error = captureThrown(() =>
      bad.write(createSetContext("k1") as IStorage.WriteContext, "v1"),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidSizeOfResultError);
  });

  test("負数を返したとき、InvalidSizeOfResultError を投げる", async ({ expect, signal }) => {
    // 準備
    const bad = new LruCache({ maxBytes: 10, sizeOf: () => -1 });
    await bad.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    const error = captureThrown(() =>
      bad.write(createSetContext("k1") as IStorage.WriteContext, "v1"),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidSizeOfResultError);
    expect((error as InvalidSizeOfResultError).meta).toStrictEqual({ key: "k1", actual: -1 });
  });

  test("検証失敗時に既存の値は残る", async ({ expect, signal }) => {
    // 準備
    let bad = false;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        if (bad) {
          return -1;
        }
        return 1;
      },
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    storage.write(createSetContext("k1") as IStorage.WriteContext, "old");
    bad = true;

    // 実行
    captureThrown(() => storage.write(createSetContext("k1") as IStorage.WriteContext, "new"));

    // 検証
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("old");
    expect(storage.bytes).toBe(1);
  });

  test("sizeOf 自身が投げたとき、そのエラーが伝播し、値は変わらない", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        throw new Error("sizeOf failed");
      },
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    const error = captureThrown(() =>
      storage.write(createSetContext("k1") as IStorage.WriteContext, "v1"),
    );

    // 検証
    expect((error as Error).message).toBe("sizeOf failed");
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("-0 を返したとき、0 相当として受理される", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 10, sizeOf: () => -0 });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 検証
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(storage.bytes).toBe(0);
  });

  test("maxBytes 未設定時は sizeOf を呼ばない", async ({ expect, signal }) => {
    // 準備
    let calls = 0;
    const storage = new LruCache({
      sizeOf: () => {
        calls += 1;
        return 1;
      },
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 検証
    expect(calls).toBe(0);
  });

  test("上書き時も毎回 sizeOf を呼ぶ", async ({ expect, signal }) => {
    // 準備
    let calls = 0;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        calls += 1;
        return 1;
      },
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v2");

    // 検証
    expect(calls).toBe(2);
  });

  test("getWritable の取得時には呼ばず、ストリームの close 時に 1 回呼ぶ", async ({
    expect,
    signal,
  }) => {
    // 準備
    let calls = 0;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        calls += 1;
        return 2;
      },
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("k1") as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    const callsBeforeClose = calls;
    await writer.close();

    // 検証
    expect(callsBeforeClose).toBe(0);
    expect(calls).toBe(1);
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2]),
    );
  });

  test("read・exists・getReadable では sizeOf を呼ばない", async ({ expect, signal }) => {
    // 準備
    let calls = 0;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        calls += 1;
        return 1;
      },
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    calls = 0;

    // 実行
    storage.read(createGetContext("k1") as IStorage.ReadContext);
    storage.exists(createHasContext("k1") as IStorage.ExistsContext);
    storage.getReadable(createStreamContext("k1") as IStorage.GetReadableContext);

    // 検証
    expect(calls).toBe(0);
  });

  test("delete・clear・ストレージの close では sizeOf を呼ばない", async ({ expect, signal }) => {
    // 準備
    let calls = 0;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        calls += 1;
        return 1;
      },
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    calls = 0;

    // 実行
    storage.delete(createDeleteContext("k1") as IStorage.DeleteContext);
    storage.clear(createClearContext() as IStorage.ClearContext);
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 検証
    expect(calls).toBe(0);
  });

  test("ストリームの close 時に sizeOf が不正値を返したとき、close は拒否され、値は保存されない", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 10, sizeOf: () => -1 });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("k1") as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([1]));

    // 実行
    const error = await captureRejection(writer.close());

    // 検証
    expect(error).toBeInstanceOf(InvalidSizeOfResultError);
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("ストリームの close 時に sizeOf が不正値を返したとき、既存の値は残る", async ({
    expect,
    signal,
  }) => {
    // 準備
    let bad = false;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        if (bad) {
          return -1;
        }
        return 1;
      },
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    storage.write(createSetContext("k1") as IStorage.WriteContext, "old");
    bad = true;
    const writer = storage
      .getWritable(createSetContext("k1") as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([9]));

    // 実行
    await captureRejection(writer.close());

    // 検証
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("old");
  });
});
