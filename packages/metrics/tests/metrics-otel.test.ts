import { metrics as otelMetrics } from "@opentelemetry/api";
import type { IMiddleware } from "@unikvs/core";
import { createGetContext, createNext, createSetContext } from "@unikvs/testing";
import { describe, test } from "vitest";

import { Metrics } from "../src/index.js";
import type { MetricsCounter, MetricsHistogram, MetricsMeterProvider } from "../src/index.js";

type CapturedCall = {
  readonly instrument: string;
  readonly value: number;
  readonly attributes: Record<string, string>;
};

/**
 * OTel の MeterProvider 互換の偽オブジェクトを作成します。
 */
function createFakeMeterProvider(calls: CapturedCall[]): MetricsMeterProvider {
  return {
    getMeter: () => ({
      createCounter: (name: string): MetricsCounter => ({
        add: (value: number, attributes?: Record<string, string>) => {
          calls.push({ instrument: name, value, attributes: attributes ?? {} });
        },
      }),
      createHistogram: (name: string): MetricsHistogram => ({
        record: (value: number, attributes?: Record<string, string>) => {
          calls.push({ instrument: name, value, attributes: attributes ?? {} });
        },
      }),
    }),
  };
}

describe("OTel エクスポート", () => {
  test("レコードを counter/histogram に転送する", async ({ expect }) => {
    // 準備
    const calls: CapturedCall[] = [];
    const meterProvider = createFakeMeterProvider(calls);
    const getMeterArgs: unknown[][] = [];
    const spyingProvider: MetricsMeterProvider = {
      getMeter: (name: string, version?: string) => {
        getMeterArgs.push([name, version]);
        return meterProvider.getMeter!(name, version);
      },
    };
    const metrics = new Metrics({ exporter: "otel", meterProvider: spyingProvider });

    // 実行
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());
    await metrics
      .use(createGetContext("key") as IMiddleware.UseContext, async () => {
        throw new Error("missing");
      })
      .then(
        () => {},
        () => {},
      );

    // 検証
    expect(getMeterArgs).toStrictEqual([["@unikvs/metrics", "0.0.1"]]);
    expect(calls).toContainEqual({
      instrument: "unikvs.operations",
      value: 1,
      attributes: { action: "set", outcome: "success" },
    });
    expect(calls).toContainEqual({
      instrument: "unikvs.operations",
      value: 1,
      attributes: { action: "get", outcome: "error" },
    });
    const durations = calls.filter((call) => call.instrument === "unikvs.operation.duration");
    expect(durations).toHaveLength(2);
    expect(durations[0]!.attributes).toMatchObject({ action: "set" });
    expect(typeof durations[0]!.value).toBe("number");
  });

  test("meterProvider がなくてもメモリ記録は継続する", async ({ expect }) => {
    // 準備
    const metrics = new Metrics({ exporter: "otel" });

    // 実行
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());

    // 検証
    expect(metrics.getMetrics().total).toBe(1);
  });

  test("機能しない provider でも操作を壊さない", async ({ expect }) => {
    // 準備 (`getMeter` のない provider と計器を作らない meter)
    const metrics = new Metrics({ exporter: "otel", meterProvider: {} });
    const noInstruments = new Metrics({
      exporter: "otel",
      meterProvider: { getMeter: () => ({}) },
    });

    // 実行
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());
    await noInstruments.use(createSetContext("key") as IMiddleware.UseContext, createNext());

    // 検証
    expect(metrics.getMetrics().total).toBe(1);
    expect(noInstruments.getMetrics().total).toBe(1);
  });

  test("本物の OTel API と相互運用できる", async ({ expect }) => {
    // 準備 (SDK なしの Noop プロバイダーでも例外なく動作すること)
    const metrics = new Metrics({
      exporter: "otel",
      meterProvider: otelMetrics.getMeterProvider(),
    });

    // 実行
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());

    // 検証
    expect(metrics.getMetrics().total).toBe(1);
  });

  test("prometheus 指定でもメモリ記録する", async ({ expect }) => {
    // 準備
    const metrics = new Metrics({ exporter: "prometheus" });

    // 実行
    await metrics.use(createSetContext("key") as IMiddleware.UseContext, createNext());

    // 検証
    expect(metrics.getMetrics().total).toBe(1);
    expect(metrics.toPrometheusString()).toContain(
      'unikvs_operations_total{action="set",outcome="success"} 1',
    );
  });
});
