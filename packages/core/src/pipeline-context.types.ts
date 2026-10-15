import type { IReadableStream } from "./stream.types.js";

declare global {
  interface UniKvsPipelineContextTypes {}
}

type $NeverOr<T, U> = [T] extends [never] ? U : T;

type ParamName<TTypes> =
  // oxlint-disable-next-line typescript/no-redundant-type-constituents
  Extract<keyof TTypes | keyof UniKvsPipelineContextTypes, string> | (string & {});

type ParamValue<TTypes, TName extends string> = $NeverOr<
  | (TName extends keyof TTypes ? TTypes[TName] : never)
  | (TName extends keyof UniKvsPipelineContextTypes ? UniKvsPipelineContextTypes[TName] : never),
  unknown
>;

export interface IPipelineContext<TTypes = {}> {
  get<const TName extends ParamName<TTypes>>(name: TName): ParamValue<TTypes, TName>;

  set<const TName extends ParamName<TTypes>>(name: TName, value: ParamValue<TTypes, TName>): this;

  setReadonly<const TName extends ParamName<TTypes>>(
    name: TName,
    value: ParamValue<TTypes, TName>,
  ): this;
}

export interface IMapKeyContext extends IPipelineContext {
  readonly key: string;
}

export interface IActionContext extends IPipelineContext {
  readonly signal: AbortSignal;

  readonly action:
    | "open"
    | "close"
    | "set"
    | "get"
    | "repair"
    | "stream"
    | "has"
    | "delete"
    | "clear";
}

export interface ILifecycleContext extends IActionContext {
  readonly action: "open" | "close";
}

export interface IOpenContext extends ILifecycleContext {
  readonly action: "open";
}

export interface ICloseContext extends ILifecycleContext {
  readonly action: "close";
}

export interface IKeyedActionContext extends IActionContext {
  readonly action: "set" | "repair" | "get" | "stream" | "has" | "delete" | "clear";

  readonly key: string;
}

export interface ISetContext extends IKeyedActionContext {
  readonly action: "set";
}

export interface IRepairContext extends IKeyedActionContext {
  readonly action: "repair";

  readonly targets: readonly string[];
}

export interface IGetContext extends IKeyedActionContext {
  readonly action: "get";
}

export interface IStreamContext extends IKeyedActionContext {
  readonly action: "stream";
}

export interface IHasContext extends IKeyedActionContext {
  readonly action: "has";
}

export interface IDeleteContext extends IKeyedActionContext {
  readonly action: "delete";
}

export interface IClearContext extends IKeyedActionContext {
  readonly action: "clear";
}

export interface ITransformContext<
  TSource = any,
  TDestination = TSource,
> extends IKeyedActionContext {
  readonly action: "set" | "get" | "stream";

  readonly source: TSource;

  destination: TDestination;
}

export interface ITransformDataContext<
  TSourceData = any,
  TDestinationData = TSourceData,
> extends ITransformContext<TSourceData, TDestinationData> {
  readonly action: "set" | "get";
}

export interface IEncodeContext<
  TRawData = any,
  TEncodedData = TRawData,
> extends ITransformDataContext<TRawData, TEncodedData> {
  readonly action: "set";
}

export interface IDecodeContext<
  TRawData = any,
  TDecodedData = TRawData,
> extends ITransformDataContext<TRawData, TDecodedData> {
  readonly action: "get";
}

export interface ITransformStreamContext<
  TSourceChunk = any,
  TDestinationChunk = TSourceChunk,
> extends ITransformContext<TSourceChunk, TDestinationChunk> {
  readonly action: "set" | "stream";
}

export interface IEncodeStreamContext<
  TRawChunk = any,
  TEncodedChunk = TRawChunk,
> extends ITransformStreamContext<IReadableStream<TRawChunk>, IReadableStream<TEncodedChunk>> {
  readonly action: "set";
}

export interface IDecodeStreamContext<
  TRawChunk = any,
  TDecodedChunk = TRawChunk,
> extends ITransformStreamContext<IReadableStream<TRawChunk>, IReadableStream<TDecodedChunk>> {
  readonly action: "stream";
}
