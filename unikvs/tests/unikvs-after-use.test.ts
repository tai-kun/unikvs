import { AllowRepair } from "@unikvs/allow-repair";
import type { IStorage, IMiddleware } from "@unikvs/core";
import { readAll } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { PluginOperationAggregateError } from "../src/errors.js";
import { Builder } from "../src/index.js";
import type { PlainValue, StreamValue } from "../src/value-schemas.js";
import {
  Gate,
  streamOf,
  isPending,
  FakeStorage,
  FakeMiddleware,
  FakeStreamStorage,
  FakeStreamMiddleware,
} from "./_helpers.js";

type Mapping = Record<string, PlainValue<string>>;

/**
 * `exists` を同期で返し、削除だけをゲートで保留できるストレージです。
 */
class ImmediateExistsStorage extends FakeStorage {
  public override async exists(c: IStorage.ExistsContext): Promise<boolean> {
    return this.map.has(c.key);
  }
}

/**
 * ストリーム書き込みを必ず失敗させるストレージです。
 */
class FailingStreamStorage extends FakeStreamStorage {
  public override getWritable(): WritableStream<Uint8Array> {
    return new WritableStream<Uint8Array>({
      write(): void {
        throw new Error("stream write failed");
      },
    });
  }
}

/**
 * `afterUse` の引数を取得します。
 */
function afterUseOf(middleware: FakeMiddleware): readonly IMiddleware.UseOutcome[] {
  return middleware
    .callsOf("afterUse")
    .map((call) => call.outcome)
    .filter((outcome): outcome is IMiddleware.UseOutcome => outcome !== undefined);
}

describe("UniKvs - afterUse の通知", () => {
  test("書き込み成功時にミドルウェアごとに一度だけ確定結果を通知する", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const m1 = new FakeMiddleware("m1");
    const m2 = new FakeMiddleware("m2");
    const order: string[] = [];
    m1.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- フックの種類で記録を分けるための分岐です。
      if (call.method === "afterUse") {
        order.push("m1");
      }
    };
    m2.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- フックの種類で記録を分けるための分岐です。
      if (call.method === "afterUse") {
        order.push("m2");
      }
    };

    await using kvs = new Builder<Mapping>().use(m1).use(m2).persist(first).persist(second).build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "value");

    // 検証：
    const m1Outcomes = afterUseOf(m1);
    const m2Outcomes = afterUseOf(m2);

    expect(order).toStrictEqual(["m1", "m2"]);
    expect(m1Outcomes).toHaveLength(1);
    expect(m2Outcomes).toHaveLength(1);
    expect(m1Outcomes[0]).toStrictEqual({
      status: "success",
      targets: [
        {
          name: "first",
          index: 0,
          status: "committed",
        },
        {
          name: "second",
          index: 1,
          status: "committed",
        },
      ],
    });
    expect(m2Outcomes[0]).toStrictEqual(m1Outcomes[0]);
  });

  test("部分失敗では確定した宛先と失敗した宛先を区別し、onOtherWriteError より先に通知する", async ({
    expect,
  }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const failure = new Error("write failed");
    second.errors.write = failure;

    const order: string[] = [];
    const middleware = new FakeMiddleware();
    middleware.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- フックの種類で記録を分けるための分岐です。
      if (call.method === "afterUse") {
        order.push("afterUse");
      }
    };
    first.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- フックの種類で記録を分けるための分岐です。
      if (call.method === "onOtherWriteError") {
        order.push("onOtherWriteError");
      }
    };

    await using kvs = new Builder<Mapping>().use(middleware).persist(first).persist(second).build();
    await kvs.open();

    // 実行：
    await expect(kvs.set("foo", "value")).rejects.toThrow(PluginOperationAggregateError);

    // 検証：
    expect(order).toStrictEqual(["afterUse", "onOtherWriteError"]);
    expect(afterUseOf(middleware)).toStrictEqual([
      {
        error: expect.objectContaining({ message: expect.stringContaining("fail write") }),
        status: "error",
        targets: [
          {
            name: "first",
            index: 0,
            status: "committed",
          },
          {
            name: "second",
            error: failure,
            index: 1,
            status: "failed",
          },
        ],
      },
    ]);
  });

  test("afterUse の例外は記録するだけで操作の結果を置き換えない", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const middleware = new FakeMiddleware();
    middleware.errors.afterUse = new Error("afterUse failed");

    await using kvs = new Builder<Mapping>().use(middleware).persist(storage).build();
    await kvs.open();

    // 実行と検証：
    await expect(kvs.set("foo", "value")).resolves.toBeUndefined();

    expect(storage.map.get("foo")).toBe("value");
    expect(afterUseOf(middleware)).toHaveLength(1);
  });

  test("読み取り系の操作では afterUse を呼ばない", async ({ expect }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    const middleware = new FakeStreamMiddleware();
    await using kvs = new Builder<{
      foo: PlainValue<string>;
      logs: StreamValue<Uint8Array>;
    }>()
      .use(middleware)
      .persist(storage)
      .build();
    await kvs.open();
    await kvs.set("foo", "value");
    storage.map.set("logs", [new Uint8Array([1])]);

    // 実行：
    await kvs.get("foo");
    await kvs.has("foo");

    const stream = await kvs.stream("logs");
    await readAll(stream as unknown as ReadableStream<Uint8Array>);

    // 検証：
    expect(middleware.callsOf("afterUse")).toHaveLength(1);
  });

  test("get と stream の repair による書き戻しでは afterUse を呼ばない", async ({ expect }) => {
    // 準備 : first は不在で、second だけが値を持つ。
    const first = new FakeStreamStorage("first");
    const second = new FakeStreamStorage("second");
    const middleware = new FakeStreamMiddleware();
    await using kvs = new Builder<{
      foo: PlainValue<string>;
      logs: StreamValue<Uint8Array>;
    }>()
      .use(middleware)
      .use(new AllowRepair())
      .persist(first)
      .persist(second)
      .build();
    await kvs.open();
    second.map.set("foo", "value");
    second.map.set("logs", [new Uint8Array([1, 2])]);

    // 実行：
    await expect(kvs.get("foo", { repair: true })).resolves.toBe("value");

    const stream = await kvs.stream("logs", { repair: true });
    await readAll(stream as unknown as ReadableStream<Uint8Array>);

    // 検証 : 書き戻しは行われるが、読み取り操作として扱われ afterUse は呼ばれない。
    expect(first.map.get("foo")).toBe("value");
    expect(first.map.get("logs")).toStrictEqual([new Uint8Array([1, 2])]);
    expect(middleware.callsOf("afterUse")).toHaveLength(0);
  });

  test("ストリーム書き込みの成功を確定として通知する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    const middleware = new FakeStreamMiddleware();
    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(middleware)
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("logs", streamOf([new Uint8Array([1, 2])]));

    // 検証：
    expect(afterUseOf(middleware)).toStrictEqual([
      {
        status: "success",
        targets: [
          {
            name: "FakeStreamStorage",
            index: 0,
            status: "committed",
          },
        ],
      },
    ]);
  });

  test("ストリーム書き込みの失敗を失敗として通知する", async ({ expect }) => {
    // 準備：
    const storage = new FailingStreamStorage();
    const middleware = new FakeStreamMiddleware();
    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(middleware)
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    await expect(kvs.set("logs", streamOf([new Uint8Array([1])]))).rejects.toThrow(
      PluginOperationAggregateError,
    );

    // 検証：
    expect(afterUseOf(middleware)).toStrictEqual([
      {
        error: expect.objectContaining({ message: expect.stringContaining("fail write") }),
        status: "error",
        targets: [
          {
            name: "FakeStreamStorage",
            error: expect.objectContaining({ message: "stream write failed" }),
            index: 0,
            status: "failed",
          },
        ],
      },
    ]);
  });

  test("delete は削除した宛先と存在しなかった宛先を区別する", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const middleware = new FakeMiddleware();
    await using kvs = new Builder<Mapping>().use(middleware).persist(first).persist(second).build();
    await kvs.open();
    await kvs.set("foo", "value");
    second.map.delete("foo");

    // 実行：
    await kvs.delete("foo");

    // 検証：
    expect(afterUseOf(middleware)[1]).toStrictEqual({
      status: "success",
      targets: [
        {
          name: "first",
          index: 0,
          status: "committed",
        },
        {
          name: "second",
          index: 1,
          status: "notFound",
        },
      ],
    });
  });

  test("delete の失敗では削除できた宛先を確定として通知し、記録は残す", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const failure = new Error("delete failed");
    second.errors.delete = failure;

    const middleware = new FakeMiddleware();
    await using kvs = new Builder<Mapping>().use(middleware).persist(first).persist(second).build();
    await kvs.open();
    await kvs.set("foo", "value");

    // 実行：
    await expect(kvs.delete("foo")).rejects.toThrow(PluginOperationAggregateError);

    // 検証：
    expect(afterUseOf(middleware)[1]).toStrictEqual({
      error: expect.objectContaining({ message: expect.stringContaining("fail delete") }),
      status: "error",
      targets: [
        {
          name: "first",
          index: 0,
          status: "committed",
        },
        {
          name: "second",
          error: failure,
          index: 1,
          status: "failed",
        },
      ],
    });
  });

  test("delete はキー写像の失敗でも進行中の削除を待ち、ロックを保持したまま一度だけ通知する", async ({
    expect,
  }) => {
    // 準備 : first の削除はゲートで保留し、second のキー写像は失敗する。
    class ThrowingMapKeyMiddleware extends FakeMiddleware {
      public constructor() {
        super("ThrowingMapKey");
      }

      public override mapKey(): string {
        throw new Error("mapKey failed");
      }
    }

    const first = new ImmediateExistsStorage("first");
    const second = new FakeStorage("second");
    const observer = new FakeMiddleware("observer");
    const kvs = new Builder<Mapping>()
      .use(observer)
      .persist(first)
      .use(new ThrowingMapKeyMiddleware())
      .persist(second)
      .build();
    await kvs.open();
    first.map.set("foo", "value");
    second.map.set("foo", "value");

    const entered = new Gate();
    const release = new Gate();
    first.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- 削除だけを保留するための分岐です。
      if (call.method === "delete") {
        entered.open();
        await release.wait();
      }
    };

    const deleting = kvs.delete("foo");

    try {
      await entered.wait();

      // second のキー写像は先に失敗していますが、first の削除はまだ進行中です。
      // 同じキーの読み取りは、進行中の削除がキーロックを保持している間は待たされます。
      const probing = kvs.has("foo");
      await expect(isPending(probing)).resolves.toBe(true);

      expect(afterUseOf(observer)).toHaveLength(0);

      release.open();

      await expect(deleting).rejects.toThrow(PluginOperationAggregateError);
      // 解放後は削除済みのため後段へ進み、そのキー写像の失敗が見えます。
      await expect(probing).rejects.toThrow("mapKey failed");

      // 進行中の削除が終わってから、確定した宛先と失敗した宛先をまとめて一度だけ通知します。
      expect(afterUseOf(observer)).toStrictEqual([
        {
          error: expect.objectContaining({
            meta: expect.objectContaining({
              action: "delete",
              errors: [
                expect.objectContaining({
                  name: "second",
                  reason: expect.objectContaining({ message: "mapKey failed" }),
                }),
              ],
            }),
          }),
          status: "error",
          targets: [
            {
              name: "first",
              index: 0,
              status: "committed",
            },
            {
              name: "second",
              error: expect.objectContaining({ message: "mapKey failed" }),
              index: 1,
              status: "failed",
            },
          ],
        },
      ]);
    } finally {
      release.open();
      await deleting.catch(() => {});
      await kvs.close();
    }
  });

  test("copy と move の成功を確定として通知する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const middleware = new FakeMiddleware();
    await using kvs = new Builder<Mapping>().use(middleware).persist(storage).build();
    await kvs.open();
    await kvs.set("source", "value");

    // 実行：
    await kvs.copy("source", "copied");
    await kvs.move("copied", "moved");

    // 検証：
    const outcomes = afterUseOf(middleware);
    expect(outcomes[1]).toStrictEqual({
      status: "success",
      targets: [
        {
          name: "FakeStorage",
          index: 0,
          status: "committed",
        },
      ],
    });
    expect(outcomes[2]).toStrictEqual(outcomes[1]);
  });

  test("copy は存在しないコピー元を notFound として通知する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const middleware = new FakeMiddleware();
    await using kvs = new Builder<Mapping>().use(middleware).persist(storage).build();
    await kvs.open();

    // 実行：
    await expect(kvs.copy("missing", "destination")).rejects.toThrow("missing");

    // 検証：
    expect(afterUseOf(middleware)).toStrictEqual([
      {
        error: expect.objectContaining({ message: expect.stringContaining("missing") }),
        status: "error",
        targets: [
          {
            name: "FakeStorage",
            index: 0,
            status: "notFound",
          },
        ],
      },
    ]);
  });

  test("move の部分失敗では移動できた宛先を確定として通知する", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    second.errors.move = new Error("move failed");

    const middleware = new FakeMiddleware();
    await using kvs = new Builder<Mapping>().use(middleware).persist(first).persist(second).build();
    await kvs.open();
    await kvs.set("foo", "value");

    // 実行：
    await expect(kvs.move("foo", "bar")).rejects.toThrow(PluginOperationAggregateError);

    // 検証：
    expect(afterUseOf(middleware)[1]).toStrictEqual({
      error: expect.objectContaining({ message: expect.stringContaining("fail move") }),
      status: "error",
      targets: [
        {
          name: "first",
          index: 0,
          status: "committed",
        },
        {
          name: "second",
          error: expect.objectContaining({ message: "move failed" }),
          index: 1,
          status: "failed",
        },
      ],
    });
  });

  test("clear は全宛先の成功を確定として通知する", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const middleware = new FakeMiddleware();
    await using kvs = new Builder<Mapping>().use(middleware).persist(first).persist(second).build();
    await kvs.open();
    await kvs.set("foo", "value");

    // 実行：
    await kvs.clear();

    // 検証：
    expect(afterUseOf(middleware)[1]).toStrictEqual({
      status: "success",
      targets: [
        {
          name: "first",
          index: 0,
          status: "committed",
        },
        {
          name: "second",
          index: 1,
          status: "committed",
        },
      ],
    });
  });

  test("ストレージの確定後に中断された場合は committed を公開する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const middleware = new FakeMiddleware();
    const ac = new AbortController();
    const reason = new Error("aborted");
    storage.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- 書き込み時だけ中断するための分岐です。
      if (call.method === "write") {
        ac.abort(reason);
      }
    };

    await using kvs = new Builder<Mapping>().use(middleware).persist(storage).build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "value", { signal: ac.signal });

    // 検証：
    expect(afterUseOf(middleware)).toStrictEqual([
      {
        error: reason,
        status: "aborted",
        targets: [
          {
            name: "FakeStorage",
            index: 0,
            status: "committed",
          },
        ],
      },
    ]);
  });

  test("分岐にだけ適用したミドルウェアにはその分岐の宛先だけを通知する", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const middleware = new FakeMiddleware();
    await using kvs = new Builder<Mapping>().persist(first).use(middleware).persist(second).build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "value");

    // 検証：
    expect(afterUseOf(middleware)).toStrictEqual([
      {
        status: "success",
        targets: [
          {
            name: "second",
            index: 1,
            status: "committed",
          },
        ],
      },
    ]);
  });
});
