import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { afterEach, describe, test } from "vitest";

import Cookies from "../src/cookies.js";

const { signal } = new AbortController();

const STRING_KEY = "unikvs-client-string";
const BINARY_KEY = "unikvs-client-bytes";

const storage = new Cookies({ cookieAttributes: { path: "/" } });

function cleanup(): void {
  storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
}

describe("document.cookie バックエンド (client)", () => {
  afterEach(() => {
    cleanup();
  });

  test("既定の document.cookie で文字列を往復できる", ({ expect }) => {
    // 準備
    cleanup();

    // 実行
    storage.write(createSetContext(STRING_KEY, { signal }) as IStorage.WriteContext, "v1");

    // 検証
    expect(storage.read(createGetContext(STRING_KEY, { signal }) as IStorage.ReadContext)).toBe(
      "v1",
    );
    expect(storage.exists(createHasContext(STRING_KEY, { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );

    // 実行と検証
    storage.delete(createDeleteContext(STRING_KEY, { signal }) as IStorage.DeleteContext);
    expect(storage.exists(createHasContext(STRING_KEY, { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("既定の document.cookie でバイト列を往復できる", ({ expect }) => {
    // 準備
    cleanup();
    const data = new Uint8Array([0, 1, 2, 255]);

    // 実行
    storage.write(createSetContext(BINARY_KEY, { signal }) as IStorage.WriteContext, data);

    // 検証
    expect(storage.read(createGetContext(BINARY_KEY, { signal }) as IStorage.ReadContext)).toEqual(
      data,
    );
  });
});
