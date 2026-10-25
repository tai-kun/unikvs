import type { IReadableStream } from "./stream.types.js";

declare global {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#variables-merging)
   */
  interface UniKvsPipelineContextTypes {}
}

type $NeverOr<T, U> = [T] extends [never] ? U : T;

type ParamName<TTypes> =
  | Extract<keyof TTypes | keyof UniKvsPipelineContextTypes, string>
  | (string & {});

type ParamValue<TTypes, TName extends string> = $NeverOr<
  | (TName extends keyof TTypes ? TTypes[TName] : never)
  | (TName extends keyof UniKvsPipelineContextTypes ? UniKvsPipelineContextTypes[TName] : never),
  unknown
>;

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
        readonly enabled: false;

        readonly targets: readonly [];
      }
    | {
        readonly enabled: true;

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
