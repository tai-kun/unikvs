import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import { test } from "./_helpers.js";

const { signal } = new AbortController();

const boundaryKeys: readonly { readonly label: string; readonly key: string }[] = [
  { label: "空文字", key: "" },
  { label: "1 文字", key: "a" },
  { label: "日本語", key: "キー" },
  { label: "絵文字", key: "🔑" },
  { label: "合成絵文字", key: "👨‍👩‍👧‍👦" },
  { label: "改行とタブ", key: "line\nbreak\t" },
  { label: "制御文字", key: "\u0000\u0001\u001f" },
  { label: "null バイトを含む文字列", key: "a\u0000b" },
  { label: "前後に空白を含む文字列", key: " a " },
  { label: "10 万文字", key: "k".repeat(100_000) },
  { label: "__proto__", key: "__proto__" },
  { label: "constructor", key: "constructor" },
  { label: "prototype", key: "prototype" },
  { label: "toString", key: "toString" },
  { label: "hasOwnProperty", key: "hasOwnProperty" },
];

describe("キーの境界値", () => {
  for (const { label, key } of boundaryKeys) {
    test(`${label} のキーでも保存・取得・削除できる`, async ({ expect, storage }) => {
      // 準備
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

      // 実行
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "value");

      // 検証
      expect(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)).toBe(
        "value",
      );
      expect(
        await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).toBe(true);

      await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);
      expect(
        await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).toBe(false);
      expect(
        await captureRejection(
          storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
        ),
      ).toBeInstanceOf(DOMException);
    });
  }
});

describe("キーの同一性", () => {
  test("大文字と小文字が異なるキーは区別される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    await storage.write(createSetContext("Key", { signal }) as IStorage.WriteContext, "upper");
    await storage.write(createSetContext("key", { signal }) as IStorage.WriteContext, "lower");

    // 検証
    expect(await storage.read(createGetContext("Key", { signal }) as IStorage.ReadContext)).toBe(
      "upper",
    );
    expect(await storage.read(createGetContext("key", { signal }) as IStorage.ReadContext)).toBe(
      "lower",
    );
    expect(
      await storage.exists(createHasContext("KEY", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
  });

  test("前後の空白だけが異なるキーは区別される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    await storage.write(createSetContext("k", { signal }) as IStorage.WriteContext, "plain");
    await storage.write(createSetContext(" k ", { signal }) as IStorage.WriteContext, "padded");

    // 検証
    expect(await storage.read(createGetContext("k", { signal }) as IStorage.ReadContext)).toBe(
      "plain",
    );
    expect(await storage.read(createGetContext(" k ", { signal }) as IStorage.ReadContext)).toBe(
      "padded",
    );
  });

  test("同じ内容の文字列キーへ書き込むと同じ値を上書きする", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "first");
    await storage.write(createSetContext(`k${1}`, { signal }) as IStorage.WriteContext, "second");

    // 検証
    expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      "second",
    );
  });
});

describe("プロトタイプ汚染キー", () => {
  test("__proto__ へ書き込んでも Object.prototype を汚染しない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    await storage.write(createSetContext("__proto__", { signal }) as IStorage.WriteContext, {
      polluted: true,
    });

    // 検証
    expect(
      await storage.read(createGetContext("__proto__", { signal }) as IStorage.ReadContext),
    ).toStrictEqual({ polluted: true });
    expect(({} as Record<string, unknown>)["polluted"]).toBe(undefined);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  test("constructor へ書き込んでも既存のキーは影響を受けない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行
    await storage.write(
      createSetContext("constructor", { signal }) as IStorage.WriteContext,
      "shadowed",
    );

    // 検証
    expect(
      await storage.read(createGetContext("constructor", { signal }) as IStorage.ReadContext),
    ).toBe("shadowed");
    expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      "v1",
    );
  });
});
