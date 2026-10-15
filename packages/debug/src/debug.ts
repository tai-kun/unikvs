import { getLogger } from "@logtape/logtape";
import type { IMiddleware, IPipelineContext } from "@unikvs/core";
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
  readonly vars: IPipelineContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  readonly action: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  readonly direction: DebugDirection;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  readonly data: unknown;
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

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#usage)
   */
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
      keyFilter = () => true,
      actionFilter = () => true,
      getDebugInfo = Debug.getDefaultDebugInfo,
    } = options;
    this.keyFilter = keyFilter;
    this.actionFilter = actionFilter;
    this.getDebugInfo = getDebugInfo;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#usage)
   */
  public async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    this.#log("write", c, c.source);
    c.destination = c.source;
    await next();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#usage)
   */
  public async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    this.#log("read", c, c.source);
    c.destination = c.source;
    await next();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#streams)
   */
  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source.pipeThrough(this.#createTransformStream("write", c));
    await next();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#streams)
   */
  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source.pipeThrough(this.#createTransformStream("read", c));
    await next();
  }

  /**
   * チャンクごとにログを記録する透過ストリームを作成する内部メソッドです。
   *
   * @param direction データが読み書きされた向きです。
   * @param c 操作のコンテキストです。
   * @returns 入力をそのまま出力する TransformStream オブジェクトです。
   */
  #createTransformStream(
    direction: DebugDirection,
    c: IPipelineContext & { readonly action: string; readonly key: string },
  ): TransformStream<any, any> {
    return new TransformStream({
      /**
       * チャンクが到達するたびにログを記録し、そのまま下流へ流します。
       *
       * @param chunk 入力されたデータです。
       * @param controller ストリームを制御するためのコントローラーです。
       */
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
  #log(
    direction: DebugDirection,
    c: IPipelineContext & { readonly action: string; readonly key: string },
    data: unknown,
  ): void {
    const action = c.action;
    if (!this.actionFilter(action)) {
      return;
    }

    const key = c.key;
    if (!this.keyFilter(key)) {
      return;
    }

    const message =
      direction === "write"
        ? "Data was written: action={action}, key={key}"
        : "Data was read: action={action}, key={key}";

    logger.debug(message, () => {
      const info = this.getDebugInfo({ vars: c, action, key, direction, data });
      return { ...info, action, key, direction };
    });
  }
}
