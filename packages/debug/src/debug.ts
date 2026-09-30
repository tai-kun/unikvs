import { getLogger } from "@logtape/logtape";
import type { ITransformer, Variables } from "@unikvs/core";
import getTypeName from "type-name";

const logger = getLogger(["unikvs", "@unikvs/debug"]);

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
  readonly vars: Variables;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  readonly action: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#debug-info)
   */
  readonly key: string | undefined;

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
export default class Debug implements ITransformer {
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
  public readonly name: string;

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
    this.name = "Debug";
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
  public encode(args: Pick<ITransformer.EncodeArgs, "vars" | "data">): unknown {
    this.#log("write", args.vars, args.data);

    return args.data;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#usage)
   */
  public decode(args: Pick<ITransformer.DecodeArgs, "vars" | "data">): unknown {
    this.#log("read", args.vars, args.data);

    return args.data;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#streams)
   */
  public getEncodable(
    args: Pick<ITransformer.GetEncodableArgs, "vars">,
  ): TransformStream<any, any> {
    return this.#createTransformStream("write", args.vars);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/debug#streams)
   */
  public getDecodable(
    args: Pick<ITransformer.GetDecodableArgs, "vars">,
  ): TransformStream<any, any> {
    return this.#createTransformStream("read", args.vars);
  }

  /**
   * チャンクごとにログを記録する透過ストリームを作成する内部メソッドです。
   *
   * @param direction データが読み書きされた向きです。
   * @param vars 操作に使用された変数です。
   * @returns 入力をそのまま出力する TransformStream オブジェクトです。
   */
  #createTransformStream(direction: DebugDirection, vars: Variables): TransformStream<any, any> {
    return new TransformStream({
      /**
       * チャンクが到達するたびにログを記録し、そのまま下流へ流します。
       *
       * @param chunk 入力されたデータです。
       * @param controller ストリームを制御するためのコントローラーです。
       */
      transform: (chunk, controller) => {
        this.#log(direction, vars, chunk);
        controller.enqueue(chunk);
      },
    });
  }

  /**
   * フィルターを適用したうえで、操作とキーとデータのデバッグ情報をログに記録する内部メソッドです。
   *
   * @param direction データが読み書きされた向きです。
   * @param vars 操作に使用された変数です。
   * @param data 読み書きされたデータです。ストリームの場合はチャンクです。
   */
  #log(direction: DebugDirection, vars: Variables, data: unknown): void {
    const action = toStringVariable(vars["unikvs:action"]);
    if (action === undefined || !this.actionFilter(action)) {
      return;
    }

    const key = toStringVariable(vars["unikvs:key"]);
    if (key === undefined || !this.keyFilter(key)) {
      return;
    }

    const message =
      direction === "write"
        ? "Data was written: action={action}, key={key}"
        : "Data was read: action={action}, key={key}";

    logger.debug(message, () => {
      const info = this.getDebugInfo({ vars, action, key, direction, data });
      return { ...info, action, key, direction };
    });
  }
}

/**
 * 変数の値を文字列ならその値、それ以外なら `undefined` として取り出します。
 *
 * @param value 変数の値です。
 * @returns 文字列ならその値、それ以外なら `undefined` です。
 */
function toStringVariable(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
