import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Cookies from "../src/cookies.js";
import { createFakeDocument, runWithGlobalDocument } from "./_helpers.js";

/**
 * 最後に書き込まれた Set-Cookie 文字列を取り出します。
 */
function getLastWrite(writes: readonly string[]): string {
  return writes.at(-1) ?? "";
}

const { signal } = new AbortController();
describe("document.cookie 受け皿", () => {
  test("既定では document.cookie を使って往復できる", ({ expect }) => {
    runWithGlobalDocument(createFakeDocument(), () => {
      // 準備：
      const writer = new Cookies();

      // 実行：
      writer.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

      const reader = new Cookies();
      const result = reader.read(createGetContext("k1", { signal }) as IStorage.ReadContext);

      // 検証：
      expect(result).toBe("v1");
    });
  });

  test("複数の Cookie を名前で取り分けて読める", ({ expect }) => {
    runWithGlobalDocument(createFakeDocument(), () => {
      // 準備：
      const storage = new Cookies();

      // 実行：
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
      storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

      // 検証：
      expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
      expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toBe("v2");
    });
  });

  test("区切り文字と非 ASCII を含むキーと値を往復できる", ({ expect }) => {
    runWithGlobalDocument(createFakeDocument(), () => {
      // 準備：
      const storage = new Cookies();
      const key = "a b;=c";
      const value = "x;y=z %あ";

      // 実行：
      storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, value);

      const result = storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

      // 検証：
      expect(result).toBe(value);

      expect(storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
        true,
      );
    });
  });

  test("属性が Set-Cookie 文字列に連なる", ({ expect }) => {
    // 準備：
    const document = createFakeDocument();
    runWithGlobalDocument(document, () => {
      const storage = new Cookies({
        cookieAttributes: {
          path: "/",
          domain: "example.com",
          maxAge: 60,
          secure: true,
          sameSite: "Lax",
        },
      });

      // 実行：
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

      // 検証：
      const written = getLastWrite(document.writes);
      expect(written).toContain("Path=/");
      expect(written).toContain("Domain=example.com");
      expect(written).toContain("Secure");
      expect(written).toContain("SameSite=Lax");
      expect(written).toContain("Max-Age=60");
    });
  });

  test("delete は属性を保ったまま Max-Age=0 で失効させる", ({ expect }) => {
    // 準備：
    const document = createFakeDocument();
    runWithGlobalDocument(document, () => {
      const storage = new Cookies({
        cookieAttributes: {
          path: "/",
          domain: "example.com",
          maxAge: 3600,
        },
      });
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

      // 実行：
      storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

      // 検証：
      const written = getLastWrite(document.writes);
      expect(written).toContain("Path=/");
      expect(written).toContain("Domain=example.com");
      expect(written).toContain("Max-Age=0");

      expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
        false,
      );
    });
  });

  test("clear は属性を保ったまま document.cookie のすべての Cookie を削除する", ({ expect }) => {
    // 準備：
    const document = createFakeDocument();
    runWithGlobalDocument(document, () => {
      const storage = new Cookies({
        cookieAttributes: {
          path: "/",
          domain: "example.com",
        },
      });
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
      storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

      const writesBeforeClear = document.writes.length;

      // 実行：
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      // 検証：
      const deletes = document.writes.slice(writesBeforeClear);
      expect(deletes).toHaveLength(2);

      for (const serialized of deletes) {
        expect(serialized).toContain("Path=/");
        expect(serialized).toContain("Domain=example.com");
        expect(serialized).toContain("Max-Age=0");
      }

      expect(document.cookie).toBe("");
    });
  });

  test("区切り文字を含むキーも document.cookie 越しに clear できる", ({ expect }) => {
    // 準備：
    const document = createFakeDocument();
    runWithGlobalDocument(document, () => {
      const storage = new Cookies({ cookieAttributes: { path: "/" } });
      const key = "a b;=c";
      storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "v1");
      storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

      // 実行：
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      // 検証：
      expect(storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
        false,
      );
      expect(storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext)).toBe(
        false,
      );

      expect(document.cookie).toBe("");
    });
  });

  test("バイト列も document.cookie 越しに往復する", ({ expect }) => {
    runWithGlobalDocument(createFakeDocument(), () => {
      // 準備：
      const data = new Uint8Array([0, 1, 2, 255]);

      // 実行：
      new Cookies().write(createSetContext("k1", { signal }) as IStorage.WriteContext, data);

      const result = new Cookies().read(createGetContext("k1", { signal }) as IStorage.ReadContext);

      // 検証：
      expect(result).toEqual(data);
    });
  });
});
