import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import Memory from "../src/memory.js";

const boundaryKeys: readonly {
  readonly key: string;
  readonly label: string;
}[] = [
  {
    key: "",
    label: "空文字",
  },
  {
    key: "a",
    label: "1 文字",
  },
  {
    key: "キー",
    label: "日本語",
  },
  {
    key: "🔑",
    label: "絵文字",
  },
  {
    key: "👨‍👩‍👧‍👦",
    label: "合成絵文字",
  },
  {
    key: "line\nbreak\t",
    label: "改行とタブ",
  },
  {
    key: "\u0000\u0001\u001F",
    label: "制御文字",
  },
  {
    key: "a\u0000b",
    label: "null バイトを含む文字列",
  },
  {
    key: " a ",
    label: "前後に空白を含む文字列",
  },
  {
    key: "k".repeat(100_000),
    label: "10 万文字",
  },
  {
    key: "__proto__",
    label: "__proto__",
  },
  {
    key: "constructor",
    label: "constructor",
  },
  {
    key: "prototype",
    label: "prototype",
  },
  {
    key: "toString",
    label: "toString",
  },
  {
    key: "hasOwnProperty",
    label: "hasOwnProperty",
  },
];
describe("キーの境界値", () => {
  for (const { key, label } of boundaryKeys) {
    test(`${label} のキーでも保存・取得・削除できる`, ({ expect }) => {
      // 準備：
      const storage = new Memory();

      // 実行：
      storage.write(createSetContext(key) as IStorage.WriteContext, "value");

      // 検証：
      expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toBe("value");
      expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(true);
      storage.delete(createDeleteContext(key) as IStorage.DeleteContext);
      expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
      expect(() => storage.read(createGetContext(key) as IStorage.ReadContext)).toThrow(
        KeyNotFoundError,
      );
    });
  }
});

describe("キーの同一性", () => {
  test("大文字と小文字が異なるキーは区別される", ({ expect }) => {
    // 準備：
    const storage = new Memory();

    // 実行：
    storage.write(createSetContext("Key") as IStorage.WriteContext, "upper");
    storage.write(createSetContext("key") as IStorage.WriteContext, "lower");

    // 検証：
    expect(storage.read(createGetContext("Key") as IStorage.ReadContext)).toBe("upper");
    expect(storage.read(createGetContext("key") as IStorage.ReadContext)).toBe("lower");
    expect(storage.exists(createHasContext("KEY") as IStorage.ExistsContext)).toBe(false);
  });

  test("空白だけが異なるキーは区別される", ({ expect }) => {
    // 準備：
    const storage = new Memory();

    // 実行：
    storage.write(createSetContext("k") as IStorage.WriteContext, "plain");
    storage.write(createSetContext(" k ") as IStorage.WriteContext, "padded");

    // 検証：
    expect(storage.read(createGetContext("k") as IStorage.ReadContext)).toBe("plain");
    expect(storage.read(createGetContext(" k ") as IStorage.ReadContext)).toBe("padded");
  });

  test("同じ文字列のキーへ書き込むと同じ値を上書きする", ({ expect }) => {
    // 準備：
    const storage = new Memory();

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "first");
    storage.write(createSetContext(`k1`) as IStorage.WriteContext, "second");

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("second");
  });
});

describe("プロトタイプ汚染キー", () => {
  test("__proto__ へ書き込んでも Object.prototype を汚染しない", ({ expect }) => {
    // 準備：
    const storage = new Memory();

    // 実行：
    storage.write(createSetContext("__proto__") as IStorage.WriteContext, { polluted: true });

    // 検証：
    expect(storage.read(createGetContext("__proto__") as IStorage.ReadContext)).toStrictEqual({
      polluted: true,
    });

    expect(({} as Record<string, unknown>)["polluted"]).toBe(undefined);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  test("constructor へ書き込んでも既存のキーは影響を受けない", ({ expect }) => {
    // 準備：
    const storage = new Memory();
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    storage.write(createSetContext("constructor") as IStorage.WriteContext, "shadowed");

    // 検証：
    expect(storage.read(createGetContext("constructor") as IStorage.ReadContext)).toBe("shadowed");
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
  });
});
