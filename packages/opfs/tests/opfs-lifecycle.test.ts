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
import { InvalidDirnameError } from "@unikvs/utils";
import { describe, expectTypeOf } from "vitest";

import Opfs, { type OpfsOptions } from "../src/opfs.js";
import { removeRoot, test, uniqueRoot } from "./_helpers.js";

const { signal } = new AbortController();

const INVALID_DIRNAMES: readonly (readonly [string, string])[] = [
  ["Windows の予約名", "CON"],
  ["予約名を含むネストしたパス", "nested/COM1"],
  ["コロンを含む名前", "dir:name"],
  ["カレントディレクトリー", "a/./b"],
  ["親ディレクトリー", "a/../b"],
  ["NFD 形式の名前", "caf\u0065\u0301"],
  ["255 バイトを超える名前", "a".repeat(256)],
  ["制御文字を含む名前", "bad\u0000name"],
  ["末尾がドットの名前", "trailing."],
  ["末尾が空白の名前", "trailing "],
];

const ROOT_DIRECT_CASES: readonly (readonly [string, string])[] = [
  ["空文字", ""],
  ["カレントディレクトリー", "."],
  ["ルートスラッシュ", "/"],
];

const UNOPENED_OPERATIONS: readonly (readonly [string, (storage: Opfs) => Promise<unknown>])[] = [
  [
    "read",
    (storage) => storage.read(createGetContext("valid.bin", { signal }) as IStorage.ReadContext),
  ],
  [
    "write",
    (storage) =>
      storage.write(
        createSetContext("valid.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
  ],
  [
    "exists",
    (storage) =>
      storage.exists(createHasContext("valid.bin", { signal }) as IStorage.ExistsContext),
  ],
  [
    "delete",
    (storage) =>
      storage.delete(createDeleteContext("valid.bin", { signal }) as IStorage.DeleteContext),
  ],
  [
    "getWritable",
    (storage) =>
      storage.getWritable(createSetContext("valid.bin", { signal }) as IStorage.GetWritableContext),
  ],
  [
    "getReadable",
    (storage) =>
      storage.getReadable(
        createStreamContext("valid.bin", { signal }) as IStorage.GetReadableContext,
      ),
  ],
];

describe("コンストラクターの振る舞い", () => {
  test("文字列ルートを指定したとき、open するまでは未オープン状態になる", ({ expect, root }) => {
    // 準備
    const storage = new Opfs(root);

    // 実行と検証
    expect(storage.isOpen).toBe(false);
  });

  test("既定の引数を省略したとき、既定のルートで利用できる", async ({ expect }) => {
    // 準備
    const storage = new Opfs();
    const key = `default-${crypto.randomUUID()}.bin`;

    // 実行
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2]),
    );
    const loaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(loaded).toStrictEqual(new Uint8Array([1, 2]));

    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);
  });

  for (const [label, root] of ROOT_DIRECT_CASES) {
    test(`${label} のルートを指定したとき、OPFS ルート直下が作業対象になる`, async ({ expect }) => {
      // 準備
      const writer = new Opfs("");
      await writer.open(createOpenContext({ signal }) as IStorage.OpenContext);
      const key = `direct-${crypto.randomUUID()}.bin`;
      await writer.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array([7]),
      );

      // 実行
      const storage = new Opfs(root);
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      const loaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

      // 検証
      expect(loaded).toStrictEqual(new Uint8Array([7]));

      await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);
    });
  }

  test.fails("スラッシュだけのルートを指定したとき、OPFS ルート直下として扱われる", async ({
    expect,
  }) => {
    // 準備
    const writer = new Opfs("//");
    await writer.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = `slashes-${crypto.randomUUID()}.bin`;
    await writer.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([8]),
    );

    // 実行
    const storage = new Opfs("/");
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const loaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(loaded).toStrictEqual(new Uint8Array([8]));

    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);
  });

  test("連続・先頭・末尾のスラッシュを含むルートを指定したとき、正規化されて同じ作業対象になる", async ({
    expect,
  }) => {
    // 準備
    const root = uniqueRoot();
    const writer = new Opfs(`//${root}//`);
    await writer.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "normalized.bin";
    await writer.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2]),
    );

    // 実行
    const storage = new Opfs(root);
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const loaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(loaded).toStrictEqual(new Uint8Array([1, 2]));

    await removeRoot(root);
  });

  test("Unicode を含むルートを指定したとき、正規化されて利用できる", async ({ expect }) => {
    // 準備
    const root = uniqueRoot("unikvs-日本語");
    const storage = new Opfs(root);
    const key = "データ.bin";

    // 実行
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([3]),
    );
    const loaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(loaded).toStrictEqual(new Uint8Array([3]));

    await removeRoot(root);
  });

  for (const [label, dirname] of INVALID_DIRNAMES) {
    test(`${label} を指定したとき、InvalidDirnameError を投げる`, ({ expect }) => {
      // 実行と検証
      expect(() => new Opfs(dirname)).toThrow(InvalidDirnameError);
    });
  }

  test("取得済みのディレクトリーハンドルを指定したとき、open なしでオープン状態になる", async ({
    expect,
  }) => {
    // 準備
    const opfsRoot = await navigator.storage.getDirectory();
    const dirname = `unikvs-handle-${crypto.randomUUID()}`;
    const handle = await opfsRoot.getDirectoryHandle(dirname, { create: true });
    const storage = new Opfs(handle);
    const key = "handle.bin";

    // 実行
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([4]),
    );
    const loaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(loaded).toStrictEqual(new Uint8Array([4]));

    await opfsRoot.removeEntry(dirname, { recursive: true });
  });

  test("トップレベルのディレクトリーハンドルを指定したとき、clear 後も同じ場所を操作し続ける", async ({
    expect,
  }) => {
    // 準備
    const opfsRoot = await navigator.storage.getDirectory();
    const dirname = `unikvs-handle-${crypto.randomUUID()}`;
    const handle = await opfsRoot.getDirectoryHandle(dirname, { create: true });
    const storage = new Opfs(handle);
    const key = "handle.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([4]),
    );

    // 実行
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
    const existsAfterClear = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([5]),
    );
    const reloaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(existsAfterClear).toBe(false);
    expect(reloaded).toStrictEqual(new Uint8Array([5]));

    await opfsRoot.removeEntry(dirname, { recursive: true });
  });

  test.fails("ネストしたディレクトリーハンドルを指定したとき、clear が対象ディレクトリーだけを空にする", async ({
    expect,
  }) => {
    // 準備
    const opfsRoot = await navigator.storage.getDirectory();
    const parentName = `unikvs-handle-${crypto.randomUUID()}`;
    const parent = await opfsRoot.getDirectoryHandle(parentName, { create: true });
    const handle = await parent.getDirectoryHandle("inner", { create: true });
    const storage = new Opfs(handle);
    const key = "nested.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([6]),
    );

    try {
      // 実行
      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      // 検証
      expect(
        await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).toBe(false);
    } finally {
      await opfsRoot.removeEntry(parentName, { recursive: true });
    }
  });

  test("OPFS ルートのディレクトリーハンドルを指定したとき、ルート直下を操作できる", async ({
    expect,
  }) => {
    // 準備
    const opfsRoot = await navigator.storage.getDirectory();
    const storage = new Opfs(opfsRoot);
    const key = `root-handle-${crypto.randomUUID()}.bin`;

    // 実行
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );
    const loaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(loaded).toStrictEqual(new Uint8Array([9]));

    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);
  });
});

describe("ライフサイクルの振る舞い", () => {
  test("open を二重に呼び出したとき、状態とデータが維持される", async ({ expect, storage }) => {
    // 準備
    const key = "twice.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  for (const [label, operation] of UNOPENED_OPERATIONS) {
    test(`open 前に ${label} を呼び出したとき、TypeError を投げる`, async ({ expect }) => {
      // 準備
      const storage = new Opfs(uniqueRoot());

      // 実行と検証
      await expect(operation(storage)).rejects.toBeInstanceOf(TypeError);
    });
  }

  test("open 前に存在しないルートで clear を呼び出したとき、NotFoundError を投げる", async ({
    expect,
  }) => {
    // 準備
    const storage = new Opfs(uniqueRoot());

    // 実行
    const error = await storage
      .clear(createClearContext("", { signal }) as IStorage.ClearContext)
      .catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
    expect(storage.isOpen).toBe(false);
  });

  test.fails("open 前に既存のルートで clear を呼び出したとき、エラーになる", async ({
    expect,
    root,
  }) => {
    // 準備
    const opened = new Opfs(root);
    await opened.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const unopened = new Opfs(root);

    // 実行と検証
    await expect(
      unopened.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).rejects.toThrow();
  });

  test("同じルートを別のインスタンスで開いたとき、保存済みデータを読み取れる", async ({
    expect,
    root,
  }) => {
    // 準備
    const first = new Opfs(root);
    await first.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await first.write(
      createSetContext("shared.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([5, 6]),
    );

    // 実行
    const second = new Opfs(root);
    await second.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const loaded = await second.read(
      createGetContext("shared.bin", { signal }) as IStorage.ReadContext,
    );

    // 検証
    expect(loaded).toStrictEqual(new Uint8Array([5, 6]));
    expect(second.isOpen).toBe(true);
  });

  test("複数のインスタンスを同時に利用したとき、同じデータを共有できる", async ({
    expect,
    root,
  }) => {
    // 準備
    const first = new Opfs(root);
    const second = new Opfs(root);
    await first.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await second.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    await first.write(
      createSetContext("a.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await second.write(
      createSetContext("b.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 検証
    expect(
      await second.read(createGetContext("a.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1]));
    expect(
      await first.read(createGetContext("b.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([2]));
  });

  test("IStorage 実装として扱える", ({ expect }) => {
    // 準備
    const storage: IStorage = new Opfs();

    // 実行と検証
    expectTypeOf(storage).toMatchTypeOf<IStorage>();
    expect(storage).toBeInstanceOf(Opfs);
    expect(storage.name).toBe("Opfs");
    expect(storage.isOpen).toBe(false);
  });

  test("コンストラクターが string または FileSystemDirectoryHandle を受け取る", ({ expect }) => {
    // 準備
    const withString: ConstructorParameters<typeof Opfs> = ["valid-root"];

    // 実行と検証
    expectTypeOf(Opfs).constructorParameters.toEqualTypeOf<
      [root?: string | FileSystemDirectoryHandle | undefined, _options?: OpfsOptions | undefined]
    >();
    expect(withString).toStrictEqual(["valid-root"]);
    expect(new Opfs("valid-root")).toBeInstanceOf(Opfs);
    expect(new Opfs("valid-root", {})).toBeInstanceOf(Opfs);
    expect(new Opfs({} as FileSystemDirectoryHandle).isOpen).toBe(true);
    // @ts-expect-error 数値はルートとして受け付けません。
    expect(new Opfs(1)).toBeInstanceOf(Opfs);
  });
});
