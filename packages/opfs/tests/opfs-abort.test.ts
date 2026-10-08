import { describe } from "vitest";

import Opfs from "../src/opfs.js";
import { test, uniqueRoot } from "./_helpers.js";

const { signal } = new AbortController();

describe("AbortSignal による中断", () => {
  test("中断済みの signal はすべてのメソッドを中断理由で拒否する", async ({ expect, storage }) => {
    // 準備
    const key = "pre-aborted.bin";
    await storage.write({ key, data: new Uint8Array([1]), signal, vars: {} });
    const controller = new AbortController();
    const reason = new Error("独自の中断理由");
    controller.abort(reason);
    const abortedSignal = controller.signal;

    // 実行と検証
    await expect(storage.open({ signal: abortedSignal })).rejects.toBe(reason);
    await expect(
      storage.write({ key, data: new Uint8Array([2]), signal: abortedSignal, vars: {} }),
    ).rejects.toBe(reason);
    await expect(storage.read({ key, signal: abortedSignal })).rejects.toBe(reason);
    await expect(storage.exists({ key, signal: abortedSignal })).rejects.toBe(reason);
    await expect(storage.delete({ key, signal: abortedSignal })).rejects.toBe(reason);
    await expect(storage.clear({ signal: abortedSignal })).rejects.toBe(reason);
    await expect(storage.getWritable({ key, signal: abortedSignal, vars: {} })).rejects.toBe(
      reason,
    );
    await expect(storage.getReadable({ key, signal: abortedSignal })).rejects.toBe(reason);
  });

  test("実行中に中断された open は未オープンのままにする", async ({ expect }) => {
    // 準備
    const fresh = new Opfs(uniqueRoot());
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");

    // 実行
    const opening = fresh.open({ signal: controller.signal });
    controller.abort(reason);

    // 検証
    await expect(opening).rejects.toBe(reason);
    expect(fresh.isOpen).toBe(false);
  });

  test("実行中に中断された read は中断理由で拒否される", async ({ expect, storage }) => {
    // 準備
    const key = "aborted-read.bin";
    await storage.write({ key, data: new Uint8Array([1, 2, 3]), signal, vars: {} });
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");

    // 実行
    const reading = storage.read({ key, signal: controller.signal });
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
    await storage.write({ key, data: original, signal, vars: {} });
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const writer = (
      await storage.getWritable({ key, signal: controller.signal, vars: {} })
    ).getWriter();
    await writer.write(new Uint8Array([9, 9]));

    // 実行
    controller.abort(reason);

    // 検証
    await expect(writer.close()).rejects.toBe(reason);
    expect(await storage.read({ key, signal })).toStrictEqual(original);
  });

  test("読み取りストリームを signal で中断したとき、読み取りが中断理由で失敗する", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "aborted-readable.bin";
    await storage.write({ key, data: new Uint8Array(256 * 1024).fill(7), signal, vars: {} });
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const reader = (await storage.getReadable({ key, signal: controller.signal })).getReader();

    // 実行
    controller.abort(reason);

    // 検証
    await expect(reader.read()).rejects.toBe(reason);
  });
});
