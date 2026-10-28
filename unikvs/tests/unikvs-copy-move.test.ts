import type { IMiddleware } from "@unikvs/core";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError, PluginOperationAggregateError } from "../src/errors.js";
import { Builder } from "../src/index.js";
import type { PlainValue } from "../src/value-schemas.js";
import { Gate, isPending, FakeStorage, FakeMiddleware } from "./_helpers.js";

type Mapping = Record<string, PlainValue<string>>;

/**
 * キーの先頭に固定の接頭辞を付けるミドルウェアです。
 * コピー元とコピー先の両方へキー写像が適用されることを検証します。
 */
class PrefixMiddleware implements IMiddleware {
  public readonly name = "PrefixMiddleware";

  public readonly isOpen = true;

  public mapKey(c: IMiddleware.MapKeyContext): string {
    return `prefix:${c.key}`;
  }
}

/**
 * 指定したストレージへ接続した KVS を作成して開きます。
 */
async function createKvs(storages: readonly FakeStorage[]): Promise<{
  kvs: ReturnType<Builder<Mapping>["build"]>;
  first: FakeStorage;
  second: FakeStorage | undefined;
}> {
  const [first, second] = storages;

  if (first === undefined) {
    throw new Error("ストレージが必要です。");
  }

  let builder = new Builder<Mapping>().persist(first);

  if (second !== undefined) {
    builder = builder.persist(second);
  }

  const kvs = builder.build();
  await kvs.open();

  return {
    kvs,
    first,
    second,
  };
}

describe("UniKvs - コピー", () => {
  test("コピー元を残したままコピー先へ値を複製する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.copy("source", "destination");

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("value");
    await expect(kvs.get("source")).resolves.toBe("value");
    expect(storage.callsOf("copy")[0]).toMatchObject({
      key: "source",
      action: "copy",
      destinationKey: "destination",
    });
  });

  test("オプションオブジェクト形式でもコピーできる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.copy({
      key: "source",
      vars: {
        via: "copy",
      },
      destinationKey: "destination",
    });

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("value");
    expect(storage.callsOf("copy")[0]?.vars?.get("via")).toBe("copy");
  });

  test("コピー先に既存の値があるとき上書きする", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "new");
    await kvs.set("destination", "old");

    // 実行：
    await kvs.copy("source", "destination");

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("new");
  });

  test("コピー元が存在しないとき KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);

    // 実行と検証：
    await expect(kvs.copy("missing", "destination")).rejects.toMatchObject({
      meta: {
        key: "missing",
      },
    });
    await expect(kvs.copy("missing", "destination")).rejects.toThrow(KeyNotFoundError);
    expect(storage.map.has("destination")).toBe(false);
  });

  test("同じキーへのコピーは存在確認だけで値を変更しない", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("key", "value");

    // 実行：
    await kvs.copy("key", "key");

    // 検証：
    await expect(kvs.get("key")).resolves.toBe("value");
  });

  test("同じキーへのコピーでも存在しなければ KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);

    // 実行と検証：
    await expect(kvs.copy("missing", "missing")).rejects.toThrow(KeyNotFoundError);
  });

  test("中断済みシグナルではコピーしない", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "value");

    const ac = new AbortController();
    ac.abort(new Error("aborted"));

    // 実行と検証：
    await expect(
      kvs.copy("source", "destination", {
        signal: ac.signal,
      }),
    ).rejects.toThrow("aborted");

    expect(storage.map.has("destination")).toBe(false);
  });

  test("複数ストレージへすべてコピーする", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const { kvs } = await createKvs([first, second]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.copy("source", "destination");

    // 検証：
    expect(first.map.get("destination")).toBe("value");
    expect(second.map.get("destination")).toBe("value");
  });

  test("コピー先の書き込みに失敗したストレージを集約エラーで報告する", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const { kvs } = await createKvs([first, second]);
    await kvs.set("source", "value");

    const failure = new Error("copy failed");
    second.errors.copy = failure;

    // 実行：
    const promise = kvs.copy("source", "destination");

    // 検証：
    await expect(promise).rejects.toThrow(PluginOperationAggregateError);
    await expect(promise).rejects.toMatchObject({
      meta: {
        action: "copy",
      },
    });

    expect(first.map.get("destination")).toBe("value");
    expect(second.map.has("destination")).toBe(false);
  });

  test("ミドルウェアのキー写像をコピー元とコピー先の両方へ適用する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const kvs = new Builder<Mapping>().use(new PrefixMiddleware()).persist(storage).build();
    await kvs.open();
    await kvs.set("source", "value");

    // 実行：
    await kvs.copy("source", "destination");

    // 検証：
    expect(storage.map.get("prefix:source")).toBe("value");
    expect(storage.map.get("prefix:destination")).toBe("value");
    await expect(kvs.get("destination")).resolves.toBe("value");
  });
});

describe("UniKvs - 移動", () => {
  test("移動先へ値を書き込んでから移動元を削除する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.move("source", "destination");

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("value");
    await expect(kvs.get("source")).rejects.toThrow(KeyNotFoundError);
    expect(storage.callsOf("move")[0]).toMatchObject({
      key: "source",
      action: "move",
      destinationKey: "destination",
    });
  });

  test("オプションオブジェクト形式でも移動できる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.move({
      key: "source",
      destinationKey: "destination",
    });

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("value");
    await expect(kvs.get("source")).rejects.toThrow(KeyNotFoundError);
  });

  test("移動先に既存の値があるとき上書きする", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "new");
    await kvs.set("destination", "old");

    // 実行：
    await kvs.move("source", "destination");

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("new");
  });

  test("移動元が存在しないとき KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);

    // 実行と検証：
    await expect(kvs.move("missing", "destination")).rejects.toThrow(KeyNotFoundError);
  });

  test("同じキーへの移動は削除しない", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("key", "value");

    // 実行：
    await kvs.move("key", "key");

    // 検証：
    await expect(kvs.get("key")).resolves.toBe("value");
  });

  test("複数ストレージからすべて移動する", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const { kvs } = await createKvs([first, second]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.move("source", "destination");

    // 検証：
    expect(first.map.has("source")).toBe(false);
    expect(second.map.has("source")).toBe(false);
    expect(first.map.get("destination")).toBe("value");
    expect(second.map.get("destination")).toBe("value");
  });
});

describe("UniKvs - 転送中の中断とキー写像の失敗", () => {
  test("copy の中断で拒否しても開始済みの転送が終わるまでキーロックを解放しない", async ({
    expect,
  }) => {
    // 準備 : first の copy は中断で失敗し、second の copy はゲートで保留する。
    const reason = new Error("copy aborted");
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const { kvs } = await createKvs([first, second]);
    first.map.set("source", "value");
    second.map.set("source", "value");

    const enteredFirst = new Gate();
    const releaseFirst = new Gate();
    first.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "copy") {
        enteredFirst.open();
        await releaseFirst.wait();
        call.signal?.throwIfAborted();
      }
    };

    const enteredSecond = new Gate();
    const releaseSecond = new Gate();
    second.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "copy") {
        enteredSecond.open();
        await releaseSecond.wait();
      }
    };

    const ac = new AbortController();
    const copying = kvs.copy("source", "destination", { signal: ac.signal });

    try {
      await enteredFirst.wait();
      await enteredSecond.wait();
      ac.abort(reason);
      releaseFirst.open();

      // 実行 : first の失敗後、second の転送中に同じキーを削除する。
      const deleting = kvs.delete("destination");

      // 検証 : 開始済みの転送が終わるまでキーロックは解放されない。
      await new Promise((resolve) => setTimeout(resolve, 10));
      await expect(isPending(deleting)).resolves.toBe(true);

      releaseSecond.open();

      await expect(copying).rejects.toBe(reason);
      await expect(deleting).resolves.toBeUndefined();

      // 検証 : second の転送は削除前に完了しており、削除後に復活しない。
      expect(second.map.has("destination")).toBe(false);
      expect(first.map.has("destination")).toBe(false);
    } finally {
      releaseFirst.open();
      releaseSecond.open();
      await copying.catch(() => {});
    }
  });

  test("move の中断で拒否しても開始済みの転送が終わるまでキーロックを解放しない", async ({
    expect,
  }) => {
    // 準備 : first の move は中断で失敗し、second の move はゲートで保留する。
    const reason = new Error("move aborted");
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const { kvs } = await createKvs([first, second]);
    first.map.set("source", "value");
    second.map.set("source", "value");

    const enteredFirst = new Gate();
    const releaseFirst = new Gate();
    first.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "move") {
        enteredFirst.open();
        await releaseFirst.wait();
        call.signal?.throwIfAborted();
      }
    };

    const enteredSecond = new Gate();
    const releaseSecond = new Gate();
    second.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "move") {
        enteredSecond.open();
        await releaseSecond.wait();
      }
    };

    const ac = new AbortController();
    const moving = kvs.move("source", "destination", { signal: ac.signal });

    try {
      await enteredFirst.wait();
      await enteredSecond.wait();
      ac.abort(reason);
      releaseFirst.open();

      // 実行 : first の失敗後、second の転送中に移動先を削除する。
      const deleting = kvs.delete("destination");

      // 検証 : 開始済みの転送が終わるまでキーロックは解放されない。
      await new Promise((resolve) => setTimeout(resolve, 10));
      await expect(isPending(deleting)).resolves.toBe(true);

      releaseSecond.open();

      await expect(moving).rejects.toBe(reason);
      await expect(deleting).resolves.toBeUndefined();

      // 検証 : second の転送は削除前に完了しており、削除後に復活しない。
      expect(second.map.has("destination")).toBe(false);
      expect(second.map.has("source")).toBe(false);
      expect(first.map.has("destination")).toBe(false);
    } finally {
      releaseFirst.open();
      releaseSecond.open();
      await moving.catch(() => {});
    }
  });

  test("キー写像の失敗でも開始済みの転送が終わるまで拒否しない", async ({ expect }) => {
    // 準備 : first の copy はゲートで保留し、second のキー写像は失敗する。
    class ThrowingMapKeyMiddleware extends FakeMiddleware {
      public constructor() {
        super("ThrowingMapKey");
      }

      public override mapKey(): string {
        throw new Error("mapKey failed");
      }
    }

    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const kvs = new Builder<Mapping>()
      .persist(first)
      .use(new ThrowingMapKeyMiddleware())
      .persist(second)
      .build();
    await kvs.open();
    first.map.set("source", "value");
    second.map.set("source", "value");

    const entered = new Gate();
    const release = new Gate();
    first.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "copy") {
        entered.open();
        await release.wait();
      }
    };

    const copying = kvs.copy("source", "destination");

    try {
      await entered.wait();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 検証 : キー写像の失敗だけでは、開始済みのコピーを残したまま拒否しない。
      await expect(isPending(copying)).resolves.toBe(true);

      release.open();

      // 検証 : 失敗は集約エラーとして報告され、コピーは完了している。
      await expect(copying).rejects.toThrow(PluginOperationAggregateError);
      expect(first.map.get("destination")).toBe("value");
    } finally {
      release.open();
      await copying.catch(() => {});
      await kvs.close();
    }
  });

  test("単一ストレージの copy でキー写像に失敗したとき KeyNotFoundError ではなく集約エラーを投げる", async ({
    expect,
  }) => {
    // 準備 : 唯一のストレージへ到達する前にキー写像が失敗する。
    class ThrowingMapKeyMiddleware extends FakeMiddleware {
      public constructor() {
        super("ThrowingMapKey");
      }

      public override mapKey(): string {
        throw new Error("mapKey failed");
      }
    }

    const storage = new FakeStorage();
    const kvs = new Builder<Mapping>().use(new ThrowingMapKeyMiddleware()).persist(storage).build();
    await kvs.open();
    storage.map.set("source", "value");

    // 実行：
    const error: unknown = await kvs.copy("source", "destination").catch((ex: unknown) => ex);

    // 検証 : 存在確認を 1 件も行っていないため、キー不在ではなく解決失敗として報告する。
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect(error).not.toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      meta: {
        action: "copy",
        errors: [
          {
            name: "FakeStorage",
            index: 0,
            reason: expect.objectContaining({ message: "mapKey failed" }),
          },
        ],
      },
    });

    expect(storage.callsOf("exists")).toHaveLength(0);
    expect(storage.map.has("destination")).toBe(false);
  });

  test("単一ストレージの move でキー写像に失敗したとき KeyNotFoundError ではなく集約エラーを投げる", async ({
    expect,
  }) => {
    // 準備 : 唯一のストレージへ到達する前にキー写像が失敗する。
    class ThrowingMapKeyMiddleware extends FakeMiddleware {
      public constructor() {
        super("ThrowingMapKey");
      }

      public override mapKey(): string {
        throw new Error("mapKey failed");
      }
    }

    const storage = new FakeStorage();
    const kvs = new Builder<Mapping>().use(new ThrowingMapKeyMiddleware()).persist(storage).build();
    await kvs.open();
    storage.map.set("source", "value");

    // 実行：
    const error: unknown = await kvs.move("source", "destination").catch((ex: unknown) => ex);

    // 検証 : 存在確認を 1 件も行っていないため、キー不在ではなく解決失敗として報告する。
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect(error).not.toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      meta: {
        action: "move",
        errors: [
          {
            name: "FakeStorage",
            index: 0,
            reason: expect.objectContaining({ message: "mapKey failed" }),
          },
        ],
      },
    });

    expect(storage.callsOf("exists")).toHaveLength(0);
    expect(storage.map.has("destination")).toBe(false);
  });

  test("不在とキー写像の失敗が混在するときは KeyNotFoundError に原因を残す", async ({ expect }) => {
    // 準備 : first は不在、second はキー写像に失敗して存在確認に到達しない。
    class ThrowingMapKeyMiddleware extends FakeMiddleware {
      public constructor() {
        super("ThrowingMapKey");
      }

      public override mapKey(): string {
        throw new Error("mapKey failed");
      }
    }

    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const kvs = new Builder<Mapping>()
      .persist(first)
      .use(new ThrowingMapKeyMiddleware())
      .persist(second)
      .build();
    await kvs.open();
    second.map.set("source", "value");

    // 実行：
    const error: unknown = await kvs.copy("source", "destination").catch((ex: unknown) => ex);

    // 検証 : 不在として報告しつつ、確認できなかったストレージの失敗を cause に残す。
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).not.toBeInstanceOf(PluginOperationAggregateError);
    expect(error).toMatchObject({
      cause: expect.objectContaining({ message: "mapKey failed" }),
    });

    expect(first.callsOf("exists")).toHaveLength(1);
    expect(second.callsOf("exists")).toHaveLength(0);
    expect(second.map.get("source")).toBe("value");
  });

  test("copy 中に中断してもストレージが完了した場合は abort 理由で失敗する", async ({ expect }) => {
    // 準備 : ストレージは中断を無視してコピーを完了する。
    const reason = new Error("copy aborted after storage completed");
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    storage.map.set("source", "value");

    const entered = new Gate();
    const release = new Gate();
    storage.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "copy") {
        entered.open();
        await release.wait();
      }
    };

    const ac = new AbortController();
    const copying = kvs.copy("source", "destination", { signal: ac.signal });

    try {
      await entered.wait();
      ac.abort(reason);
      release.open();

      // 検証 : ストレージが成功しても、中断済みの操作を成功として扱わない。
      await expect(copying).rejects.toBe(reason);
      expect(storage.map.get("destination")).toBe("value");
    } finally {
      release.open();
      await copying.catch(() => {});
    }
  });

  test("move 中に中断してもストレージが完了した場合は abort 理由で失敗する", async ({ expect }) => {
    // 準備 : ストレージは中断を無視して移動を完了する。
    const reason = new Error("move aborted after storage completed");
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    storage.map.set("source", "value");

    const entered = new Gate();
    const release = new Gate();
    storage.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "move") {
        entered.open();
        await release.wait();
      }
    };

    const ac = new AbortController();
    const moving = kvs.move("source", "destination", { signal: ac.signal });

    try {
      await entered.wait();
      ac.abort(reason);
      release.open();

      // 検証 : ストレージが成功しても、中断済みの操作を成功として扱わない。
      await expect(moving).rejects.toBe(reason);
      expect(storage.map.get("destination")).toBe("value");
      expect(storage.map.has("source")).toBe(false);
    } finally {
      release.open();
      await moving.catch(() => {});
    }
  });
});
