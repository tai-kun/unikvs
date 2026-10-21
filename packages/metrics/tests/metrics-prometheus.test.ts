import type { IMiddleware } from "@unikvs/core";
import {
  createDecodeContext,
  createEncodeContext,
  createGetContext,
  createNext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { Metrics } from "../src/index.js";

describe("Prometheus 形式", () => {
  test("記録なしでも HELP/TYPE 行を返す", ({ expect }) => {
    // 実行
    const text = new Metrics().toPrometheusString();

    // 検証
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain("# HELP unikvs_operations_total");
    expect(text).toContain("# TYPE unikvs_operations_total counter");
    expect(text).toContain("# HELP unikvs_operation_duration_ms_sum");
    expect(text).toContain("# HELP unikvs_operation_bytes_total");
    expect(text).not.toContain("unikvs_operations_total{");
  });

  test("exporter に prometheus を指定すると記録を公開用テキストへ出力できる", async ({
    expect,
  }) => {
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

  test("操作数と成否を action/outcome 別に出力する", async ({ expect }) => {
    // 準備
    const metrics = new Metrics();
    await metrics.use(createSetContext("a") as IMiddleware.UseContext, createNext());
    await metrics.use(createSetContext("b") as IMiddleware.UseContext, createNext());
    await metrics
      .use(createGetContext("c") as IMiddleware.UseContext, async () => {
        throw new Error("missing");
      })
      .then(
        () => {},
        () => {},
      );

    // 実行
    const text = metrics.toPrometheusString();

    // 検証
    expect(text).toContain('unikvs_operations_total{action="set",outcome="success"} 2');
    expect(text).toContain('unikvs_operations_total{action="set",outcome="error"} 0');
    expect(text).toContain('unikvs_operations_total{action="get",outcome="success"} 0');
    expect(text).toContain('unikvs_operations_total{action="get",outcome="error"} 1');
    expect(text).toContain('unikvs_operation_duration_ms_sum{action="set"}');
    // キーはラベルに含めない (カーディナリティ爆発の防止)
    expect(text).not.toContain('action="a"');
  });

  test("encode で観測したバイト数を出力する", async ({ expect }) => {
    // 準備
    const metrics = new Metrics();
    await metrics.encode(
      createEncodeContext("hello", "key") as IMiddleware.EncodeContext,
      createNext(),
    );
    await metrics.decode(createDecodeContext(1, "key") as IMiddleware.DecodeContext, createNext());

    // 実行
    const text = metrics.toPrometheusString();

    // 検証
    expect(text).toContain('unikvs_operation_bytes_total{action="set"} 5');
    expect(text).toContain('unikvs_operation_bytes_total{action="get"} 0');
  });
});
