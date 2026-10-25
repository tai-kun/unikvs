import type { IMiddleware } from "@unikvs/core";

/**
 * メトリクスミドルウェアが観測する操作名です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action)
 */
export type MetricsAction = IMiddleware.UseContext["action"];

/**
 * 観測した操作が成功したか失敗したかを表します。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-outcome)
 */
export type MetricsOutcome = "success" | "error";

/**
 * 名前で選択する組み込みのエクスポーターです。
 *
 * - `"otel"`: `meterProvider` から作成した OTel の計器へすべての記録を転送します。
 * - `"prometheus"`: 記録をメモリーに保持し、`toPrometheusString()` で公開用テキストを出力します。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-exporter-kind)
 */
export type MetricsExporterKind = "otel" | "prometheus";

/**
 * 記録されたすべての測定値を受け取るカスタム出力先です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-exporter)
 */
export interface MetricsExporter {
  (record: MetricRecord): void;
}

/**
 * 1 回の操作で観測した測定値です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record)
 */
export type MetricRecord = {
  /**
   * 観測した操作です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record-action)
   */
  readonly action: MetricsAction;

  /**
   * 操作が成功したか失敗したかです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record-outcome)
   */
  readonly outcome: MetricsOutcome;

  /**
   * 実時間での経過時間 (ミリ秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record-duration-ms)
   */
  readonly durationMs: number;

  /**
   * 観測したバイト数です。不明な場合は `undefined` です (encode/decode とストリームのチャンク)。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record-bytes)
   */
  readonly bytes: number | undefined;

  /**
   * 操作対象のキーです。キーを持たない `clear` では `undefined` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metric-record-key)
   */
  readonly key: string | undefined;
};

/**
 * OTel のカウンターのうち、本パッケージが使う最小の構造です。
 *
 * OTel への依存を避けるため、構造的な部分集合として定義します。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
 */
export type MetricsCounter = {
  /**
   * 値を加算します。
   */
  add(value: number, attributes?: Record<string, string>): void;
};

/**
 * OTel のヒストグラムのうち、本パッケージが使う最小の構造です。
 *
 * OTel への依存を避けるため、構造的な部分集合として定義します。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
 */
export type MetricsHistogram = {
  /**
   * 値を記録します。
   */
  record(value: number, attributes?: Record<string, string>): void;
};

/**
 * OTel のメーターのうち、本パッケージが使う最小の構造です。
 *
 * OTel への依存を避けるため、構造的な部分集合として定義します。
 *
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
 * OTel の MeterProvider のうち、本パッケージが使う最小の構造です。
 *
 * OTel への依存を避けるため、構造的な部分集合として定義します。
 * `@opentelemetry/api` (任意のピア依存) の `metrics.getMeterProvider()` や、互換性のある任意のオブジェクトを渡せます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
 */
export type MetricsMeterProvider = {
  /**
   * 名前と版数に対応するメーターを返します。
   */
  getMeter?(name: string, version?: string): MetricsMeter | undefined;
};

/**
 * 操作名ごとに集計したカウンターです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary)
 */
export type MetricsActionSummary = {
  /**
   * 操作名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-action)
   */
  readonly action: string;

  /**
   * 記録した操作の総数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-count)
   */
  readonly count: number;

  /**
   * 成功した操作の数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-success)
   */
  readonly success: number;

  /**
   * 失敗した操作の数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-error)
   */
  readonly error: number;

  /**
   * 観測したバイト数の合計です (サイズが判明した操作だけが加算されます)。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-total-bytes)
   */
  readonly totalBytes: number;

  /**
   * 観測した経過時間の合計 (ミリ秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-action-summary-total-duration-ms)
   */
  readonly totalDurationMs: number;
};

/**
 * これまでに記録したすべての測定値のスナップショットです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-snapshot)
 */
export type MetricsSnapshot = {
  /**
   * 記録した測定値の総数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-snapshot-total)
   */
  readonly total: number;

  /**
   * 操作名をキーにした集計結果です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-snapshot-by-action)
   */
  readonly byAction: Record<string, MetricsActionSummary>;

  /**
   * 記録したすべての測定値です (記録順)。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-snapshot-records)
   */
  readonly records: readonly MetricRecord[];
};

/**
 * メトリクスミドルウェアのオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-options)
 */
export type MetricsOptions = {
  /**
   * 測定値の転送先です。組み込みのエクスポーター名かカスタム出力関数を指定します。
   * この設定にかかわらず、測定値は常にメモリーに保持されます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-options-exporter)
   */
  readonly exporter?: MetricsExporterKind | MetricsExporter | undefined;

  /**
   * `exporter` が `"otel"` のときに使う OTel の MeterProvider です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-options-meter-provider)
   */
  readonly meterProvider?: MetricsMeterProvider | undefined;

  /**
   * 外部の Prometheus 連携のために保持する、不透明なレジストリーハンドルです。
   * Prometheus の公開用テキストは `toPrometheusString()` から取得できます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-options-registry)
   */
  readonly registry?: unknown;

  /**
   * 測定値を記録するたびに呼び出されるコールバックです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics-options-on-record)
   */
  readonly onRecord?: ((record: MetricRecord) => void) | undefined;

  /**
   * ミリ秒を返す時計です。既定では `performance.now()` を使います。
   *
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
 * 操作のメトリクスを記録するミドルウェアです。
 *
 * `use` フックはすべての操作 (`set`/`get`/`stream`/`has`/`delete`/`clear`) のレイテンシーと成否を測定します。`encode`/`decode` フックはバイトサイズも記録し、ストリームのフックはストリームが確定するまでチャンクサイズを合計します。
 * 測定値はメモリーに保持され (`getMetrics()` と `toPrometheusString()` を参照)、必要に応じて OTel の計器やカスタム出力先へ転送されます。
 * 記録処理は決して例外を投げません。出力先の失敗は握りつぶすため、メトリクスが操作のパイプラインを壊すことはありません。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
 */
export default class Metrics implements IMiddleware {
  /**
   * ミドルウェア名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public readonly name: string = "Metrics";

  /**
   * オプションで渡された、外部連携用の不透明なレジストリーハンドルです。
   *
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
   * メトリクスミドルウェアを作成します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   *
   * @param options エクスポーター、プロバイダー、レジストリー、記録コールバック、時計の設定です。
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
   * 常に `true` です。このミドルウェアはライフサイクルを必要としません。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * 操作全体を測定し、成功または失敗としてレイテンシーとともに記録します。
   *
   * @param c 操作の種類 (と `clear` 以外ではキー) を持つ操作コンテキストです。
   * @param next 次の操作です。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    const start = this.#clock();
    // `clear` は型上キーを持たないため、キーの有無を確認してから参照します。
    const key = c.action === "clear" || !("key" in c) ? undefined : c.key;

    try {
      await next();
    } catch (error) {
      this.#observe({
        key,
        bytes: undefined,
        action: c.action,
        outcome: "error",
        durationMs: this.#clock() - start,
      });
      throw error;
    }

    this.#observe({
      key,
      bytes: undefined,
      action: c.action,
      outcome: "success",
      durationMs: this.#clock() - start,
    });
  }

  /**
   * データをそのまま通し、サイズが判明している場合はバイト数を記録します。
   *
   * @param c 変換元のサイズを観測する encode コンテキストです。
   * @param next 次のトランスフォーマーです。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    const start = this.#clock();
    const bytes = estimateBytes(c.source);

    c.destination = c.source;

    try {
      await next();
    } catch (error) {
      this.#observe({
        key: c.key,
        bytes,
        action: c.action,
        outcome: "error",
        durationMs: this.#clock() - start,
      });
      throw error;
    }

    this.#observe({
      key: c.key,
      bytes,
      action: c.action,
      outcome: "success",
      durationMs: this.#clock() - start,
    });
  }

  /**
   * データをそのまま通し、サイズが判明している場合はバイト数を記録します。
   *
   * @param c 変換元のサイズを観測する decode コンテキストです。
   * @param next 次のトランスフォーマーです。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    const start = this.#clock();
    const bytes = estimateBytes(c.source);

    c.destination = c.source;

    try {
      await next();
    } catch (error) {
      this.#observe({
        key: c.key,
        bytes,
        action: c.action,
        outcome: "error",
        durationMs: this.#clock() - start,
      });
      throw error;
    }

    this.#observe({
      key: c.key,
      bytes,
      action: c.action,
      outcome: "success",
      durationMs: this.#clock() - start,
    });
  }

  /**
   * ストリームをそのまま通し、確定時に合計チャンクサイズを記録します。
   *
   * @param c チャンクを測定する encode ストリームのコンテキストです。
   * @param next 次のトランスフォーマーです。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.#pipeAndCount(c, next);
  }

  /**
   * ストリームをそのまま通し、確定時に合計チャンクサイズを記録します。
   *
   * @param c チャンクを測定する decode ストリームのコンテキストです。
   * @param next 次のトランスフォーマーです。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.#pipeAndCount(c, next);
  }

  /**
   * 集計したカウンターと、記録したすべての測定値を返します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   *
   * @returns 記録時点のメトリクスのスナップショットを返します。
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
   * 記録したメトリクスを Prometheus の公開用フォーマットで出力します。
   *
   * キーラベルは意図的に省略し、カーディナリティーが無制限に増えないようにしています。
   * キーごとの詳細は `getMetrics()` と `onRecord` から取得できます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   *
   * @returns 操作・経過時間・バイト数の系列を含む公開用テキストを返します。
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
   * 記録したすべての測定値と集計結果を破棄します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/metrics#metrics)
   */
  public reset(): void {
    this.#records.length = 0;
    this.#summaries.clear();
  }

  /**
   * ストリームをバイト数を数える変換へ通し、確定 (flush) または失敗 (cancel/ フックのエラー) したときに 1 件の測定値を記録します。
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
        const result = await reader.read();

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
