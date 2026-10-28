import { getLogger } from "@logtape/logtape";
import type { IMiddleware, IKeyedActionContext } from "@unikvs/core";
import getTypeName from "type-name";

const logger = getLogger(["@unikvs/*", "@unikvs/debug"]);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#records)
 */
export type DebugDirection = "write" | "read";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#key-filter)
 */
export interface IDebugKeyFilter {
  (key: string): boolean;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#action-filter)
 */
export interface IDebugActionFilter {
  (action: string): boolean;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
 */
export type DebugInfoArgs = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  readonly action: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  readonly data: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  readonly direction: DebugDirection;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
 */
export interface IDebugInfoCallback {
  (args: DebugInfoArgs): Record<string, unknown>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#options)
 */
export type DebugOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#key-filter)
   */
  readonly keyFilter?: IDebugKeyFilter | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#action-filter)
   */
  readonly actionFilter?: IDebugActionFilter | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  readonly getDebugInfo?: IDebugInfoCallback | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#usage)
 */
export default class Debug implements IMiddleware {
  public readonly name: string = "Debug";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#usage)
   */
  public readonly keyFilter: IDebugKeyFilter;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#usage)
   */
  public readonly actionFilter: IDebugActionFilter;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#usage)
   */
  public readonly getDebugInfo: IDebugInfoCallback;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#usage)
   */
  public constructor(options: DebugOptions = {}) {
    const {
      keyFilter = (): boolean => true,
      actionFilter = (): boolean => true,
      getDebugInfo = Debug.getDefaultDebugInfo,
    } = options;
    this.keyFilter = keyFilter;
    this.actionFilter = actionFilter;
    this.getDebugInfo = getDebugInfo;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  public static getDefaultDebugInfo(this: void, args: DebugInfoArgs): Record<string, unknown> {
    const { data } = args;
    const info: Record<string, unknown> = { type: getTypeName(data) };

    if (typeof data === "string") {
      // 文字列は UTF-16 コード単位の長さを記録します。
      info["length"] = data.length;
    } else if (ArrayBuffer.isView(data)) {
      // TypedArray と DataView は要素数ではなく正確なバイト数を記録します。
      info["byteLength"] = data.byteLength;
    }

    return info;
  }

  public get isOpen(): boolean {
    return true;
  }

  public async encode<TData>(
    c: IMiddleware.EncodeContext<TData>,
    next: IMiddleware.INext,
  ): Promise<void> {
    this.#log("write", c, c.source);

    c.destination = c.source;

    await next();
  }

  public async decode<TData>(
    c: IMiddleware.DecodeContext<TData>,
    next: IMiddleware.INext,
  ): Promise<void> {
    this.#log("read", c, c.source);

    c.destination = c.source;

    await next();
  }

  public async encodeStream<TChunk>(
    c: IMiddleware.EncodeStreamContext<TChunk>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const transform = this.#createTransform<TChunk>("write", c);
    c.destination = c.source.pipeThrough(transform);

    await next();
  }

  public async decodeStream<TChunk>(
    c: IMiddleware.DecodeStreamContext<TChunk>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const transform = this.#createTransform<TChunk>("read", c);
    c.destination = c.source.pipeThrough(transform);

    await next();
  }

  /**
   * チャンクごとにログを記録する透過ストリームを作成する内部メソッドです。
   *
   * @param direction データが読み書きされた向きです。
   * @param c 操作のコンテキストです。
   *
   * @returns 入力をそのまま出力する TransformStream オブジェクトです。
   */
  #createTransform<TChunk>(
    direction: DebugDirection,
    c: IKeyedActionContext,
  ): TransformStream<TChunk, TChunk> {
    return new TransformStream<TChunk, TChunk>({
      transform: (chunk, controller) => {
        this.#log(direction, c, chunk);

        controller.enqueue(chunk);
      },
    });
  }

  /**
   * フィルターを適用したうえで、操作とキーとデータのデバッグ情報をログに記録する内部メソッドです。
   *
   * @param direction データが読み書きされた向きです。
   * @param c 操作のコンテキストです。
   * @param data 読み書きされたデータです。ストリームの場合はチャンクです。
   */
  #log(direction: DebugDirection, c: IKeyedActionContext, data: unknown): void {
    if (!this.actionFilter(c.action) || !this.keyFilter(c.key)) {
      return;
    }

    const message =
      direction === "write"
        ? "Data was written: action={action}, key={key}"
        : "Data was read: action={action}, key={key}";
    logger.debug(message, () => {
      const info = this.getDebugInfo({
        key: c.key,
        data,
        action: c.action,
        direction,
      });

      return {
        ...info,
        key: c.key,
        action: c.action,
        direction,
      };
    });
  }
}
