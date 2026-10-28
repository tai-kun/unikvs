// oxlint-disable import/no-namespace -- インデックスの全エクスポートを検証するため、名前空間 import を使用します。
import type { IStorage, IMiddleware } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import {
  readAll,
  createNext,
  sourceFrom,
  captureThrown,
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createCopyContext,
  createMoveContext,
  createClearContext,
  createDecodeContext,
  createDeleteContext,
  createEncodeContext,
  createStreamContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { vi, test, describe } from "vite-plus/test";

import {
  KeyNotFoundError,
  TombstoneNotFoundError,
  SoftDeleteInvalidRetentionError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import SoftDelete, { type SoftDeleteOptions } from "../src/soft-delete.js";

/**
 * 指定ミリ秒だけ待ちます。
 * 保持期限の遅延失効の検証に使用します。
 */
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 削除墓標の台帳を下層ストレージに保存するときの予約キーです。
 * 予約キーを直接操作する検証に使用します。
 */
const REGISTRY_KEY = "__unikvs_soft_delete_registry__";

/**
 * 最小の手書きストレージです。
 * ストリーム非対応の下層を引き渡したときの振る舞いの検証に使います。
 */
class MinimalStorage implements IStorage {
  public readonly name: string = "Minimal";

  public readonly isOpen: boolean = true;

  public readonly onOtherWriteErrorCalls: unknown[][] = [];

  public async onOtherWriteError(
    c: IStorage.OtherWriteErrorHandlerContext,
    errors: readonly IStorage.IOtherWriteError[],
  ): Promise<void> {
    this.onOtherWriteErrorCalls.push([c, errors]);
  }

  public async write(_c: IStorage.WriteContext, _data: unknown): Promise<void> {}

  public async read(c: IStorage.ReadContext): Promise<unknown> {
    throw new KeyNotFoundError({ key: c.key });
  }

  public async exists(_c: IStorage.ExistsContext): Promise<boolean> {
    return false;
  }

  public async delete(_c: IStorage.DeleteContext): Promise<void> {}

  public async copy(_c: IStorage.CopyContext): Promise<void> {}

  public async move(_c: IStorage.MoveContext): Promise<void> {}

  public async clear(_c: IStorage.ClearContext): Promise<void> {}
}

/**
 * 指定キーへの書き込みだけを失敗させる下層ストレージです。
 * 移動先への書き込み失敗時に移動元が残ることの検証に使います。
 */
class FailOnWriteStorage extends Memory {
  readonly #failKey: string;

  public constructor(failKey: string) {
    super();
    this.#failKey = failKey;
  }

  public override write(c: IStorage.WriteContext, data: unknown): void {
    if (c.key === this.#failKey) {
      throw new Error("write failed");
    }

    super.write(c, data);
  }
}

describe("初期化と基本属性", () => {
  test("name は SoftDelete である", ({ expect }) => {
    // 実行と検証：
    expect(new SoftDelete(new Memory()).name).toBe("SoftDelete");
  });

  test("isOpen は下層ストレージに委譲される", ({ expect }) => {
    // 準備：
    const opened = new SoftDelete(new Memory());
    const closedInner = new Memory();
    Object.defineProperty(closedInner, "isOpen", { value: false });

    // 実行と検証：
    expect(opened.isOpen).toBe(true);
    expect(new SoftDelete(closedInner).isOpen).toBe(false);
  });

  test("retentionMs の既定値は undefined である", ({ expect }) => {
    // 実行と検証：
    expect(new SoftDelete(new Memory()).retentionMs).toBeUndefined();
    expect(new SoftDelete(new Memory(), {}).retentionMs).toBeUndefined();
    expect(new SoftDelete(new Memory(), { retentionMs: undefined }).retentionMs).toBeUndefined();
  });

  test("retentionMs に 0 以上の有限値を指定できる", ({ expect }) => {
    // 準備：
    const options: SoftDeleteOptions = { retentionMs: 60_000 };

    // 実行と検証：
    expect(new SoftDelete(new Memory(), options).retentionMs).toBe(60_000);

    expect(new SoftDelete(new Memory(), { retentionMs: 0 }).retentionMs).toBe(0);
  });

  for (const actual of [-1, Number.NaN, Number.POSITIVE_INFINITY, "100", null]) {
    test(`retentionMs に ${String(actual)} を指定したとき、SoftDeleteInvalidRetentionError を投げる`, ({
      expect,
    }) => {
      // 実行と検証：
      expect(() => new SoftDelete(new Memory(), { retentionMs: actual as number })).toThrow(
        SoftDeleteInvalidRetentionError,
      );
    });
  }

  test("無効な retentionMs のエラーは実際値を保持する", ({ expect }) => {
    // 実行：
    const error = captureThrown(() => new SoftDelete(new Memory(), { retentionMs: -1 }));

    // 検証：
    expect(error).toMatchObject({
      meta: { actual: -1 },
      name: "UniKvsSoftDeleteInvalidRetentionError",
      message:
        "Invalid retentionMs -1: retentionMs must be a non-negative finite number of milliseconds.",
    });
  });
});

describe("index のエクスポート", () => {
  test("SoftDelete とエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.SoftDelete).toBe(SoftDelete);
    expect(index.TombstoneNotFoundError).toBe(TombstoneNotFoundError);
    expect(index.SoftDeleteInvalidRetentionError).toBe(SoftDeleteInvalidRetentionError);
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
  });
});

describe("エラーの形状", () => {
  test("TombstoneNotFoundError はキーを持つ", ({ expect }) => {
    // 実行：
    const error = new TombstoneNotFoundError({ key: "k1" });

    // 検証：
    expect(error).toMatchObject({
      meta: { key: "k1" },
      name: "UniKvsTombstoneNotFoundError",
      message: "Tombstone not found for key: k1",
    });
    expect(error.cause).toBeUndefined();
  });

  test("TombstoneNotFoundError は cause を引き継ぐ", ({ expect }) => {
    // 準備：
    const cause = new Error("upstream failure");

    // 実行：
    const error = new TombstoneNotFoundError({
      key: "k1",
      cause,
    });

    // 検証：
    expect(error.cause).toBe(cause);
    expect(error.meta).toStrictEqual({ key: "k1" });
  });
});

describe("encode と decode の透過", () => {
  test("encode は値をそのまま返す", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());

    // 実行と検証：
    for (const data of ["hello", new Uint8Array([1, 2, 3]), { nested: true }, 42, null]) {
      const c = createEncodeContext(data, "k1");
      await softDelete.encode(c as IMiddleware.EncodeContext, createNext());
      expect(c.destination).toBe(data);
    }
  });

  test("decode は墓標でない値をそのまま返す", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());

    // 実行と検証：
    for (const data of ["hello", new Uint8Array([1, 2, 3]), { nested: true }, 42, null]) {
      const c = createDecodeContext(data, "k1");
      await softDelete.decode(c as IMiddleware.DecodeContext, createNext());
      expect(c.destination).toBe(data);
    }
  });

  test("decode は墓標を KeyNotFoundError として扱う", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    const tombstone = {
      value: "v",
      hasValue: true,
      deletedAt: Date.now(),
      __tombstone: true,
    };

    // 実行：
    const error = await captureRejection(
      softDelete.decode(
        createDecodeContext(tombstone, "k1") as IMiddleware.DecodeContext,
        createNext(),
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      meta: { key: "k1" },
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: k1",
    });
  });

  test("decode は __tombstone が真でない値を墓標とみなさない", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    const data = {
      deletedAt: 1,
      __tombstone: false,
    };

    // 実行：
    const c = createDecodeContext(data, "k1");
    await softDelete.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証：
    expect(c.destination).toBe(data);
  });
});

describe("ストリームの透過", () => {
  test("encodeStream と decodeStream はチャンクをそのまま流す", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }, 42];

    // 実行：
    const encodeContext = createEncodeStreamContext(sourceFrom(chunks), "k1");
    await softDelete.encodeStream(encodeContext as IMiddleware.EncodeStreamContext, createNext());

    const decodeContext = createDecodeStreamContext(sourceFrom(chunks), "k1");
    await softDelete.decodeStream(decodeContext as IMiddleware.DecodeStreamContext, createNext());

    // 検証：
    expect(await readAll(encodeContext.destination)).toStrictEqual(chunks);
    expect(await readAll(decodeContext.destination)).toStrictEqual(chunks);
  });
});

/**
 * use 用のコンテキストを操作ごとに作成します。
 * 全操作の透過の検証に使用します。
 */
function createUseContext(action: IMiddleware.UseContext["action"]): IMiddleware.UseContext {
  switch (action) {
    case "set": {
      return createSetContext("k1") as IMiddleware.UseContext;
    }

    case "get": {
      return createGetContext("k1") as IMiddleware.UseContext;
    }

    case "stream": {
      return createStreamContext("k1") as IMiddleware.UseContext;
    }

    case "has": {
      return createHasContext("k1") as IMiddleware.UseContext;
    }

    case "delete": {
      return createDeleteContext("k1") as IMiddleware.UseContext;
    }

    case "copy": {
      return createCopyContext("k1", "k2") as IMiddleware.UseContext;
    }

    case "move": {
      return createMoveContext("k1", "k2") as IMiddleware.UseContext;
    }

    case "clear": {
      return createClearContext() as unknown as IMiddleware.UseContext;
    }

    default: {
      throw new Error("Unknown action");
    }
  }
}

describe("use の透過", () => {
  test("すべての操作で next に委譲する", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    const contexts: IMiddleware.UseContext[] = [
      createUseContext("set"),
      createUseContext("get"),
      createUseContext("stream"),
      createUseContext("has"),
      createUseContext("delete"),
      createUseContext("clear"),
    ];

    // 実行と検証：
    for (const c of contexts) {
      let called = false;
      await softDelete.use(c, async () => {
        called = true;
      });
      expect(called).toBe(true);
    }
  });
});

describe("下層ストレージへの委譲", () => {
  test("write・read・exists が連動し、delete の後は存在しなくなる", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());

    // 実行：
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 検証：
    expect(await softDelete.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(true);
    expect(await softDelete.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");

    // 実行：
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 検証 : 削除は墓標化されるため、存在確認は false になる。
    expect(await softDelete.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("clear を下層へ委譲する", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    await softDelete.clear(createClearContext() as unknown as IStorage.ClearContext);

    // 検証：
    expect(await softDelete.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("ストリーム非対応の下層では getReadable と getWritable が未定義になる", ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new MinimalStorage());

    // 実行と検証：
    expect(softDelete.getReadable).toBeUndefined();
    expect(softDelete.getWritable).toBeUndefined();
  });

  test("onOtherWriteError を下層へ転送する", async ({ expect }) => {
    // 準備：
    const inner = new MinimalStorage();
    const softDelete = new SoftDelete(inner);
    const context = createSetContext("k1");
    const errors = [
      {
        errors: [],
        plugin: "storage",
      },
    ] as unknown as readonly IStorage.IOtherWriteError[];

    // 実行：
    await softDelete.onOtherWriteError(
      context as unknown as IStorage.OtherWriteErrorHandlerContext,
      errors,
    );

    // 検証：
    expect(inner.onOtherWriteErrorCalls).toHaveLength(1);
    expect(inner.onOtherWriteErrorCalls[0]?.[1]).toBe(errors);
  });

  test("下層が onOtherWriteError を持たないときは何もしない", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    const context = createSetContext("k1");
    const errors = [
      {
        errors: [],
        plugin: "storage",
      },
    ] as unknown as readonly IStorage.IOtherWriteError[];

    // 実行と検証 : 対応しない下層でも失敗しない。
    await expect(
      softDelete.onOtherWriteError(
        context as unknown as IStorage.OtherWriteErrorHandlerContext,
        errors,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("copy と move", () => {
  test("copy はコピー元とコピー先の両方に有効な値を残す", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    await softDelete.copy(createCopyContext("k1", "k2") as IStorage.CopyContext);

    // 検証：
    expect(await softDelete.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(await softDelete.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");
    expect(await softDelete.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(true);
    expect(await softDelete.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(true);
  });

  test("copy はコピー先の墓標を上書きして台帳から外す", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.write(createSetContext("k2") as IStorage.WriteContext, "old");
    await softDelete.delete(createDeleteContext("k2") as IStorage.DeleteContext);

    // 実行：
    await softDelete.copy(createCopyContext("k1", "k2") as IStorage.CopyContext);

    // 検証：
    expect(await softDelete.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");
    expect(await softDelete.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(true);
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });

  test("copy のコピー元が墓標のとき、KeyNotFoundError を投げてコピー先を作らない", async ({
    expect,
  }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 実行：
    const error = await captureRejection(
      softDelete.copy(createCopyContext("k1", "k2") as IStorage.CopyContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "k1" });

    expect(await softDelete.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(false);
  });

  test("copy のコピー元とコピー先が同じとき、有効な値は削除せずに残る", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    await softDelete.copy(createCopyContext("k1", "k1") as IStorage.CopyContext);

    // 検証：
    expect(await softDelete.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(await softDelete.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(true);
  });

  test("copy のコピー元とコピー先が同じで墓標のとき、KeyNotFoundError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 実行と検証：
    await expect(
      softDelete.copy(createCopyContext("k1", "k1") as IStorage.CopyContext),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("move は移動先へ書き込んだ後に移動元を墓標化する", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    await softDelete.move(createMoveContext("k1", "k2") as IStorage.MoveContext);

    // 検証：
    expect(await softDelete.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");
    expect(await softDelete.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(await softDelete.listTombstones()).toMatchObject([{ key: "k1" }]);
    // 移動元は復元できる墓標として残る。
    expect(await softDelete.restore("k1")).toBe("v1");
  });

  test("move は移動先の墓標を上書きし、移動元だけを墓標化する", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.write(createSetContext("k2") as IStorage.WriteContext, "old");
    await softDelete.delete(createDeleteContext("k2") as IStorage.DeleteContext);

    // 実行：
    await softDelete.move(createMoveContext("k1", "k2") as IStorage.MoveContext);

    // 検証：
    expect(await softDelete.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");

    const tombstones = await softDelete.listTombstones();
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]?.key).toBe("k1");
  });

  test("move の移動元が墓標のとき、KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 実行と検証：
    await expect(
      softDelete.move(createMoveContext("k1", "k2") as IStorage.MoveContext),
    ).rejects.toThrow(KeyNotFoundError);
    expect(await softDelete.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(false);
  });

  test("move の移動元と移動先が同じとき、墓標化せずに値を残す", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    await softDelete.move(createMoveContext("k1", "k1") as IStorage.MoveContext);

    // 検証：
    expect(await softDelete.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(await softDelete.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(true);
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });

  test("move の移動先への書き込みが失敗したとき、移動元は墓標化されず残る", async ({ expect }) => {
    // 準備：移動先への書き込みだけ失敗する下層ストレージ。
    const softDelete = new SoftDelete(new FailOnWriteStorage("k2"));
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行と検証：
    await expect(
      softDelete.move(createMoveContext("k1", "k2") as IStorage.MoveContext),
    ).rejects.toThrow("write failed");
    expect(await softDelete.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(await softDelete.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(true);
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });
});

describe("墓標の直接操作", () => {
  test("read は墓標を KeyNotFoundError として扱う", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 実行：
    const error = await captureRejection(
      softDelete.read(createGetContext("k1") as IStorage.ReadContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "k1" });
  });

  test("二重削除は直接呼び出しても冪等に成功する", async ({ expect }) => {
    // 準備：
    const inner = new Memory();
    const softDelete = new SoftDelete(inner);
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    const first = await softDelete.listTombstones();

    // 実行：
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 検証 : 削除時刻は保たれ、墓標は残る。
    expect(await softDelete.listTombstones()).toStrictEqual(first);
    expect(await softDelete.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(inner.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(true);
  });

  test("存在しないキーへの delete は下層の規約に委ねられる", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());

    // 実行：
    const error = await captureRejection(
      softDelete.delete(createDeleteContext("unknown") as IStorage.DeleteContext),
    );

    // 検証 : Memory は存在しないキーへの削除を KeyNotFoundError で拒否する。
    expect(error).toBeInstanceOf(KeyNotFoundError);
  });

  test("寛容な下層では存在しないキーへの delete が成功する", async ({ expect }) => {
    // 準備 : 存在しないキーへの削除を黙って受け入れる下層。
    const inner = new MinimalStorage();
    const softDelete = new SoftDelete(inner);

    // 実行：
    await softDelete.delete(createDeleteContext("unknown") as IStorage.DeleteContext);

    // 検証 : 墓標は作られない。
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });

  test("台帳自体の削除は墓標化せず委譲する", async ({ expect }) => {
    // 準備：
    const inner = new Memory();
    const softDelete = new SoftDelete(inner);
    inner.write(createSetContext(REGISTRY_KEY) as IStorage.WriteContext, { live: true });

    // 実行：
    await softDelete.delete(createDeleteContext(REGISTRY_KEY) as IStorage.DeleteContext);

    // 検証 : 墓標化されず、そのまま消える。
    expect(inner.exists(createHasContext(REGISTRY_KEY) as IStorage.ExistsContext)).toBe(false);
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });

  test("台帳が壊れているときは空の一覧として扱う", async ({ expect }) => {
    // 準備：
    const inner = new Memory();
    const softDelete = new SoftDelete(inner);

    // 実行と検証 : 文字列の台帳。
    inner.write(createSetContext(REGISTRY_KEY) as IStorage.WriteContext, "garbage");
    expect(await softDelete.listTombstones()).toStrictEqual([]);

    // 実行と検証 : 配列の台帳。
    inner.write(createSetContext(REGISTRY_KEY) as IStorage.WriteContext, []);
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });

  test("下層に残った墓標への write は通常値として復活させる", async ({ expect }) => {
    // 準備：
    const inner = new Memory();
    const softDelete = new SoftDelete(inner);
    inner.write(createSetContext("k1") as IStorage.WriteContext, {
      value: "old",
      hasValue: true,
      deletedAt: Date.now(),
      __tombstone: true,
    });

    // 実行：
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "new");

    // 検証：
    expect(await softDelete.read(createGetContext("k1") as IStorage.ReadContext)).toBe("new");
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });

  test("スナップショットのない墓標の restore は TombstoneNotFoundError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const inner = new Memory();
    const softDelete = new SoftDelete(inner);
    inner.write(createSetContext("k1") as IStorage.WriteContext, {
      deletedAt: Date.now(),
      __tombstone: true,
    });

    // 実行：
    const error = await captureRejection(softDelete.restore("k1"));

    // 検証：
    expect(error).toBeInstanceOf(TombstoneNotFoundError);
    expect((error as TombstoneNotFoundError).meta).toStrictEqual({ key: "k1" });
  });

  test("deletedAt が同じ墓標は削除順に関係なくキー順に並ぶ", async ({ expect }) => {
    // 準備：
    const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    try {
      // 実行と検証 : 削除順が逆でも結果は同じになる。
      for (const order of [
        ["a", "b"],
        ["b", "a"],
      ] as const) {
        const target = new SoftDelete(new Memory());

        for (const key of order) {
          await target.write(createSetContext(key) as IStorage.WriteContext, `v-${key}`);
        }

        for (const key of order) {
          await target.delete(createDeleteContext(key) as IStorage.DeleteContext);
        }

        expect(await target.listTombstones()).toStrictEqual([
          {
            key: "a",
            deletedAt: 1_700_000_000_000,
          },
          {
            key: "b",
            deletedAt: 1_700_000_000_000,
          },
        ]);
      }
    } finally {
      now.mockRestore();
    }
  });

  test("台帳だけが残った古い項目は一覧から掃除される", async ({ expect }) => {
    // 準備 : 墓標化したあと、下層へ直接書き込んで台帳だけを古くする。
    const inner = new Memory();
    const softDelete = new SoftDelete(inner);
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);
    expect(await softDelete.listTombstones()).toHaveLength(1);
    inner.write(createSetContext("k1") as IStorage.WriteContext, "resurrected");

    // 実行：
    const entries = await softDelete.listTombstones();

    // 検証 : 古い項目は消え、有効値は残る。
    expect(entries).toStrictEqual([]);

    expect(await softDelete.read(createGetContext("k1") as IStorage.ReadContext)).toBe(
      "resurrected",
    );
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });

  test("purge() は古い項目を数えず、有効な墓標だけを数える", async ({ expect }) => {
    // 準備 : 有効な墓標と台帳だけが古い項目を用意する。
    const inner = new Memory();
    const softDelete = new SoftDelete(inner);
    await softDelete.write(createSetContext("stale") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("stale") as IStorage.DeleteContext);
    inner.write(createSetContext("stale") as IStorage.WriteContext, "resurrected");
    await softDelete.write(createSetContext("live") as IStorage.WriteContext, "v2");
    await softDelete.delete(createDeleteContext("live") as IStorage.DeleteContext);

    // 実行：
    const count = await softDelete.purge();

    // 検証：
    expect(count).toBe(1);

    expect(await softDelete.listTombstones()).toStrictEqual([]);
    expect(await softDelete.read(createGetContext("stale") as IStorage.ReadContext)).toBe(
      "resurrected",
    );
  });
});

describe("読み出しの競合と下層の失敗", () => {
  test("存在確認と読み出しの隙間で消えたときは false になる", async ({ expect }) => {
    // 準備 : exists は true を返すが、read は KeyNotFoundError を投げる下層。
    class VanishingStorage extends Memory {
      public override async read(c: IStorage.ReadContext): Promise<unknown> {
        throw new KeyNotFoundError({ key: c.key });
      }
    }

    const inner = new VanishingStorage();
    inner.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    const softDelete = new SoftDelete(inner);

    // 実行と検証：
    expect(await softDelete.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("下層の想定外の失敗はそのまま伝わる", async ({ expect }) => {
    // 準備 : 読み出しが常に失敗する下層。
    const failure = new Error("boom");

    class FailingStorage extends Memory {
      public override async read(_c: IStorage.ReadContext): Promise<unknown> {
        throw failure;
      }
    }

    const inner = new FailingStorage();
    const softDelete = new SoftDelete(inner);

    // 実行と検証 : exists、delete、restore、一覧のいずれでも想定外の失敗は握り潰さない exists は存在確認まで進めるため、下層へ直接有効値を入れておく。
    inner.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await expect(softDelete.exists(createHasContext("k1") as IStorage.ExistsContext)).rejects.toBe(
      failure,
    );
    await expect(
      softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext),
    ).rejects.toBe(failure);
    await expect(softDelete.restore("k1")).rejects.toBe(failure);
    await expect(softDelete.listTombstones()).rejects.toBe(failure);

    // 準備 : 削除が KeyNotFoundError を投げる下層での掃除は黙って進む。
    class DeleteMissingStorage extends Memory {
      public override delete(c: IStorage.DeleteContext): void {
        throw new KeyNotFoundError({ key: c.key });
      }
    }

    const sweeping = new SoftDelete(new DeleteMissingStorage(), { retentionMs: 1 });
    await sweeping.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await sweeping.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    await sleep(10);

    // 実行と検証 : 掃除中の削除失敗は存在しないものとして扱われる。
    const error = await captureRejection(
      sweeping.read(createGetContext("k1") as IStorage.ReadContext),
    );
    expect(error).toBeInstanceOf(KeyNotFoundError);
  });

  test("削除中の想定外の失敗はそのまま伝わる", async ({ expect }) => {
    // 準備 : 削除が想定外の失敗を投げる下層。
    const failure = new Error("delete-boom");

    class DeleteFailingStorage extends Memory {
      public override delete(_c: IStorage.DeleteContext): void {
        throw failure;
      }
    }

    const sweeping = new SoftDelete(new DeleteFailingStorage(), { retentionMs: 1 });
    await sweeping.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await sweeping.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    await sleep(10);

    // 実行と検証 : 掃除中の削除失敗は握り潰さない。
    await expect(sweeping.read(createGetContext("k1") as IStorage.ReadContext)).rejects.toBe(
      failure,
    );
  });
});

describe("ストリームの直接操作", () => {
  test("getWritable と getReadable は有効値を往復させる", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    const writable = await softDelete.getWritable?.(
      createSetContext("s1") as IStorage.GetWritableContext,
    );
    expect(writable).toBeDefined();

    const writer = (writable as NonNullable<typeof writable>).getWriter();
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();

    // 実行：
    const readable = await softDelete.getReadable?.(
      createStreamContext("s1") as IStorage.GetReadableContext,
    );

    // 検証：
    expect(readable).toBeDefined();

    const chunks = await readAll(readable as NonNullable<typeof readable>);
    expect(chunks).toStrictEqual([new Uint8Array([1, 2])]);
  });

  test("getReadable は墓標を KeyNotFoundError として扱う", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    const writable = await softDelete.getWritable?.(
      createSetContext("s1") as IStorage.GetWritableContext,
    );
    const writer = (writable as NonNullable<typeof writable>).getWriter();
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();
    await softDelete.delete(createDeleteContext("s1") as IStorage.DeleteContext);
    expect(softDelete.getReadable).toBeDefined();

    // 実行：
    const error = await captureRejection(
      Promise.resolve(
        (softDelete.getReadable as NonNullable<typeof softDelete.getReadable>)(
          createStreamContext("s1") as IStorage.GetReadableContext,
        ),
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "s1" });
  });

  test("getWritable の中断はチャンクを確定させず、墓標を残す", async ({ expect }) => {
    // 準備：
    const inner = new Memory();
    const softDelete = new SoftDelete(inner);
    await softDelete.write(createSetContext("s1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("s1") as IStorage.DeleteContext);
    expect(await softDelete.listTombstones()).toHaveLength(1);

    // 実行 : チャンクを書き込んでから中断する。
    const writable = await (softDelete.getWritable as NonNullable<typeof softDelete.getWritable>)(
      createSetContext("s1") as IStorage.GetWritableContext,
    );
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([1, 2]));
    await writer.abort(new Error("cancelled"));

    // 検証 : 中断した書き込みは確定せず、墓標が残る。
    expect(await inner.read(createGetContext("s1") as IStorage.ReadContext)).toMatchObject({
      __tombstone: true,
    });
    expect(await softDelete.listTombstones()).toHaveLength(1);
    const error = await captureRejection(
      softDelete.read(createGetContext("s1") as IStorage.ReadContext),
    );
    expect(error).toBeInstanceOf(KeyNotFoundError);
  });

  test("getWritable の close は墓標を復活させる", async ({ expect }) => {
    // 準備：
    const softDelete = new SoftDelete(new Memory());
    await softDelete.write(createSetContext("s1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("s1") as IStorage.DeleteContext);
    expect(await softDelete.listTombstones()).toHaveLength(1);

    // 実行 : 墓標をストリームの書き込みで上書きする。
    const writable = await (softDelete.getWritable as NonNullable<typeof softDelete.getWritable>)(
      createSetContext("s1") as IStorage.GetWritableContext,
    );
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([3, 4]));
    await writer.close();

    // 検証 : 通常値として読め、墓標の一覧から外れる。
    expect(await softDelete.read(createGetContext("s1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([3, 4]),
    );
    expect(await softDelete.exists(createHasContext("s1") as IStorage.ExistsContext)).toBe(true);
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });
});

describe("保持期限の直接操作", () => {
  test("期限切れの墓標の read は掃除して KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const inner = new Memory();
    const softDelete = new SoftDelete(inner, { retentionMs: 20 });
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    await sleep(50);

    // 実行：
    const error = await captureRejection(
      softDelete.read(createGetContext("k1") as IStorage.ReadContext),
    );

    // 検証 : 期限切れは掃除され、下層からも消える。
    expect(error).toBeInstanceOf(KeyNotFoundError);

    expect(inner.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });

  test("期限切れの墓標の exists は掃除して false を返す", async ({ expect }) => {
    // 準備：
    const inner = new Memory();
    const softDelete = new SoftDelete(inner, { retentionMs: 20 });
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    await sleep(50);

    // 実行：
    const exists = await softDelete.exists(createHasContext("k1") as IStorage.ExistsContext);

    // 検証 : 期限切れは掃除され、下層からも消える。
    expect(exists).toBe(false);

    expect(inner.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });

  test("期限切れの墓標の restore は掃除して TombstoneNotFoundError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const inner = new Memory();
    const softDelete = new SoftDelete(inner, { retentionMs: 20 });
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    await sleep(50);

    // 実行：
    const error = await captureRejection(softDelete.restore("k1"));

    // 検証 : 期限切れは掃除され、下層からも消える。
    expect(error).toBeInstanceOf(TombstoneNotFoundError);
    expect((error as TombstoneNotFoundError).meta).toStrictEqual({ key: "k1" });

    expect(inner.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("期限切れの墓標の二重削除は掃除して成功する", async ({ expect }) => {
    // 準備：
    const inner = new Memory();
    const softDelete = new SoftDelete(inner, { retentionMs: 20 });
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    await sleep(50);

    // 実行：
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 検証：
    expect(inner.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(await softDelete.listTombstones()).toStrictEqual([]);
  });

  test("期限切れの墓標の getReadable は掃除して KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const inner = new Memory();
    const softDelete = new SoftDelete(inner, { retentionMs: 20 });
    const writable = await softDelete.getWritable?.(
      createSetContext("s1") as IStorage.GetWritableContext,
    );
    const writer = (writable as NonNullable<typeof writable>).getWriter();
    await writer.write(new Uint8Array([7]));
    await writer.close();
    await softDelete.delete(createDeleteContext("s1") as IStorage.DeleteContext);

    await sleep(50);
    expect(softDelete.getReadable).toBeDefined();

    // 実行：
    const error = await captureRejection(
      Promise.resolve(
        (softDelete.getReadable as NonNullable<typeof softDelete.getReadable>)(
          createStreamContext("s1") as IStorage.GetReadableContext,
        ),
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);

    expect(inner.exists(createHasContext("s1") as IStorage.ExistsContext)).toBe(false);
  });
});

describe("実行時変数の転送", () => {
  test("下層が変数に触れても台帳操作が壊れない", async ({ expect }) => {
    // 準備 : 読み出しで変数に触れる下層。
    class VarsTouchingStorage extends Memory {
      public readonly touched: string[] = [];

      public override async read(c: IStorage.ReadContext): Promise<unknown> {
        this.touched.push(`get:${String(c.get("probe"))}`);
        c.set("touched", this.touched.length);
        c.setReadonly(`ro-${this.touched.length}`, true);

        return await super.read(c);
      }
    }

    const inner = new VarsTouchingStorage();
    const softDelete = new SoftDelete(inner);
    await softDelete.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    await softDelete.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    const entries = await softDelete.listTombstones();

    // 検証 : 変数に触れる下層でも墓標化と一覧が正しく動く。
    expect(entries).toHaveLength(1);
    expect(entries[0]?.key).toBe("k1");

    expect(inner.touched.length).toBeGreaterThan(0);
    expect(await softDelete.restore("k1")).toBe("v1");
  });
});
