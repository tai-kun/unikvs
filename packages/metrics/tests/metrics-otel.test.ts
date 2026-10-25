import { metrics as otelMetrics } from "@opentelemetry/api";
import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  createGetContext,
  createSetContext,
  createEncodeContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { Metrics } from "../src/index.js";
import type {
  MetricsMeter,
  MetricsCounter,
  MetricsHistogram,
  MetricsMeterProvider,
} from "../src/index.js";

type CapturedCall = {
  readonly value: number;
  readonly attributes: Record<string, string>;
  readonly instrument: string;
};

/**
 * OTel の MeterProvider 互換の偽オブジェクトを作成します。
 */
function createFakeMeterProvider(calls: CapturedCall[]): MetricsMeterProvider {
  return {
    getMeter: (): MetricsMeter => ({
      createCounter: (name: string): MetricsCounter => ({
        add: (value: number, attributes?: Record<string, string>): void => {
          calls.push({
            value,
            attributes: attributes ?? {},
            instrument: name,
          });
        },
      }),
      createHistogram: (name: string): MetricsHistogram => ({
        record: (value: number, attributes?: Record<string, string>): void => {
          calls.push({
            value,
            attributes: attributes ?? {},
            instrument: name,
          });
        },
      }),
    }),
  };
}

describe("OTel エクスポート", () => {
  test("レコードを counter/histogram に転送する", async ({ expect }) => {
    // 準備：
    const calls: CapturedCall[] = [];
    const meterProvider = createFakeMeterProvider(calls);
    const getMeterArgs: unknown[][] = [];
    const spyingProvider: MetricsMeterProvider = {
      getMeter: (name: string, version?: string): MetricsMeter | undefined => {
        getMeterArgs.push([name, version]);

        return meterProvider.getMeter?.(name, version);
      },
    };
    const metrics = new Metrics({
      exporter: "otel",
      meterProvider: spyingProvider,
    });

    // 実行：
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());
    await metrics
      .use(createGetContext("key") as IMiddleware.UseContext, (): Promise<void> =>
        Promise.reject(new Error("missing")),
      )
      .catch((): void => {});

    // 検証：メーターは遅延して 1 回だけ作成されます。
    expect(getMeterArgs).toHaveLength(1);
    expect(getMeterArgs.at(0)?.at(0)).toBe("@unikvs/metrics");
    expect(calls).toContainEqual({
      value: 1,
      attributes: {
        action: "set",
        outcome: "success",
      },
      instrument: "unikvs.operations",
    });
    expect(calls).toContainEqual({
      value: 1,
      attributes: {
        action: "get",
        outcome: "error",
      },
      instrument: "unikvs.operations",
    });

    const durations = calls.filter((call) => call.instrument === "unikvs.operation.duration");
    expect(durations).toHaveLength(2);
    expect(durations.at(0)?.attributes).toMatchObject({ action: "set" });
    expect(typeof durations.at(0)?.value).toBe("number");
    // サイズが不明な use の記録は bytes カウンターへ転送されません。
    expect(calls.filter((call) => call.instrument === "unikvs.operation.bytes")).toHaveLength(0);
  });

  test("バイト数を持つレコードを bytes カウンターへ転送する", async ({ expect }) => {
    // 準備：
    const calls: CapturedCall[] = [];
    const metrics = new Metrics({
      exporter: "otel",
      meterProvider: createFakeMeterProvider(calls),
    });

    // 実行：
    await metrics.encode(
      createEncodeContext("hello", "key") as IMiddleware.EncodeContext,
      createNext(),
    );

    // 検証：
    expect(calls).toContainEqual({
      value: 5,
      attributes: { action: "set" },
      instrument: "unikvs.operation.bytes",
    });
  });

  test("meterProvider がなくてもメモリ記録は継続する", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics({ exporter: "otel" });

    // 実行：
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());

    // 検証：
    expect(metrics.getMetrics().total).toBe(1);
  });

  test("機能しない provider でも操作を壊さない", async ({ expect }) => {
    // 準備：`getMeter` のない provider と計器を作らない meter を使います。
    const metrics = new Metrics({
      exporter: "otel",
      meterProvider: {},
    });
    const noInstruments = new Metrics({
      exporter: "otel",
      meterProvider: {
        getMeter: (): MetricsMeter => ({}),
      },
    });

    // 実行：
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());
    await noInstruments.use(createSetContext("key") as IMiddleware.UseContext, createNext());

    // 検証：
    expect(metrics.getMetrics().total).toBe(1);
    expect(noInstruments.getMetrics().total).toBe(1);
  });

  test("本物の OTel API と相互運用できる", async ({ expect }) => {
    // 準備：SDK なしの Noop プロバイダーでも例外なく動作します。
    const metrics = new Metrics({
      exporter: "otel",
      meterProvider: otelMetrics.getMeterProvider(),
    });

    // 実行：
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());

    // 検証：
    expect(metrics.getMetrics().total).toBe(1);
  });
});
