import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  createGetContext,
  createHasContext,
  createSetContext,
  createCopyContext,
  createMoveContext,
  createClearContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { Metrics } from "../src/index.js";
import type { MetricRecord } from "../src/index.js";

/**
 * Creates a `use` context for every action the middleware observes.
 */
function createUseContext(action: IMiddleware.UseContext["action"]): IMiddleware.UseContext {
  switch (action) {
    case "set": {
      return createSetContext("key") as IMiddleware.UseContext;
    }

    case "get": {
      return createGetContext("key") as IMiddleware.UseContext;
    }

    case "stream": {
      return createStreamContext("key") as IMiddleware.UseContext;
    }

    case "has": {
      return createHasContext("key") as IMiddleware.UseContext;
    }

    case "delete": {
      return createDeleteContext("key") as IMiddleware.UseContext;
    }

    case "copy": {
      return createCopyContext("key", "destination") as IMiddleware.UseContext;
    }

    case "move": {
      return createMoveContext("key", "destination") as IMiddleware.UseContext;
    }

    case "clear": {
      return createClearContext() as IMiddleware.UseContext;
    }

    default: {
      throw new Error("Unknown action");
    }
  }
}

describe("基本属性", () => {
  test("name は Metrics を返す", ({ expect }) => {
    expect(new Metrics().name).toBe("Metrics");
  });

  test("isOpen は常に true を返す", ({ expect }) => {
    expect(new Metrics().isOpen).toBe(true);
  });

  test("registry オプションを保持する", ({ expect }) => {
    const registry = { custom: true };
    expect(new Metrics({ registry }).registry).toBe(registry);
  });
});

describe("use フックの計測", () => {
  test("全アクションの成功を記録する", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics();
    const actions = ["set", "get", "stream", "has", "delete", "clear"] as const;

    // 実行：
    for (const action of actions) {
      await metrics.use(createUseContext(action), createNext());
    }

    // 検証：
    const snapshot = metrics.getMetrics();
    expect(snapshot.total).toBe(actions.length);

    for (const action of actions) {
      expect(snapshot.byAction[action]).toMatchObject({
        count: 1,
        error: 0,
        success: 1,
      });
    }
  });

  test("持続時間とキーを記録する", async ({ expect }) => {
    // 準備：
    const seen: MetricRecord[] = [];
    const metrics = new Metrics({
      onRecord: (record: MetricRecord): void => {
        seen.push(record);
      },
    });

    // 実行：
    await metrics.use(createSetContext("foo") as IMiddleware.UseContext, createNext());

    // 検証：
    expect(seen).toHaveLength(1);
    expect(seen.at(0)).toMatchObject({
      key: "foo",
      action: "set",
      outcome: "success",
    });
    expect(typeof seen.at(0)?.durationMs).toBe("number");
    expect(seen.at(0)?.durationMs).toBeGreaterThanOrEqual(0);
    expect(seen.at(0)?.bytes).toBeUndefined();
  });

  test("clear のキーは undefined になる", async ({ expect }) => {
    // 準備：
    const seen: MetricRecord[] = [];
    const metrics = new Metrics({
      onRecord: (record: MetricRecord): void => {
        seen.push(record);
      },
    });

    // 実行：
    await metrics.use(createClearContext() as IMiddleware.UseContext, createNext());

    // 検証：
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      key: undefined,
      action: "clear",
    });
  });

  test("失敗した操作を error として記録し再送出する", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics();
    const failure = new Error("boom");
    const failingNext = (): Promise<void> => {
      throw failure;
    };

    // 実行：
    const caught = await metrics
      .use(createGetContext("key") as IMiddleware.UseContext, failingNext)
      .catch((error: unknown): unknown => error);

    // 検証：
    expect(caught).toBe(failure);
    expect(metrics.getMetrics().byAction["get"]).toMatchObject({
      count: 1,
      error: 1,
      success: 0,
    });
  });

  test("clock オプションで持続時間を決定できる", async ({ expect }) => {
    // 準備：
    let now = 100;
    const metrics = new Metrics({
      clock: (): number => now,
    });

    // 実行：
    await metrics.use(createHasContext("key") as IMiddleware.UseContext, (): Promise<void> => {
      now += 5;

      return Promise.resolve();
    });

    // 検証：
    expect(metrics.getMetrics().records.at(0)).toMatchObject({ durationMs: 5 });
  });
});

describe("転送と集計", () => {
  test("カスタム exporter 関数に全記録を渡す", async ({ expect }) => {
    // 準備：
    const exported: MetricRecord[] = [];
    const metrics = new Metrics({
      exporter: (record: MetricRecord): void => {
        exported.push(record);
      },
    });

    // 実行：
    await metrics.use(createSetContext("a") as IMiddleware.UseContext, createNext());
    await metrics.use(createGetContext("b") as IMiddleware.UseContext, createNext());

    // 検証：
    expect(exported).toHaveLength(2);
    expect(exported.map((record: MetricRecord): string => record.action)).toStrictEqual([
      "set",
      "get",
    ]);
  });

  test("onRecord が投げても操作を壊さない", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics({
      onRecord: (): void => {
        throw new Error("onRecord failure");
      },
    });

    // 実行：
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());

    // 検証：
    expect(metrics.getMetrics().total).toBe(1);
  });

  test("exporter が投げても操作を壊さない", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics({
      exporter: (): void => {
        throw new Error("exporter failure");
      },
    });

    // 実行：
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());

    // 検証：
    expect(metrics.getMetrics().total).toBe(1);
  });

  test("reset ですべて破棄する", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics();
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());
    expect(metrics.getMetrics().total).toBe(1);

    // 実行：
    metrics.reset();

    // 検証：
    expect(metrics.getMetrics()).toStrictEqual({
      total: 0,
      records: [],
      byAction: {},
    });
  });
});
