import type { IStorage } from "@unikvs/core";
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
  ["read", (storage) => storage.read({ key: "valid.bin", signal })],
  [
    "write",
    (storage) => storage.write({ key: "valid.bin", data: new Uint8Array([1]), signal, vars: {} }),
  ],
  ["exists", (storage) => storage.exists({ key: "valid.bin", signal })],
  ["delete", (storage) => storage.delete({ key: "valid.bin", signal })],
  ["getWritable", (storage) => storage.getWritable({ key: "valid.bin", signal, vars: {} })],
  ["getReadable", (storage) => storage.getReadable({ key: "valid.bin", signal })],
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
    await storage.open({ signal });
    await storage.write({ key, data: new Uint8Array([1, 2]), signal, vars: {} });
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(loaded).toStrictEqual(new Uint8Array([1, 2]));

    await storage.delete({ key, signal });
  });

  for (const [label, root] of ROOT_DIRECT_CASES) {
    test(`${label} のルートを指定したとき、OPFS ルート直下が作業対象になる`, async ({ expect }) => {
      // 準備
      const writer = new Opfs("");
      await writer.open({ signal });
      const key = `direct-${crypto.randomUUID()}.bin`;
      await writer.write({ key, data: new Uint8Array([7]), signal, vars: {} });

      // 実行
      const storage = new Opfs(root);
      await storage.open({ signal });
      const loaded = await storage.read({ key, signal });

      // 検証
      expect(loaded).toStrictEqual(new Uint8Array([7]));

      await storage.delete({ key, signal });
    });
  }

  test.fails("スラッシュだけのルートを指定したとき、OPFS ルート直下として扱われる", async ({
    expect,
  }) => {
    // 準備
    const writer = new Opfs("//");
    await writer.open({ signal });
    const key = `slashes-${crypto.randomUUID()}.bin`;
    await writer.write({ key, data: new Uint8Array([8]), signal, vars: {} });

    // 実行
    const storage = new Opfs("/");
    await storage.open({ signal });
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(loaded).toStrictEqual(new Uint8Array([8]));

    await storage.delete({ key, signal });
  });

  test("連続・先頭・末尾のスラッシュを含むルートを指定したとき、正規化されて同じ作業対象になる", async ({
    expect,
  }) => {
    // 準備
    const root = uniqueRoot();
    const writer = new Opfs(`//${root}//`);
    await writer.open({ signal });
    const key = "normalized.bin";
    await writer.write({ key, data: new Uint8Array([1, 2]), signal, vars: {} });

    // 実行
    const storage = new Opfs(root);
    await storage.open({ signal });
    const loaded = await storage.read({ key, signal });

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
    await storage.open({ signal });
    await storage.write({ key, data: new Uint8Array([3]), signal, vars: {} });
    const loaded = await storage.read({ key, signal });

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
    await storage.write({ key, data: new Uint8Array([4]), signal, vars: {} });
    const loaded = await storage.read({ key, signal });

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
    await storage.write({ key, data: new Uint8Array([4]), signal, vars: {} });

    // 実行
    await storage.clear({ signal });
    const existsAfterClear = await storage.exists({ key, signal });
    await storage.write({ key, data: new Uint8Array([5]), signal, vars: {} });
    const reloaded = await storage.read({ key, signal });

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
    await storage.write({ key, data: new Uint8Array([6]), signal, vars: {} });

    try {
      // 実行
      await storage.clear({ signal });

      // 検証
      expect(await storage.exists({ key, signal })).toBe(false);
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
    await storage.write({ key, data: new Uint8Array([9]), signal, vars: {} });
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(loaded).toStrictEqual(new Uint8Array([9]));

    await storage.delete({ key, signal });
  });
});

describe("ライフサイクルの振る舞い", () => {
  test("open を二重に呼び出したとき、状態とデータが維持される", async ({ expect, storage }) => {
    // 準備
    const key = "twice.bin";
    await storage.write({ key, data: new Uint8Array([1, 2, 3]), signal, vars: {} });

    // 実行
    await storage.open({ signal });
    await storage.open({ signal });

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(await storage.read({ key, signal })).toStrictEqual(new Uint8Array([1, 2, 3]));
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
    const error = await storage.clear({ signal }).catch((ex: unknown) => ex);

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
    await opened.open({ signal });
    const unopened = new Opfs(root);

    // 実行と検証
    await expect(unopened.clear({ signal })).rejects.toThrow();
  });

  test("同じルートを別のインスタンスで開いたとき、保存済みデータを読み取れる", async ({
    expect,
    root,
  }) => {
    // 準備
    const first = new Opfs(root);
    await first.open({ signal });
    await first.write({ key: "shared.bin", data: new Uint8Array([5, 6]), signal, vars: {} });

    // 実行
    const second = new Opfs(root);
    await second.open({ signal });
    const loaded = await second.read({ key: "shared.bin", signal });

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
    await first.open({ signal });
    await second.open({ signal });

    // 実行
    await first.write({ key: "a.bin", data: new Uint8Array([1]), signal, vars: {} });
    await second.write({ key: "b.bin", data: new Uint8Array([2]), signal, vars: {} });

    // 検証
    expect(await second.read({ key: "a.bin", signal })).toStrictEqual(new Uint8Array([1]));
    expect(await first.read({ key: "b.bin", signal })).toStrictEqual(new Uint8Array([2]));
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
      [root?: string | FileSystemDirectoryHandle | undefined, options?: OpfsOptions | undefined]
    >();
    expect(withString).toStrictEqual(["valid-root"]);
    expect(new Opfs("valid-root")).toBeInstanceOf(Opfs);
    expect(new Opfs({} as FileSystemDirectoryHandle).isOpen).toBe(true);
    // @ts-expect-error 数値はルートとして受け付けません。
    expect(new Opfs(1)).toBeInstanceOf(Opfs);
  });
});
