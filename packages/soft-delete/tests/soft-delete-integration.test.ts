import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import { sourceFrom, captureRejection, createGetContext, createHasContext } from "@unikvs/testing";
import { type Value, type StreamValue, UniKvs } from "unikvs";
import { test, describe } from "vite-plus/test";

import { TombstoneNotFoundError } from "../src/errors.js";
import SoftDelete, { type SoftDeleteOptions } from "../src/soft-delete.js";

/**
 * 統合テストで使うキーと値の対応です。
 * 通常値とストリーム値の両方で墓標化を検証します。
 */
type TestMapping = {
  logs: StreamValue<Uint8Array>;
  report: Value<string>;
};

/**
 * SoftDelete を適用したクライアントを作成します。
 * 削除の墓標化と復元・実削除の検証に使用します。
 */
async function createSoftDeleteKvs(options?: SoftDeleteOptions): Promise<{
  kvs: UniKvs<TestMapping>;
  inner: Memory;
  softDelete: SoftDelete;
}> {
  const inner = new Memory();
  const softDelete = new SoftDelete(inner, options);
  const kvs = UniKvs.config<TestMapping>().use(softDelete).persist(softDelete).create();
  await kvs.open();

  return {
    kvs,
    inner,
    softDelete,
  };
}

/**
 * 指定ミリ秒だけ待ちます。
 * 保持期限の遅延失効の検証に使用します。
 */
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 下層ストレージの生値を読みます。
 * 墓標が同一ストレージに残ることの検証に使用します。
 */
async function readRaw(inner: Memory, key: string): Promise<unknown> {
  return await inner.read(createGetContext(key) as IStorage.ReadContext);
}

describe("削除の墓標化", () => {
  test("delete の後、get は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const { kvs } = await createSoftDeleteKvs();
    await kvs.set("report", "hello");
    await kvs.delete("report");

    // 実行：
    const error = await captureRejection(kvs.get("report"));

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      meta: { key: "report" },
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: report",
    });

    // 後片付け。
    await kvs.close();
  });

  test("delete の後、has は false を返す", async ({ expect }) => {
    // 準備：
    const { kvs } = await createSoftDeleteKvs();
    await kvs.set("report", "hello");

    // 実行前の検証。
    expect(await kvs.has("report")).toBe(true);

    // 実行：
    await kvs.delete("report");

    // 検証：
    expect(await kvs.has("report")).toBe(false);

    // 後片付け。
    await kvs.close();
  });

  test("delete の後、stream は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const { kvs } = await createSoftDeleteKvs();
    await kvs.set("logs", sourceFrom([new Uint8Array([1, 2])]));
    await kvs.delete("logs");

    // 実行：
    const error = await captureRejection(kvs.stream("logs"));

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "logs" });

    // 後片付け。
    await kvs.close();
  });

  test("墓標は下層ストレージに通常値と同じキーで残る", async ({ expect }) => {
    // 準備：
    const { kvs, inner } = await createSoftDeleteKvs();
    await kvs.set("report", "hello");

    // 実行：
    await kvs.delete("report");

    // 検証 : 墓標は側車ではなく下層ストレージの記録として残る。
    const raw = await readRaw(inner, "report");
    expect(raw).toMatchObject({
      value: "hello",
      hasValue: true,
      __tombstone: true,
    });
    expect(typeof (raw as { deletedAt?: unknown }).deletedAt).toBe("number");

    // 後片付け。
    await kvs.close();
  });

  test("存在しないキーの has は false を返し、delete も成功する", async ({ expect }) => {
    // 準備：
    const { kvs } = await createSoftDeleteKvs();

    // 実行前の検証。
    expect(await kvs.has("report")).toBe(false);

    // 実行と検証：
    await kvs.delete("report");
    expect(await kvs.has("report")).toBe(false);

    // 後片付け。
    await kvs.close();
  });
});

describe("二重削除の挙動", () => {
  test("二重削除は冪等に成功し、最初の削除時刻を保つ", async ({ expect }) => {
    // 準備：
    const { kvs, softDelete } = await createSoftDeleteKvs();
    await kvs.set("report", "hello");
    await kvs.delete("report");

    const first = await softDelete.listTombstones();
    expect(first).toHaveLength(1);

    // 実行 : 時刻が進んでから再度削除する。
    await sleep(10);
    await kvs.delete("report");

    // 検証 : 失敗せず、削除時刻は最初のまま保たれる。
    const second = await softDelete.listTombstones();
    expect(second).toHaveLength(1);
    expect(second[0]).toStrictEqual(first[0]);

    expect(await kvs.has("report")).toBe(false);
    const error = await captureRejection(kvs.get("report"));
    expect(error).toBeInstanceOf(KeyNotFoundError);

    // 検証 : 墓標のスナップショットは最初の削除時のまま。
    expect(await softDelete.restore("report")).toBe("hello");

    // 後片付け。
    await kvs.close();
  });
});

describe("復元", () => {
  test("restore は値を戻し、get と has が復活する", async ({ expect }) => {
    // 準備：
    const { kvs, softDelete } = await createSoftDeleteKvs();
    await kvs.set("report", "hello");
    await kvs.delete("report");

    // 実行：
    const restored = await softDelete.restore("report");

    // 検証：
    expect(restored).toBe("hello");

    expect(await kvs.get("report")).toBe("hello");
    expect(await kvs.has("report")).toBe(true);
    expect(await softDelete.listTombstones()).toStrictEqual([]);

    // 後片付け。
    await kvs.close();
  });

  test("restore はストリーム値を戻す", async ({ expect }) => {
    // 準備：
    const { kvs, softDelete } = await createSoftDeleteKvs();
    await kvs.set("logs", sourceFrom([new Uint8Array([1, 2]), new Uint8Array([3])]));
    await kvs.delete("logs");

    // 実行：
    await softDelete.restore("logs");

    // 検証 : 復元したストリームが読み取れる。
    const stream = await kvs.stream("logs");
    const chunks: Uint8Array[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    await stream.dispose();
    expect(chunks).toStrictEqual([new Uint8Array([1, 2, 3])]);

    // 後片付け。
    await kvs.close();
  });

  test("墓標のない restore は TombstoneNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const { kvs, softDelete } = await createSoftDeleteKvs();
    await kvs.set("report", "hello");

    // 実行 : 有効なキーと存在しないキーで復元を試みる。
    const liveError = await captureRejection(softDelete.restore("report"));
    const missingError = await captureRejection(softDelete.restore("unknown"));

    // 検証：
    for (const error of [liveError, missingError]) {
      expect(error).toBeInstanceOf(TombstoneNotFoundError);
    }

    expect(liveError).toMatchObject({
      meta: { key: "report" },
      name: "UniKvsTombstoneNotFoundError",
    });

    // 検証 : 復元に失敗しても有効な値は変わらない。
    expect(await kvs.get("report")).toBe("hello");

    // 後片付け。
    await kvs.close();
  });

  test("set による上書きは墓標を復活させる", async ({ expect }) => {
    // 準備：
    const { kvs, softDelete } = await createSoftDeleteKvs();
    await kvs.set("report", "v1");
    await kvs.delete("report");

    // 実行：
    await kvs.set("report", "v2");

    // 検証 : 墓標は消え、新しい値が読める。
    expect(await kvs.get("report")).toBe("v2");
    expect(await softDelete.listTombstones()).toStrictEqual([]);

    // 後片付け。
    await kvs.close();
  });
});

describe("実削除", () => {
  test("purge(key) は墓標を下層から消し、restore を不可能にする", async ({ expect }) => {
    // 準備：
    const { kvs, inner, softDelete } = await createSoftDeleteKvs();
    await kvs.set("report", "hello");
    await kvs.delete("report");

    // 実行：
    const purged = await softDelete.purge("report");

    // 検証：
    expect(purged).toBe(true);

    expect(inner.exists(createHasContext("report") as IStorage.ExistsContext)).toBe(false);
    expect(await softDelete.listTombstones()).toStrictEqual([]);
    const error = await captureRejection(softDelete.restore("report"));
    expect(error).toBeInstanceOf(TombstoneNotFoundError);

    // 後片付け。
    await kvs.close();
  });

  test("墓標のない purge(key) は false を返す", async ({ expect }) => {
    // 準備：
    const { kvs, softDelete } = await createSoftDeleteKvs();
    await kvs.set("report", "hello");

    // 実行と検証 : 有効なキーと存在しないキーは何も消さない。
    expect(await softDelete.purge("report")).toBe(false);
    expect(await softDelete.purge("unknown")).toBe(false);
    expect(await kvs.get("report")).toBe("hello");

    // 後片付け。
    await kvs.close();
  });

  test("purge() は全墓標を消す", async ({ expect }) => {
    // 準備：
    const { kvs, inner, softDelete } = await createSoftDeleteKvs();
    await kvs.set("report", "hello");
    await kvs.set("logs", sourceFrom([new Uint8Array([9])]));
    await kvs.delete("report");
    await kvs.delete("logs");
    expect(await softDelete.listTombstones()).toHaveLength(2);

    // 実行：
    const count = await softDelete.purge();

    // 検証：
    expect(count).toBe(2);

    expect(await softDelete.listTombstones()).toStrictEqual([]);
    expect(inner.exists(createHasContext("report") as IStorage.ExistsContext)).toBe(false);
    expect(inner.exists(createHasContext("logs") as IStorage.ExistsContext)).toBe(false);

    // 後片付け。
    await kvs.close();
  });

  test("clear は墓標も台帳も消す", async ({ expect }) => {
    // 準備：
    const { kvs, inner, softDelete } = await createSoftDeleteKvs();
    await kvs.set("report", "hello");
    await kvs.delete("report");

    // 実行：
    await kvs.clear();

    // 検証：
    expect(await softDelete.listTombstones()).toStrictEqual([]);
    expect(inner.exists(createHasContext("report") as IStorage.ExistsContext)).toBe(false);

    // 後片付け。
    await kvs.close();
  });
});

describe("墓標の一覧", () => {
  test("listTombstones は削除時刻順に墓標を返す", async ({ expect }) => {
    // 準備：
    const { kvs, softDelete } = await createSoftDeleteKvs();
    await kvs.set("report", "hello");
    await kvs.set("logs", sourceFrom([new Uint8Array([1])]));
    await kvs.delete("logs");

    await sleep(10);
    await kvs.delete("report");

    // 実行：
    const entries = await softDelete.listTombstones();

    // 検証：
    expect(entries.map((entry) => entry.key)).toStrictEqual(["logs", "report"]);

    for (const entry of entries) {
      expect(typeof entry.deletedAt).toBe("number");
    }

    // 後片付け。
    await kvs.close();
  });

  test("墓標のないときは空配列を返す", async ({ expect }) => {
    // 準備：
    const { kvs, softDelete } = await createSoftDeleteKvs();

    // 実行と検証：
    expect(await softDelete.listTombstones()).toStrictEqual([]);

    // 後片付け。
    await kvs.close();
  });
});

describe("保持期限による遅延失効", () => {
  test("期限切れの墓標は get と has で存在しないものとして扱われる", async ({ expect }) => {
    // 準備：
    const { kvs, inner } = await createSoftDeleteKvs({ retentionMs: 40 });
    await kvs.set("report", "hello");
    await kvs.delete("report");
    expect(await kvs.has("report")).toBe(false);

    // 実行 : 保持期限が過ぎるまで待つ。
    await sleep(90);

    // 検証 : 読み出しで期限切れが掃除され、下層からも消える。
    const error = await captureRejection(kvs.get("report"));
    expect(error).toBeInstanceOf(KeyNotFoundError);

    expect(await kvs.has("report")).toBe(false);
    expect(inner.exists(createHasContext("report") as IStorage.ExistsContext)).toBe(false);

    // 後片付け。
    await kvs.close();
  });

  test("期限切れの墓標は restore できず、一覧から消える", async ({ expect }) => {
    // 準備：
    const { kvs, softDelete } = await createSoftDeleteKvs({ retentionMs: 40 });
    await kvs.set("report", "hello");
    await kvs.delete("report");
    expect(await softDelete.listTombstones()).toHaveLength(1);

    // 実行 : 保持期限が過ぎてから一覧を取り、期限切れを掃除する。
    await sleep(90);

    // 検証 : 一覧の走査で期限切れが掃除され、復元もできない。
    expect(await softDelete.listTombstones()).toStrictEqual([]);
    const error = await captureRejection(softDelete.restore("report"));
    expect(error).toBeInstanceOf(TombstoneNotFoundError);

    expect(await softDelete.listTombstones()).toStrictEqual([]);

    // 後片付け。
    await kvs.close();
  });

  test("期限内の墓標は restore できる", async ({ expect }) => {
    // 準備：
    const { kvs, softDelete } = await createSoftDeleteKvs({ retentionMs: 10_000 });
    await kvs.set("report", "hello");
    await kvs.delete("report");

    // 実行と検証：
    expect(await softDelete.restore("report")).toBe("hello");
    expect(await kvs.get("report")).toBe("hello");

    // 後片付け。
    await kvs.close();
  });
});
