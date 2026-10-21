import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import VercelBlob from "../src/vercel-blob.js";

const token = process.env["BLOB_READ_WRITE_TOKEN"];
const prefix = `unikvs-test/${Date.now()}-${Math.random().toString(36).slice(2)}/`;

describe.skipIf(!token)("Vercel Blob 実体との往復", () => {
  test("write・read・exists・delete が往復する", async ({ expect }) => {
    // 準備
    const storage = new VercelBlob({ token, keyPrefix: prefix });
    const data = new Uint8Array([1, 2, 3, 255, 0]);

    try {
      // 実行
      await storage.write(
        createSetContext("live", { signal: AbortSignal.timeout(30_000) }) as IStorage.WriteContext,
        data,
      );

      // 検証
      expect(
        await storage.exists(
          createHasContext("live", {
            signal: AbortSignal.timeout(30_000),
          }) as IStorage.ExistsContext,
        ),
      ).toBe(true);
      expect(
        await storage.read(
          createGetContext("live", {
            signal: AbortSignal.timeout(30_000),
          }) as IStorage.ReadContext,
        ),
      ).toStrictEqual(data);
    } finally {
      // 後片付け
      await storage.delete(
        createDeleteContext("live", {
          signal: AbortSignal.timeout(30_000),
        }) as IStorage.DeleteContext,
      );
    }
  });

  test("clear が接頭辞配下を削除する", async ({ expect }) => {
    // 準備
    const storage = new VercelBlob({ token, keyPrefix: prefix });
    await storage.write(
      createSetContext("a", { signal: AbortSignal.timeout(30_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("b", { signal: AbortSignal.timeout(30_000) }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行
    await storage.clear(
      createClearContext("", { signal: AbortSignal.timeout(30_000) }) as IStorage.ClearContext,
    );

    // 検証
    expect(
      await storage.exists(
        createHasContext("a", {
          signal: AbortSignal.timeout(30_000),
        }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });
});
