import type { IMiddleware } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action)
 */
export type MetricsAction = IMiddleware.UseContext["action"];

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-outcome)
 */
export type MetricsOutcome = "success" | "error";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-exporter-kind)
 */
export type MetricsExporterKind = "otel" | "prometheus";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-exporter)
 */
export interface MetricsExporter {
  (record: MetricRecord): void;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record)
 */
export type MetricRecord = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record-action)
   */
  readonly action: MetricsAction;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record-outcome)
   */
  readonly outcome: MetricsOutcome;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record-duration-ms)
   */
  readonly durationMs: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record-bytes)
   */
  readonly bytes: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record-key)
   */
  readonly key: string | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
 */
export type MetricsCounter = {
  /**
   * 値を加算します。
   */
  add(value: number, attributes?: Record<string, string>): void;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
 */
export type MetricsHistogram = {
  /**
   * 値を記録します。
   */
  record(value: number, attributes?: Record<string, string>): void;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
 */
export type MetricsMeter = {
  /**
   * カウンターを作成します。
   */
  createCounter?(name: string, options?: { description?: string }): MetricsCounter | undefined;

  /**
   * ヒストグラムを作成します。
   */
  createHistogram?(
    name: string,
    options?: {
      unit?: string;
      description?: string;
    },
  ): MetricsHistogram | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
 */
export type MetricsMeterProvider = {
  /**
   * 名前と版数に対応するメーターを返します。
   */
  getMeter?(name: string, version?: string): MetricsMeter | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary)
 */
export type MetricsActionSummary = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-action)
   */
  readonly action: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-count)
   */
  readonly count: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-success)
   */
  readonly success: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-error)
   */
  readonly error: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-total-bytes)
   */
  readonly totalBytes: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-total-duration-ms)
   */
  readonly totalDurationMs: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-snapshot)
 */
export type MetricsSnapshot = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-snapshot-total)
   */
  readonly total: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-snapshot-by-action)
   */
  readonly byAction: Record<string, MetricsActionSummary>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-snapshot-records)
   */
  readonly records: readonly MetricRecord[];
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-options)
 */
export type MetricsOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-options-exporter)
   */
  readonly exporter?: MetricsExporterKind | MetricsExporter | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-options-meter-provider)
   */
  readonly meterProvider?: MetricsMeterProvider | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-options-registry)
   */
  readonly registry?: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-options-on-record)
   */
  readonly onRecord?: ((record: MetricRecord) => void) | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-options-clock)
   */
  readonly clock?: (() => number) | undefined;
};

/**
 * 集計中の操作ごとのカウンターです。
 */
type MutableActionSummary = {
  count: number;
  error: number;
  success: number;
  totalBytes: number;
  totalDurationMs: number;
};

const textEncoder = new TextEncoder();

/**
 * 値のバイトサイズを見積もります。不明な場合は `undefined` を返します。
 *
 * @param data サイズを見積もる値です。
 *
 * @returns バイト数を返します。不明な場合は `undefined` を返します。
 */
function estimateBytes(data: unknown): number | undefined {
  let size: number | undefined = undefined;

  if (typeof data === "string") {
    size = textEncoder.encode(data).byteLength;
  } else if (data instanceof ArrayBuffer) {
    size = data.byteLength;
  } else if (ArrayBuffer.isView(data)) {
    size = data.byteLength;
  }

  return size;
}

/**
 * Prometheus のラベル値をエスケープします。
 *
 * @param value エスケープする値です。
 *
 * @returns エスケープした文字列を返します。
 */
function escapeLabelValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
 */
export default class Metrics implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public readonly name: string = "Metrics";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public readonly registry: unknown;

  readonly #exporterKind: MetricsExporterKind | undefined;

  readonly #exporterFn: MetricsExporter | undefined;

  readonly #meterProvider: MetricsMeterProvider | undefined;

  readonly #onRecord: ((record: MetricRecord) => void) | undefined;

  readonly #clock: () => number;

  readonly #records: MetricRecord[] = [];

  readonly #summaries = new Map<string, MutableActionSummary>();

  #otelInitialized = false;

  #otelOperations: MetricsCounter | undefined;

  #otelDuration: MetricsHistogram | undefined;

  #otelBytes: MetricsCounter | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public constructor(options: MetricsOptions = {}) {
    this.registry = options.registry;
    this.#exporterKind = typeof options.exporter === "string" ? options.exporter : undefined;
    this.#exporterFn = typeof options.exporter === "function" ? options.exporter : undefined;
    this.#meterProvider = options.meterProvider;
    this.#onRecord = options.onRecord;
    this.#clock = options.clock ?? ((): number => performance.now());
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    await this.#measure(c, next);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    c.destination = c.source;

    await this.#measure(c, next);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    c.destination = c.source;

    await this.#measure(c, next);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.#pipeAndCount(c, next);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.#pipeAndCount(c, next);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public getMetrics(): MetricsSnapshot {
    const byAction: Record<string, MetricsActionSummary> = {};

    for (const [action, summary] of this.#summaries) {
      byAction[action] = {
        count: summary.count,
        error: summary.error,
        action,
        success: summary.success,
        totalBytes: summary.totalBytes,
        totalDurationMs: summary.totalDurationMs,
      };
    }

    return {
      total: this.#records.length,
      records: [...this.#records],
      byAction,
    };
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public toPrometheusString(): string {
    const lines: string[] = [
      "# HELP unikvs_operations_total Total number of operations by action and outcome.",
      "# TYPE unikvs_operations_total counter",
    ];

    for (const [action, summary] of this.#summaries) {
      const name = escapeLabelValue(action);
      lines.push(`unikvs_operations_total{action="${name}",outcome="success"} ${summary.success}`);
      lines.push(`unikvs_operations_total{action="${name}",outcome="error"} ${summary.error}`);
    }

    lines.push(
      "# HELP unikvs_operation_duration_ms_sum Total operation duration in milliseconds by action.",
      "# TYPE unikvs_operation_duration_ms_sum counter",
    );

    for (const [action, summary] of this.#summaries) {
      lines.push(
        `unikvs_operation_duration_ms_sum{action="${escapeLabelValue(action)}"} ${summary.totalDurationMs}`,
      );
    }

    lines.push(
      "# HELP unikvs_operation_bytes_total Total observed bytes by action.",
      "# TYPE unikvs_operation_bytes_total counter",
    );

    for (const [action, summary] of this.#summaries) {
      lines.push(
        `unikvs_operation_bytes_total{action="${escapeLabelValue(action)}"} ${summary.totalBytes}`,
      );
    }

    return `${lines.join("\n")}\n`;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public reset(): void {
    this.#records.length = 0;
    this.#summaries.clear();
  }

  /**
   * `next` の実行時間を測り、成功または失敗の測定値を 1 件記録します。
   *
   * `use` の `next` は後続の `use` フックまでしか含まないため、この記録はストレージ操作の成否ではなくフック範囲の成否です。`encode`/`decode` は同じ action でバイト数を追加記録する仕様です。
   *
   * @param c 測定する操作のコンテキストです。
   * @param next 次のミドルウェアを呼び出す関数です。
   */
  async #measure(
    c: IMiddleware.UseContext | IMiddleware.EncodeContext | IMiddleware.DecodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    const start = this.#clock();
    // `clear` は型上キーを持たないため、キーの有無を確認してから参照します。
    const key = c.action === "clear" || !("key" in c) ? undefined : c.key;
    const bytes = "source" in c ? estimateBytes(c.source) : undefined;

    // `use` はストレージ操作の前に呼ばれ、`next()` は後続の `use` フックまでしか含みません。
    // そのため、ここで記録する成否はストレージ操作そのものではなく、このフック範囲の成否です。
    // ストレージ操作の成否を `use` に伝える仕組みは現状のミドルウェア境界にないため、`use` の success が missing key や書き込み失敗を表すことはありません。
    try {
      await next();
    } catch (error) {
      this.#observe({
        key,
        bytes,
        action: c.action,
        outcome: "error",
        durationMs: this.#clock() - start,
      });
      throw error;
    }

    this.#observe({
      key,
      bytes,
      action: c.action,
      outcome: "success",
      durationMs: this.#clock() - start,
    });
  }

  /**
   * ストリームをバイト数を数える変換へ通し、確定 (flush)、読み取り中の失敗、または取り消し (cancel) のいずれか早い時点で 1 件の測定値を記録します。
   *
   * @param c ストリーム操作のコンテキストです。
   * @param next 次のトランスフォーマーです。
   */
  async #pipeAndCount(
    c: IMiddleware.EncodeStreamContext | IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    const start = this.#clock();
    let bytes = 0;
    let settled = false;

    const settle = (outcome: MetricsOutcome): void => {
      if (settled) {
        return;
      }

      settled = true;
      this.#observe({
        key: "key" in c ? c.key : undefined,
        bytes,
        action: c.action,
        outcome,
        durationMs: this.#clock() - start,
      });
    };

    // `cancel` は実行時に呼び出されますが、`Transformer` 型には存在しないため、変換ストリームの読み取り側を包んでキャンセルを検出します。
    const transform = new TransformStream<unknown, unknown>({
      flush: (): void => {
        settle("success");
      },
      transform: (chunk: unknown, controller: TransformStreamDefaultController<unknown>): void => {
        const size = estimateBytes(chunk);

        if (size !== undefined) {
          bytes += size;
        }

        controller.enqueue(chunk);
      },
    });

    const piped = c.source.pipeThrough(transform);
    const reader = piped.getReader();
    c.destination = new ReadableStream<unknown>({
      async pull(controller: ReadableStreamDefaultController<unknown>): Promise<void> {
        let result: ReadableStreamReadResult<unknown>;

        try {
          result = await reader.read();
        } catch (error) {
          // ソース (下流の変換を含む) が読み取り中に失敗したときも、それまでに読めたバイト数で 1 件だけ記録します。
          settle("error");
          throw error;
        }

        if (result.done) {
          controller.close();

          return;
        }

        controller.enqueue(result.value);
      },
      async cancel(reason?: unknown): Promise<void> {
        settle("error");
        await reader.cancel(reason);
      },
    });

    try {
      await next();
    } catch (error) {
      settle("error");
      throw error;
    }
  }

  /**
   * 測定値を保存して集計を更新し、出力先へ転送します。
   * 出力先の失敗は握りつぶし、メトリクスがパイプラインを壊さないようにします。
   *
   * @param record 保存する測定値です。
   */
  #observe(record: MetricRecord): void {
    this.#records.push(record);

    let summary = this.#summaries.get(record.action);

    if (summary === undefined) {
      summary = {
        count: 0,
        error: 0,
        success: 0,
        totalBytes: 0,
        totalDurationMs: 0,
      };
      this.#summaries.set(record.action, summary);
    }

    summary.count += 1;

    if (record.outcome === "success") {
      summary.success += 1;
    } else {
      summary.error += 1;
    }

    if (record.bytes !== undefined) {
      summary.totalBytes += record.bytes;
    }

    summary.totalDurationMs += record.durationMs;

    try {
      this.#onRecord?.(record);
      this.#exporterFn?.(record);
      this.#exportOtel(record);
    } catch {
      // 出力先の失敗で操作のパイプラインを止めないようにします。
    }
  }

  /**
   * OTel の計器を遅延作成し、測定値を転送します。
   *
   * @param record 転送する測定値です。
   */
  #exportOtel(record: MetricRecord): void {
    if (this.#exporterKind !== "otel") {
      return;
    }

    if (!this.#otelInitialized) {
      this.#otelInitialized = true;
      const meter = this.#meterProvider?.getMeter?.("@unikvs/metrics", "0.0.1");
      this.#otelOperations = meter?.createCounter?.("unikvs.operations", {
        description: "Total number of operations by action and outcome.",
      });
      this.#otelDuration = meter?.createHistogram?.("unikvs.operation.duration", {
        unit: "ms",
        description: "Operation duration in milliseconds by action.",
      });
      this.#otelBytes = meter?.createCounter?.("unikvs.operation.bytes", {
        description: "Total observed bytes by action.",
      });
    }

    const attributes: Record<string, string> = {
      action: record.action,
      outcome: record.outcome,
    };
    this.#otelOperations?.add(1, attributes);
    this.#otelDuration?.record(record.durationMs, attributes);

    if (record.bytes !== undefined) {
      this.#otelBytes?.add(record.bytes, { action: record.action });
    }
  }
}
