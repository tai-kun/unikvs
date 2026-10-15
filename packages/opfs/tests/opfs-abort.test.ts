import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import Opfs from "../src/opfs.js";
import { test, uniqueRoot } from "./_helpers.js";

const { signal } = new AbortController();

describe("AbortSignal による中断", () => {
  test("中断済みの signal はすべてのメソッドを中断理由で拒否する", async ({ expect, storage }) => {
    // 準備
    const key = "pre-aborted.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    const controller = new AbortController();
    const reason = new Error("独自の中断理由");
    controller.abort(reason);
    const abortedSignal = controller.signal;

    // 実行と検証
    await expect(
      storage.open(createOpenContext({ signal: abortedSignal }) as IStorage.OpenContext),
    ).rejects.toBe(reason);
    await expect(
      storage.write(
        createSetContext(key, { signal: abortedSignal }) as IStorage.WriteContext,
        new Uint8Array([2]),
      ),
    ).rejects.toBe(reason);
    await expect(
      storage.read(createGetContext(key, { signal: abortedSignal }) as IStorage.ReadContext),
    ).rejects.toBe(reason);
    await expect(
      storage.exists(createHasContext(key, { signal: abortedSignal }) as IStorage.ExistsContext),
    ).rejects.toBe(reason);
    await expect(
      storage.delete(createDeleteContext(key, { signal: abortedSignal }) as IStorage.DeleteContext),
    ).rejects.toBe(reason);
    await expect(
      storage.clear(createClearContext("", { signal: abortedSignal }) as IStorage.ClearContext),
    ).rejects.toBe(reason);
    await expect(
      storage.getWritable(
        createSetContext(key, { signal: abortedSignal }) as IStorage.GetWritableContext,
      ),
    ).rejects.toBe(reason);
    await expect(
      storage.getReadable(
        createStreamContext(key, { signal: abortedSignal }) as IStorage.GetReadableContext,
      ),
    ).rejects.toBe(reason);
  });

  test("実行中に中断された open は未オープンのままにする", async ({ expect }) => {
    // 準備
    const fresh = new Opfs(uniqueRoot());
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");

    // 実行
    const opening = fresh.open(
      createOpenContext({ signal: controller.signal }) as IStorage.OpenContext,
    );
    controller.abort(reason);

    // 検証
    await expect(opening).rejects.toBe(reason);
    expect(fresh.isOpen).toBe(false);
  });

  test("実行中に中断された read は中断理由で拒否される", async ({ expect, storage }) => {
    // 準備
    const key = "aborted-read.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");

    // 実行
    const reading = storage.read(
      createGetContext(key, { signal: controller.signal }) as IStorage.ReadContext,
    );
    controller.abort(reason);

    // 検証
    await expect(reading).rejects.toBe(reason);
  });

  test("書き込みストリームを signal で中断したとき、変更が破棄される", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "aborted-writable.bin";
    const original = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, original);
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const writer = (
      await storage.getWritable(
        createSetContext(key, { signal: controller.signal }) as IStorage.GetWritableContext,
      )
    ).getWriter();
    await writer.write(new Uint8Array([9, 9]));

    // 実行
    controller.abort(reason);

    // 検証
    await expect(writer.close()).rejects.toBe(reason);
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(original);
  });

  test("読み取りストリームを signal で中断したとき、読み取りが中断理由で失敗する", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "aborted-readable.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array(256 * 1024).fill(7),
    );
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const reader = (
      await storage.getReadable(
        createStreamContext(key, { signal: controller.signal }) as IStorage.GetReadableContext,
      )
    ).getReader();

    // 実行
    controller.abort(reason);

    // 検証
    await expect(reader.read()).rejects.toBe(reason);
  });
});
