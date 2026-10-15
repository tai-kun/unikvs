import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import { test } from "./_helpers.js";

const { signal } = new AbortController();

describe("AbortSignal による中断", () => {
  test("中断済みの signal はすべてのメソッドを中断理由で拒否する", async ({ expect, storage }) => {
    // 準備
    const key = "pre-aborted";
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "value");
    const controller = new AbortController();
    const reason = new Error("独自の中断理由");
    controller.abort(reason);
    const abortedSignal = controller.signal;

    // 実行と検証
    await expect(
      storage.write(
        createSetContext(key, { signal: abortedSignal }) as IStorage.WriteContext,
        "next",
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
      storage.close(createCloseContext({ signal: abortedSignal }) as IStorage.CloseContext),
    ).rejects.toBe(reason);
    expect(() =>
      storage.getWritable(
        createSetContext(key, { signal: abortedSignal }) as IStorage.GetWritableContext,
      ),
    ).toThrow(reason);
    expect(() =>
      storage.getReadable(
        createStreamContext(key, { signal: abortedSignal }) as IStorage.GetReadableContext,
      ),
    ).toThrow(reason);
    expect(storage.isOpen).toBe(true);
  });

  test("中断済みの signal は open を中断理由で拒否する", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    const reason = new Error("独自の中断理由");
    controller.abort(reason);

    // 実行と検証
    await expect(
      storage.open(createOpenContext({ signal: controller.signal }) as IStorage.OpenContext),
    ).rejects.toBe(reason);
    expect(storage.isOpen).toBe(false);
  });

  test("実行中に中断された open は未オープンのままにする", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");

    // 実行
    const opening = storage.open(
      createOpenContext({ signal: controller.signal }) as IStorage.OpenContext,
    );
    controller.abort(reason);

    // 検証
    await expect(opening).rejects.toBe(reason);
    expect(storage.isOpen).toBe(false);
  });

  test("実行中に中断された read は中断理由で拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "aborted-read";
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

  test("書き込みストリームを signal で中断したとき、保存されない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "aborted-writable";
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const writer = storage
      .getWritable(
        createSetContext(key, { signal: controller.signal }) as IStorage.GetWritableContext,
      )
      .getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行
    controller.abort(reason);

    // 検証
    await expect(writer.close()).rejects.toBe(reason);
    expect(await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("読み取りストリームを signal で中断したとき、読み取りが中断理由で失敗する", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "aborted-readable";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const reader = storage
      .getReadable(
        createStreamContext(key, { signal: controller.signal }) as IStorage.GetReadableContext,
      )
      .getReader();

    // 実行
    controller.abort(reason);

    // 検証
    await expect(reader.read()).rejects.toBe(reason);
  });
});
