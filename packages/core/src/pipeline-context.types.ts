import type { IReadableStream } from "./stream.types.js";

declare global {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#variables-merging)
   */
  interface UniKvsPipelineContextTypes {}
}

/**
 * 型一覧から該当名がなければ `unknown` へ丸める補助型です。
 *
 * @param T 型一覧から取り出した型です。
 * @param U 型一覧に該当がないときの代替型です。
 *
 * @returns 該当する型か代替型です。
 */
type $NeverOr<T, U> = [T] extends [never] ? U : T;

/**
 * 変数名として扱える文字列を集めた型です。
 *
 * `TTypes` と全体拡張点のキーを合わせ、未知の文字列も許容します。
 *
 * @param TTypes 変数名と値の対応表です。
 *
 * @returns 変数名として使える文字列型です。
 */
type ParamName<TTypes> =
  | Extract<keyof TTypes | keyof UniKvsPipelineContextTypes, string>
  | (string & {});

/**
 * 変数名に対応する値の型を取り出す補助型です。
 *
 * `TTypes` と全体拡張点の両方を探し、見つからなければ `unknown` になります。
 *
 * @param TTypes 変数名と値の対応表です。
 * @param TName 取得する変数の名前です。
 *
 * @returns 変数の値の型です。
 */
type ParamValue<TTypes, TName extends string> = $NeverOr<
  | (TName extends keyof TTypes ? TTypes[TName] : never)
  | (TName extends keyof UniKvsPipelineContextTypes ? UniKvsPipelineContextTypes[TName] : never),
  unknown
>;

/**
 * 実行時変数のスナップショットです。
 *
 * 値は浅くコピーされます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#variables-snapshot)
 */
export type VariablesSnapshot = ReadonlyMap<string, unknown>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ipipelinecontext)
 */
export interface IPipelineContext<TTypes = {}> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ipipelinecontext-get)
   */
  get<const TName extends ParamName<TTypes>>(name: TName): ParamValue<TTypes, TName>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ipipelinecontext-set)
   */
  set<const TName extends ParamName<TTypes>>(name: TName, value: ParamValue<TTypes, TName>): this;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ipipelinecontext-setreadonly)
   */
  setReadonly<const TName extends ParamName<TTypes>>(
    name: TName,
    value: ParamValue<TTypes, TName>,
  ): this;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ipipelinecontext-snapshot)
   */
  snapshot(): VariablesSnapshot;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#imapkeycontext)
 */
export interface IMapKeyContext extends IPipelineContext {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#imapkeycontext-key)
   */
  readonly key: string;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iactioncontext)
 */
export interface IActionContext extends IPipelineContext {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iactioncontext-signal)
   */
  readonly signal: AbortSignal;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iactioncontext-action)
   */
  readonly action: "open" | "close" | "set" | "get" | "stream" | "has" | "delete" | "clear";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ilifecyclecontext)
 */
export interface ILifecycleContext extends IActionContext {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ilifecyclecontext-action)
   */
  readonly action: "open" | "close";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iopencontext)
 */
export interface IOpenContext extends ILifecycleContext {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iopencontext-action)
   */
  readonly action: "open";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iclosecontext)
 */
export interface ICloseContext extends ILifecycleContext {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iclosecontext-action)
   */
  readonly action: "close";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ikeyedactioncontext)
 */
export interface IKeyedActionContext extends IActionContext {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ikeyedactioncontext-action)
   */
  readonly action: "set" | "get" | "stream" | "has" | "delete";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ikeyedactioncontext-key)
   */
  readonly key: string;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#isetcontext)
 */
export interface ISetContext extends IKeyedActionContext {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#isetcontext-action)
   */
  readonly action: "set";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#repair)
 */
interface IRepairable {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#repair)
   */
  readonly repair:
    | {
        /**
         * 書き戻しが無効であることを表します。
         */
        readonly enabled: false;

        /**
         * 空の対象一覧です。
         */
        readonly targets: readonly [];
      }
    | {
        /**
         * 書き戻しが有効であることを表します。
         */
        readonly enabled: true;

        /**
         * 書き戻し先の名前一覧です。
         *
         * 少なくとも 1 件を含みます。
         */
        readonly targets: readonly [string, ...string[]];
      };
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#igetcontext)
 */
export interface IGetContext extends IKeyedActionContext, IRepairable {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#igetcontext-action)
   */
  readonly action: "get";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#istreamcontext)
 */
export interface IStreamContext extends IKeyedActionContext, IRepairable {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#istreamcontext-action)
   */
  readonly action: "stream";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ihascontext)
 */
export interface IHasContext extends IKeyedActionContext {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ihascontext-action)
   */
  readonly action: "has";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ideletecontext)
 */
export interface IDeleteContext extends IKeyedActionContext {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ideletecontext-action)
   */
  readonly action: "delete";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iclearcontext)
 */
export interface IClearContext extends IActionContext {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iclearcontext-action)
   */
  readonly action: "clear";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#itransformcontext)
 */
export interface ITransformContext<
  TSource = any,
  TDestination = TSource,
> extends IKeyedActionContext {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#itransformcontext-action)
   */
  readonly action: "set" | "get" | "stream";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#itransformcontext-source)
   */
  readonly source: TSource;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#itransformcontext-destination)
   */
  destination?: TDestination;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#itransformdatacontext)
 */
export interface ITransformDataContext<
  TSourceData = any,
  TDestinationData = TSourceData,
> extends ITransformContext<TSourceData, TDestinationData> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#itransformdatacontext-action)
   */
  readonly action: "set" | "get";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iencodecontext)
 */
export interface IEncodeContext<
  TRawData = any,
  TEncodedData = TRawData,
> extends ITransformDataContext<TRawData, TEncodedData> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iencodecontext-action)
   */
  readonly action: "set";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#idecodecontext)
 */
export interface IDecodeContext<
  TRawData = any,
  TDecodedData = TRawData,
> extends ITransformDataContext<TRawData, TDecodedData> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#idecodecontext-action)
   */
  readonly action: "get";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#itransformstreamcontext)
 */
export interface ITransformStreamContext<
  TSourceChunk = any,
  TDestinationChunk = TSourceChunk,
> extends ITransformContext<IReadableStream<TSourceChunk>, IReadableStream<TDestinationChunk>> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#itransformstreamcontext-action)
   */
  readonly action: "set" | "stream";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iencodestreamcontext)
 */
export interface IEncodeStreamContext<
  TRawChunk = any,
  TEncodedChunk = TRawChunk,
> extends ITransformStreamContext<TRawChunk, TEncodedChunk> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iencodestreamcontext-action)
   */
  readonly action: "set";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#idecodestreamcontext)
 */
export interface IDecodeStreamContext<
  TRawChunk = any,
  TDecodedChunk = TRawChunk,
> extends ITransformStreamContext<TRawChunk, TDecodedChunk> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#idecodestreamcontext-action)
   */
  readonly action: "stream";
}
