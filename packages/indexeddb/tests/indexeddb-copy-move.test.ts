import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import { test, createCopyContext, createMoveContext } from "./_helpers.js";

const { signal } = new AbortController();
describe("コピー (copy) の振る舞い", () => {
  test("複製元を残したまま複製先へ値を書き込む", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("source", { signal }) as IStorage.WriteContext, "value");

    // 実行：
    await storage.copy(
      createCopyContext("source", "destination", { signal }) as IStorage.CopyContext,
    );

    // 検証：
    expect(await storage.read(createGetContext("source", { signal }) as IStorage.ReadContext)).toBe(
      "value",
    );
    expect(
      await storage.read(createGetContext("destination", { signal }) as IStorage.ReadContext),
    ).toBe("value");
  });

  test("複製先に既存の値があるとき、上書きする", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("source", { signal }) as IStorage.WriteContext, "source");
    await storage.write(
      createSetContext("destination", { signal }) as IStorage.WriteContext,
      "destination",
    );

    // 実行：
    await storage.copy(
      createCopyContext("source", "destination", { signal }) as IStorage.CopyContext,
    );

    // 検証：
    expect(
      await storage.read(createGetContext("destination", { signal }) as IStorage.ReadContext),
    ).toBe("source");
  });

  test("複製元と複製先が同じキーのとき、値を残したまま成功する", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("same", { signal }) as IStorage.WriteContext, "value");

    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("same", "same", { signal }) as IStorage.CopyContext),
    ).resolves.toBeUndefined();
    expect(await storage.read(createGetContext("same", { signal }) as IStorage.ReadContext)).toBe(
      "value",
    );
  });

  test("複製元が存在しないとき、KeyNotFoundError で拒否される", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("missing", "destination", { signal }) as IStorage.CopyContext),
    ).rejects.toThrow(KeyNotFoundError);
  });
});
describe("移動 (move) の振る舞い", () => {
  test("移動先へ値を書き込み、移動元を削除する", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("source", { signal }) as IStorage.WriteContext, "value");

    // 実行：
    await storage.move(
      createMoveContext("source", "destination", { signal }) as IStorage.MoveContext,
    );

    // 検証：
    expect(
      await storage.exists(createHasContext("source", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(
      await storage.read(createGetContext("destination", { signal }) as IStorage.ReadContext),
    ).toBe("value");
  });

  test("移動先に既存の値があるとき、上書きする", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("source", { signal }) as IStorage.WriteContext, "source");
    await storage.write(
      createSetContext("destination", { signal }) as IStorage.WriteContext,
      "destination",
    );

    // 実行：
    await storage.move(
      createMoveContext("source", "destination", { signal }) as IStorage.MoveContext,
    );

    // 検証：
    expect(
      await storage.exists(createHasContext("source", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(
      await storage.read(createGetContext("destination", { signal }) as IStorage.ReadContext),
    ).toBe("source");
  });

  test("移動元と移動先が同じキーのとき、値を残したまま成功する", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("same", { signal }) as IStorage.WriteContext, "value");

    // 実行と検証：
    await expect(
      storage.move(createMoveContext("same", "same", { signal }) as IStorage.MoveContext),
    ).resolves.toBeUndefined();
    expect(await storage.read(createGetContext("same", { signal }) as IStorage.ReadContext)).toBe(
      "value",
    );
  });

  test("移動元が存在しないとき、KeyNotFoundError で拒否される", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.move(createMoveContext("missing", "destination", { signal }) as IStorage.MoveContext),
    ).rejects.toThrow(KeyNotFoundError);
  });
});
