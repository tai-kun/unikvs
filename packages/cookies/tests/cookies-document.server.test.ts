import type { IStorage } from "@unikvs/core";
import {
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import Cookies from "../src/cookies.js";
import { createFakeDocument, runWithGlobalDocument } from "./_helpers.js";

const { signal } = new AbortController();

describe("document.cookie 受け皿", () => {
  test("既定では document.cookie を使って往復できる", ({ expect }) => {
    runWithGlobalDocument(createFakeDocument(), () => {
      // 準備
      const writer = new Cookies();

      // 実行
      writer.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
      const reader = new Cookies();
      const result = reader.read(createGetContext("k1", { signal }) as IStorage.ReadContext);

      // 検証
      expect(result).toBe("v1");
    });
  });

  test("属性が Set-Cookie 文字列に連なる", ({ expect }) => {
    // 準備
    const document = createFakeDocument();

    runWithGlobalDocument(document, () => {
      const storage = new Cookies({
        cookieAttributes: {
          path: "/",
          domain: "example.com",
          secure: true,
          sameSite: "Lax",
          maxAge: 60,
        },
      });

      // 実行
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

      // 検証
      const written = document.writes.at(-1) ?? "";
      expect(written).toContain("Path=/");
      expect(written).toContain("Domain=example.com");
      expect(written).toContain("Secure");
      expect(written).toContain("SameSite=Lax");
      expect(written).toContain("Max-Age=60");
    });
  });

  test("delete は Max-Age=0 で失効させる", ({ expect }) => {
    runWithGlobalDocument(createFakeDocument(), () => {
      // 準備
      const storage = new Cookies({ cookieAttributes: { path: "/" } });
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

      // 実行
      storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

      // 検証
      expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
        false,
      );
    });
  });

  test("バイト列も document.cookie 越しに往復する", ({ expect }) => {
    runWithGlobalDocument(createFakeDocument(), () => {
      // 準備
      const data = new Uint8Array([0, 1, 2, 255]);

      // 実行
      new Cookies().write(createSetContext("k1", { signal }) as IStorage.WriteContext, data);
      const result = new Cookies().read(createGetContext("k1", { signal }) as IStorage.ReadContext);

      // 検証
      expect(result).toEqual(data);
    });
  });
});
