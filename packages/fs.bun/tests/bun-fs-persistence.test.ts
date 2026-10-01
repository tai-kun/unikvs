import { describe } from "vitest";

import BunFs from "../src/bun-fs.js";
import { bytesEqual, test } from "./_helpers.js";

describe("永続化", () => {
  test("書き込み後に別インスタンスで open したとき、同じデータを読み取れる", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "persist.bin";
    const data = new Uint8Array([10, 20, 30]);
    await storage.write({ key, data, signal });

    // 実行
    const restarted = new BunFs(root);
    await restarted.open();

    // 検証
    expect(restarted.isOpen).toBe(true);
    expect(bytesEqual(new Uint8Array(await restarted.read({ key, signal })), data)).toBe(true);
  });

  test("別インスタンスで再 open した後も書き込みを継続でき、両方のデータが残る", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    await storage.write({ key: "first.bin", data: new Uint8Array([1]), signal });

    // 実行
    const restarted = new BunFs(root);
    await restarted.open();
    await restarted.write({ key: "second.bin", data: new Uint8Array([2]), signal });

    // 検証
    expect(new Uint8Array(await restarted.read({ key: "first.bin", signal }))).toStrictEqual(
      new Uint8Array([1]),
    );
    expect(new Uint8Array(await storage.read({ key: "second.bin", signal }))).toStrictEqual(
      new Uint8Array([2]),
    );
  });

  test("データがないルートを別インスタンスで open したとき、read は ENOENT で失敗する", async ({
    expect,
    root,
    signal,
  }) => {
    // 準備
    const restarted = new BunFs(root);
    await restarted.open();

    // 実行と検証
    await expect(restarted.read({ key: "unknown.bin", signal })).rejects.toThrow(/ENOENT/);
  });

  test("別インスタンスで clear すると元のインスタンスからもデータが見えなくなる", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "cleared.bin";
    await storage.write({ key, data: new Uint8Array([1]), signal });
    const restarted = new BunFs(root);
    await restarted.open();

    // 実行
    await restarted.clear();

    // 検証
    expect(await storage.exists({ key })).toBe(false);
  });
});
