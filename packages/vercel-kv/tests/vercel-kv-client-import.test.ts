import type { IStorage } from "@unikvs/core";
import { captureRejection, createGetContext } from "@unikvs/testing";
import { describe, test, vi } from "vitest";

vi.mock("@vercel/kv", () => {
  throw new Error("@vercel/kv is not installed");
});

import { ClientNotAvailableError } from "../src/errors.js";
import VercelKv from "../src/vercel-kv.js";

describe("任意依存 @vercel/kv の読み込み失敗", () => {
  test("動的 import が失敗すると ClientNotAvailableError になり原因を保持する", async ({
    expect,
  }) => {
    // 準備
    const storage = new VercelKv({ url: "https://kv.example", token: "secret" });

    // 実行
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(ClientNotAvailableError);
    expect((error as Error).cause).toBeInstanceOf(Error);
  });
});
