import type { IMiddleware } from "@unikvs/core";

/**
 * スパンの状態コードです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
 */
export type SpanStatusCode = "unset" | "ok" | "error";

/**
 * スパンに設定する状態です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
 */
export type SpanStatus = {
  /**
   * スパンの状態コードです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
   */
  readonly code: SpanStatusCode;

  /**
   * 状態に付与するメッセージです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
   */
  readonly message?: string | undefined;
};

/**
 * スパン属性に設定できる値の型です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
 */
export type SpanAttributeValue = string | number | boolean;

/**
 * トレーサーから発行されるスパンの最小インターフェースです。
 * OpenTelemetry の Span と構造的に互換性があります。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
 */
export interface SpanLike {
  /**
   * スパンに属性を設定します。
   */
  setAttribute(name: string, value: SpanAttributeValue): void;

  /**
   * スパンの状態を設定します。
   */
  setStatus(status: SpanStatus): void;

  /**
   * スパンを終了します。
   */
  end(): void;
}

/**
 * スパンを発行するトレーサーの最小インターフェースです。
 * OpenTelemetry の Tracer と構造的に互換性があります。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
 */
export interface TracerLike {
  /**
   * 指定した名前のスパンを開始します。
   */
  startSpan(name: string): SpanLike;
}

/**
 * 何も記録しないスパンです。
 * トレーサーが指定されなかった場合の既定値として使用します。
 */
class NoopSpan implements SpanLike {
  public setAttribute(): void {}

  public setStatus(): void {}

  public end(): void {}
}

/**
 * 何も記録しないトレーサーです。
 * トレーサーが指定されなかった場合の既定値として使用します。
 */
class NoopTracer implements TracerLike {
  readonly #span: SpanLike = new NoopSpan();

  public startSpan(): SpanLike {
    return this.#span;
  }
}

/**
 * トレーサーが指定されなかった場合に使われる既定のトレーサーです。
 */
const defaultTracer: TracerLike = new NoopTracer();

/**
 * Tracing ミドルウェアのオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
 */
export type TracingOptions = {
  /**
   * スパンを発行するトレーサーです。
   * 省略した場合は何も記録しません。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
   */
  readonly tracer?: TracerLike | undefined;

  /**
   * スパン名の先頭に付ける接頭辞です。
   * 既定値は `"unikvs."` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
   */
  readonly spanNamePrefix?: string | undefined;
};

/**
 * エラーから状態メッセージを取り出す内部関数です。
 *
 * @param error スパンを失敗させたエラーです。
 *
 * @returns 状態に設定するメッセージを返します。
 */
function toStatusMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 操作対象の論理キーを取り出す内部関数です。
 * `clear` のようにキーがない操作では空文字を返します。
 *
 * @param c 操作のコンテキストです。
 *
 * @returns 論理キーを返します。
 */
function keyOf(c: IMiddleware.UseContext): string {
  return "key" in c && typeof c.key === "string" ? c.key : "";
}

/**
 * 操作ごとにトレーススパンを発行するミドルウェアです。
 * スパンには `key`、`action`、`success`、`durationMs` を属性として含めます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
 */
export default class Tracing implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
   */
  public readonly name: string = "Tracing";

  /**
   * スパンを発行するトレーサーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
   */
  public readonly tracer: TracerLike;

  /**
   * スパン名の先頭に付ける接頭辞です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
   */
  public readonly spanNamePrefix: string;

  /**
   * Tracing ミドルウェアを作成します。
   *
   * @param options トレーサーとスパン名の接頭辞です。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/tracing#usage)
   */
  public constructor(options: TracingOptions = {}) {
    const { tracer = defaultTracer, spanNamePrefix = "unikvs." } = options;
    this.tracer = tracer;
    this.spanNamePrefix = spanNamePrefix;
  }

  public get isOpen(): boolean {
    return true;
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    await this.#trace(`${this.spanNamePrefix}use.${c.action}`, c.action, keyOf(c), next);
  }

  public async encode<TData>(
    c: IMiddleware.EncodeContext<TData>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;

    await this.#trace(`${this.spanNamePrefix}encode`, c.action, c.key, next);
  }

  public async decode<TData>(
    c: IMiddleware.DecodeContext<TData>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;

    await this.#trace(`${this.spanNamePrefix}decode`, c.action, c.key, next);
  }

  public async encodeStream<TChunk>(
    c: IMiddleware.EncodeStreamContext<TChunk>,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.#traceStream(`${this.spanNamePrefix}encodeStream`, c.action, c, next);
  }

  public async decodeStream<TChunk>(
    c: IMiddleware.DecodeStreamContext<TChunk>,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.#traceStream(`${this.spanNamePrefix}decodeStream`, c.action, c, next);
  }

  /**
   * `next` の実行を 1 つのスパンで包む内部メソッドです。
   *
   * @param spanName スパン名です。
   * @param action 操作の種類です。
   * @param key 操作対象の論理キーです。
   * @param next 次のミドルウェアを呼び出す関数です。
   */
  async #trace(
    spanName: string,
    action: string,
    key: string,
    next: IMiddleware.INext,
  ): Promise<void> {
    const span = this.tracer.startSpan(spanName);
    const startTime = Date.now();
    span.setAttribute("key", key);
    span.setAttribute("action", action);

    try {
      await next();
      span.setAttribute("success", true);
      span.setStatus({ code: "ok" });
    } catch (error) {
      span.setAttribute("success", false);
      span.setStatus({
        code: "error",
        message: toStatusMessage(error),
      });
      throw error;
    } finally {
      span.setAttribute("durationMs", Date.now() - startTime);
      span.end();
    }
  }

  /**
   * ストリーム操作を 1 つのスパンで包む内部メソッドです。
   * スパンはストリームの読み切り・エラー・取り消しのいずれかで終了します。
   *
   * @param spanName スパン名です。
   * @param action 操作の種類です。
   * @param c ストリーム操作のコンテキストです。
   * @param next 次のミドルウェアを呼び出す関数です。
   */
  async #traceStream<TChunk>(
    spanName: string,
    action: string,
    c: IMiddleware.EncodeStreamContext<TChunk> | IMiddleware.DecodeStreamContext<TChunk>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const span = this.tracer.startSpan(spanName);
    const startTime = Date.now();
    span.setAttribute("key", c.key);
    span.setAttribute("action", action);

    let finished = false;
    const finish = (success: boolean, error?: unknown): void => {
      if (finished) {
        return;
      }

      finished = true;

      span.setAttribute("success", success);

      if (success) {
        span.setStatus({ code: "ok" });
      } else {
        span.setStatus({
          code: "error",
          message: toStatusMessage(error),
        });
      }

      span.setAttribute("durationMs", Date.now() - startTime);
      span.end();
    };

    try {
      c.destination = this.#passThrough(c.source, finish);
      await next();
    } catch (error) {
      finish(false, error);
      throw error;
    }
  }

  /**
   * チャンクをそのまま通す透過ストリームを作成する内部メソッドです。
   * ストリームの終了・失敗・取り消しでスパンを終了するために使用します。
   *
   * @param source 変換前の入力ストリームです。
   * @param finish スパンを終了する関数です。
   *
   * @returns 入力をそのまま出力するストリームを返します。
   */
  #passThrough<TChunk>(
    source: ReadableStream<TChunk>,
    finish: (success: boolean, error?: unknown) => void,
  ): ReadableStream<TChunk> {
    const reader = source.getReader();

    return new ReadableStream<TChunk>({
      pull: async (controller): Promise<void> => {
        try {
          const { done, value } = await reader.read();

          if (done) {
            reader.releaseLock();
            finish(true);
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          finish(false, error);
          controller.error(error);
        }
      },
      cancel: async (reason): Promise<void> => {
        finish(true);
        await reader.cancel(reason);
      },
    });
  }
}
