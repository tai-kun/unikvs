import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
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
    [
      "read",
      (storage) => storage.read(createGetContext(INVALID_KEY, { signal }) as IStorage.ReadContext),
    ],
    [
      "write",
      (storage) =>
        storage.write(
          createSetContext(INVALID_KEY, { signal }) as IStorage.WriteContext,
          new Uint8Array([1]),
        ),
    ],
    [
      "exists",
      (storage) =>
        storage.exists(createHasContext(INVALID_KEY, { signal }) as IStorage.ExistsContext),
    ],
    [
      "delete",
      (storage) =>
        storage.delete(createDeleteContext(INVALID_KEY, { signal }) as IStorage.DeleteContext),
    ],
    [
      "getWritable",
      (storage) =>
        storage.getWritable(
          createSetContext(INVALID_KEY, { signal }) as IStorage.GetWritableContext,
        ),
    ],
    [
      "getReadable",
      (storage) =>
        storage.getReadable(
          createStreamContext(INVALID_KEY, { signal }) as IStorage.GetReadableContext,
        ),
    ],
  ];

describe("CRUD の振る舞い", () => {
  test("同じキーへ上書きしたとき、最新の内容だけが読み取れる", async ({ expect, storage }) => {
    // 準備
    const key = "overwrite.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );
    const loaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

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
      await storage.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array(bytes),
      );
    }

    // 検証
    for (const [key, bytes] of entries) {
      expect(
        await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
      ).toStrictEqual(new Uint8Array(bytes));
    }
  });

  test("キーを削除したとき、他のキーは影響を受けない", async ({ expect, storage }) => {
    // 準備
    await storage.write(
      createSetContext("keep.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("remove.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行
    await storage.delete(createDeleteContext("remove.bin", { signal }) as IStorage.DeleteContext);

    // 検証
    expect(
      await storage.exists(createHasContext("remove.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(
      await storage.read(createGetContext("keep.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1]));
  });

  test("存在しないキーを削除しようとしたとき、NotFoundError を投げる", async ({
    expect,
    storage,
  }) => {
    // 実行
    const error = await storage
      .delete(createDeleteContext("missing.bin", { signal }) as IStorage.DeleteContext)
      .catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });

  test("Unicode のキーを指定したとき、正しく読み書きできる", async ({ expect, storage }) => {
    // 準備
    const key = "日本語-テスト.bin";
    const data = new Uint8Array([10, 20, 30]);

    // 実行
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
    const loaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(loaded).toStrictEqual(data);
    expect(await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
  });
});

describe("一括削除 (Clear) の振る舞い", () => {
  test("サブディレクトリールートで clear したとき、消去後に再書き込みできる", async ({
    expect,
  }) => {
    // 準備
    const root = crypto.randomUUID();
    const storage = new Opfs(root);
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("a.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("b.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    expect(
      await storage.exists(createHasContext("a.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(
      await storage.exists(createHasContext("b.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(storage.isOpen).toBe(true);

    await storage.write(
      createSetContext("c.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([3]),
    );
    expect(
      await storage.read(createGetContext("c.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([3]));

    await removeRoot(root);
  });

  test("ネストしたルートで clear したとき、兄弟ディレクトリーのデータに影響しない", async ({
    expect,
  }) => {
    // 準備
    const base = uniqueRoot();
    const target = new Opfs(`${base}/target`);
    const sibling = new Opfs(`${base}/sibling`);
    await target.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await sibling.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await target.write(
      createSetContext("target.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await sibling.write(
      createSetContext("sibling.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行
    await target.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    expect(
      await target.exists(createHasContext("target.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(
      await sibling.exists(createHasContext("sibling.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(true);
    expect(
      await sibling.read(createGetContext("sibling.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([2]));

    await removeRoot(base);
  });

  test("ルート直下で clear したとき、すべてのデータが消去されて再書き込みできる", async ({
    expect,
  }) => {
    // 準備
    const storage = new Opfs("");
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const keys = Array.from(
      { length: 5 },
      (_, index) => `clear-${index}-${crypto.randomUUID()}.bin`,
    );
    for (const key of keys) {
      await storage.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
    }

    // 実行
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    for (const key of keys) {
      expect(
        await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).toBe(false);
    }

    const key = `after-clear-${crypto.randomUUID()}.bin`;
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([2]));

    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);
  });
});

describe("データ完全性の振る舞い", () => {
  for (const [label, data, key] of INTEGRITY_CASES) {
    test(`${label} を書き込んだとき、バイト単位で同じ内容が読み取れる`, async ({
      expect,
      storage,
    }) => {
      // 実行
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
      const loaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

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
      const error = await storage
        .exists(createHasContext(key, { signal }) as IStorage.ExistsContext)
        .catch((ex: unknown) => ex);

      // 検証
      expect(error).toBeInstanceOf(InvalidFilenameError);
    });
  }

  test("開いていないストレージでも、無効なキーなら検証エラーが発生する", async ({ expect }) => {
    // 準備
    const storage = new Opfs(uniqueRoot());

    // 実行
    const error = await storage
      .write(createSetContext(INVALID_KEY, { signal }) as IStorage.WriteContext, new Uint8Array())
      .catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(InvalidFilenameError);
    expect(storage.isOpen).toBe(false);
  });
});
