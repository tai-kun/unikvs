import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  createClearContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import NodeFs from "../src/node-fs.js";
import { test } from "./_helpers.js";

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
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行
    const restarted = new NodeFs(root);
    await restarted.open(createOpenContext() as IStorage.OpenContext);

    // 検証
    expect(restarted.isOpen).toBe(true);
    expect(
      bytesEqual(
        new Uint8Array(
          await restarted.read(createGetContext(key, { signal }) as IStorage.ReadContext),
        ),
        data,
      ),
    ).toBe(true);
  });

  test("別インスタンスで再 open した後も書き込みを継続でき、両方のデータが残る", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    await storage.write(
      createSetContext("first.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    const restarted = new NodeFs(root);
    await restarted.open(createOpenContext() as IStorage.OpenContext);
    await restarted.write(
      createSetContext("second.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 検証
    expect(
      new Uint8Array(
        await restarted.read(createGetContext("first.bin", { signal }) as IStorage.ReadContext),
      ),
    ).toStrictEqual(new Uint8Array([1]));
    expect(
      new Uint8Array(
        await storage.read(createGetContext("second.bin", { signal }) as IStorage.ReadContext),
      ),
    ).toStrictEqual(new Uint8Array([2]));
  });

  test("データがないルートを別インスタンスで open したとき、read は ENOENT で失敗する", async ({
    expect,
    root,
    signal,
  }) => {
    // 準備
    const restarted = new NodeFs(root);
    await restarted.open(createOpenContext() as IStorage.OpenContext);

    // 実行と検証
    await expect(
      restarted.read(createGetContext("unknown.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(/ENOENT/);
  });

  test("別インスタンスで clear すると元のインスタンスからもデータが見えなくなる", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "cleared.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    const restarted = new NodeFs(root);
    await restarted.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    await restarted.clear(createClearContext() as IStorage.ClearContext);

    // 検証
    expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
  });
});
