import { InvalidFilenameError } from "@unikvs/utils";
import { describe } from "vitest";

import Opfs from "../src/opfs.js";
import { removeRoot, test, uniqueRoot } from "./_helpers.js";

const { signal } = new AbortController();

const INTEGRITY_CASES: readonly (readonly [string, Uint8Array<ArrayBuffer>, string])[] = [
  ["0x00 を含むバイト列", new Uint8Array([0, 255, 0, 1, 0]), "nulls.bin"],
  ["すべて 0 のバイト列", new Uint8Array(256), "zeros.bin"],
  ["すべて 0xff のバイト列", new Uint8Array(256).fill(255), "ones.bin"],
  ["1 バイト", new Uint8Array([42]), "single.bin"],
  [
    "256 KiB の連続パターン",
    Uint8Array.from({ length: 256 * 1024 }, (_, index) => index % 251),
    "large.bin",
  ],
];

const INVALID_KEYS: readonly (readonly [string, string])[] = [
  ["空文字", ""],
  ["カレントディレクトリー", "."],
  ["親ディレクトリー", ".."],
  ["パス区切りを含む名前", "dir/file.bin"],
  ["バックスラッシュを含む名前", "dir\\file.bin"],
  ["Windows の予約名", "CON"],
  ["コロンを含む名前", "file:name.bin"],
  ["制御文字を含む名前", "file\u0000.bin"],
  ["NFD 形式の名前", "caf\u0065\u0301.bin"],
  ["255 バイトを超える名前", `${"a".repeat(256)}.bin`],
  ["末尾がドットの名前", "trailing."],
];

const INVALID_KEY = "dir/file.bin";

const INVALID_KEY_OPERATIONS: readonly (readonly [string, (storage: Opfs) => Promise<unknown>])[] =
  [
    ["read", (storage) => storage.read({ key: INVALID_KEY, signal })],
    ["write", (storage) => storage.write({ key: INVALID_KEY, data: new Uint8Array([1]), signal })],
    ["exists", (storage) => storage.exists({ key: INVALID_KEY, signal })],
    ["delete", (storage) => storage.delete({ key: INVALID_KEY, signal })],
    ["getWritable", (storage) => storage.getWritable({ key: INVALID_KEY, signal })],
    ["getReadable", (storage) => storage.getReadable({ key: INVALID_KEY, signal })],
  ];

describe("CRUD の振る舞い", () => {
  test("同じキーへ上書きしたとき、最新の内容だけが読み取れる", async ({ expect, storage }) => {
    // 準備
    const key = "overwrite.bin";
    await storage.write({ key, data: new Uint8Array([1, 2, 3]), signal });

    // 実行
    await storage.write({ key, data: new Uint8Array([9]), signal });
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(loaded).toStrictEqual(new Uint8Array([9]));
  });

  test("複数のキーへ書き込んだとき、それぞれ独立した内容が読み取れる", async ({
    expect,
    storage,
  }) => {
    // 準備
    const entries: readonly (readonly [string, readonly number[]])[] = [
      ["a.bin", [1]],
      ["b.bin", [2, 2]],
      ["c.bin", [3, 3, 3]],
    ];

    // 実行
    for (const [key, bytes] of entries) {
      await storage.write({ key, data: new Uint8Array(bytes), signal });
    }

    // 検証
    for (const [key, bytes] of entries) {
      expect(await storage.read({ key, signal })).toStrictEqual(new Uint8Array(bytes));
    }
  });

  test("キーを削除したとき、他のキーは影響を受けない", async ({ expect, storage }) => {
    // 準備
    await storage.write({ key: "keep.bin", data: new Uint8Array([1]), signal });
    await storage.write({ key: "remove.bin", data: new Uint8Array([2]), signal });

    // 実行
    await storage.delete({ key: "remove.bin", signal });

    // 検証
    expect(await storage.exists({ key: "remove.bin", signal })).toBe(false);
    expect(await storage.read({ key: "keep.bin", signal })).toStrictEqual(new Uint8Array([1]));
  });

  test("存在しないキーを削除しようとしたとき、NotFoundError を投げる", async ({
    expect,
    storage,
  }) => {
    // 実行
    const error = await storage.delete({ key: "missing.bin", signal }).catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });

  test("Unicode のキーを指定したとき、正しく読み書きできる", async ({ expect, storage }) => {
    // 準備
    const key = "日本語-テスト.bin";
    const data = new Uint8Array([10, 20, 30]);

    // 実行
    await storage.write({ key, data, signal });
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(loaded).toStrictEqual(data);
    expect(await storage.exists({ key, signal })).toBe(true);
  });
});

describe("一括削除 (Clear) の振る舞い", () => {
  test("サブディレクトリールートで clear したとき、消去後に再書き込みできる", async ({
    expect,
  }) => {
    // 準備
    const root = crypto.randomUUID();
    const storage = new Opfs(root);
    await storage.open({ signal });
    await storage.write({ key: "a.bin", data: new Uint8Array([1]), signal });
    await storage.write({ key: "b.bin", data: new Uint8Array([2]), signal });

    // 実行
    await storage.clear({ signal });

    // 検証
    expect(await storage.exists({ key: "a.bin", signal })).toBe(false);
    expect(await storage.exists({ key: "b.bin", signal })).toBe(false);
    expect(storage.isOpen).toBe(true);

    await storage.write({ key: "c.bin", data: new Uint8Array([3]), signal });
    expect(await storage.read({ key: "c.bin", signal })).toStrictEqual(new Uint8Array([3]));

    await removeRoot(root);
  });

  test("ネストしたルートで clear したとき、兄弟ディレクトリーのデータに影響しない", async ({
    expect,
  }) => {
    // 準備
    const base = uniqueRoot();
    const target = new Opfs(`${base}/target`);
    const sibling = new Opfs(`${base}/sibling`);
    await target.open({ signal });
    await sibling.open({ signal });
    await target.write({ key: "target.bin", data: new Uint8Array([1]), signal });
    await sibling.write({ key: "sibling.bin", data: new Uint8Array([2]), signal });

    // 実行
    await target.clear({ signal });

    // 検証
    expect(await target.exists({ key: "target.bin", signal })).toBe(false);
    expect(await sibling.exists({ key: "sibling.bin", signal })).toBe(true);
    expect(await sibling.read({ key: "sibling.bin", signal })).toStrictEqual(new Uint8Array([2]));

    await removeRoot(base);
  });

  test("ルート直下で clear したとき、すべてのデータが消去されて再書き込みできる", async ({
    expect,
  }) => {
    // 準備
    const storage = new Opfs("");
    await storage.open({ signal });
    const keys = Array.from(
      { length: 5 },
      (_, index) => `clear-${index}-${crypto.randomUUID()}.bin`,
    );
    for (const key of keys) {
      await storage.write({ key, data: new Uint8Array([1]), signal });
    }

    // 実行
    await storage.clear({ signal });

    // 検証
    for (const key of keys) {
      expect(await storage.exists({ key, signal })).toBe(false);
    }

    const key = `after-clear-${crypto.randomUUID()}.bin`;
    await storage.write({ key, data: new Uint8Array([2]), signal });
    expect(await storage.read({ key, signal })).toStrictEqual(new Uint8Array([2]));

    await storage.delete({ key, signal });
  });
});

describe("データ完全性の振る舞い", () => {
  for (const [label, data, key] of INTEGRITY_CASES) {
    test(`${label} を書き込んだとき、バイト単位で同じ内容が読み取れる`, async ({
      expect,
      storage,
    }) => {
      // 実行
      await storage.write({ key, data, signal });
      const loaded = await storage.read({ key, signal });

      // 検証
      expect(loaded).toStrictEqual(data);
    });
  }
});

describe("キー検証の振る舞い", () => {
  for (const [label, operation] of INVALID_KEY_OPERATIONS) {
    test(`無効なキーで ${label} を呼び出したとき、InvalidFilenameError を投げる`, async ({
      expect,
      storage,
    }) => {
      // 実行
      const error = await operation(storage).catch((ex: unknown) => ex);

      // 検証
      expect(error).toBeInstanceOf(InvalidFilenameError);
    });
  }

  for (const [label, key] of INVALID_KEYS) {
    test(`${label} をキーに指定したとき、InvalidFilenameError を投げる`, async ({
      expect,
      storage,
    }) => {
      // 実行
      const error = await storage.exists({ key, signal }).catch((ex: unknown) => ex);

      // 検証
      expect(error).toBeInstanceOf(InvalidFilenameError);
    });
  }

  test("開いていないストレージでも、無効なキーなら検証エラーが発生する", async ({ expect }) => {
    // 準備
    const storage = new Opfs(uniqueRoot());

    // 実行
    const error = await storage
      .write({ key: INVALID_KEY, data: new Uint8Array(), signal })
      .catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(InvalidFilenameError);
    expect(storage.isOpen).toBe(false);
  });
});
