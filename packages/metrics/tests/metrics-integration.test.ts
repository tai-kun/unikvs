import { Memory } from "@unikvs/memory";
import { type UniKvs, type PlainValue, Builder } from "unikvs";
import { test, describe } from "vite-plus/test";

import { Metrics } from "../src/index.js";

/**
 * Metrics を組み込んだ実際の Builder パイプラインを作成します。
 *
 * @returns 開いた状態の UniKvs と Metrics を返します。
 */
async function createMetricsKvs(): Promise<{
  kvs: UniKvs<{ key: PlainValue<string> }>;
  metrics: Metrics;
}> {
  const metrics = new Metrics();
  const kvs = new Builder<{ key: PlainValue<string> }>().use(metrics).persist(new Memory()).build();
  await kvs.open();

  return {
    kvs,
    metrics,
  };
}

describe("Builder パイプラインとの統合", () => {
  test("set は use と encode の 2 件を成功として記録する", async ({ expect }) => {
    // 準備：
    const { kvs, metrics } = await createMetricsKvs();

    try {
      // 実行：
      await kvs.set("key", "hello");

      // 検証：
      const records = metrics.getMetrics().records;
      expect(records).toHaveLength(2);
      expect(records).toMatchObject([
        {
          key: "key",
          bytes: undefined,
          action: "set",
          outcome: "success",
        },
        {
          key: "key",
          bytes: 5,
          action: "set",
          outcome: "success",
        },
      ]);

      expect(metrics.getMetrics().byAction["set"]).toMatchObject({
        count: 2,
        error: 0,
        success: 2,
        totalBytes: 5,
      });
    } finally {
      await kvs.close();
    }
  });

  test("get は use と decode の 2 件を成功として記録する", async ({ expect }) => {
    // 準備：
    const { kvs, metrics } = await createMetricsKvs();

    try {
      await kvs.set("key", "hello");
      metrics.reset();

      // 実行：
      await expect(kvs.get("key")).resolves.toBe("hello");

      // 検証：
      const records = metrics.getMetrics().records;
      expect(records).toHaveLength(2);
      expect(records).toMatchObject([
        {
          key: "key",
          bytes: undefined,
          action: "get",
          outcome: "success",
        },
        {
          key: "key",
          bytes: 5,
          action: "get",
          outcome: "success",
        },
      ]);

      expect(metrics.getMetrics().byAction["get"]).toMatchObject({
        count: 2,
        error: 0,
        success: 2,
        totalBytes: 5,
      });
    } finally {
      await kvs.close();
    }
  });

  // このテストは、上流の計測境界による望ましくない現状の挙動を固定する特性テストです。use の成否がストレージ操作を表すように境界が変わった場合は、期待値を更新してください。
  test("存在しないキーの get は use の success 1 件のみ (ストレージ失敗を観測できない既知の制約)", async ({
    expect,
  }) => {
    // 準備：
    const { kvs, metrics } = await createMetricsKvs();

    try {
      // 実行：
      const caught = await kvs.get("missing" as "key").catch((error: unknown): unknown => error);

      // 検証：
      // 注意：`use` はストレージを読む前に呼ばれるため、この success はストレージ操作の成功ではなく `use` フックが正常に完了したことだけを表します。ストレージ操作の成否を `use` に伝える仕組みは現状のミドルウェア境界にないため、Metrics だけでは missing key を error にできません。
      // 上流の `#use` がストレージ操作全体を包むようになったら、outcome を error として検証する。
      expect(caught).toBeInstanceOf(Error);

      const records = metrics.getMetrics().records;
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        key: "missing",
        bytes: undefined,
        action: "get",
        outcome: "success",
      });

      expect(metrics.getMetrics().byAction["get"]).toMatchObject({
        count: 1,
        error: 0,
        success: 1,
      });
    } finally {
      await kvs.close();
    }
  });
});
