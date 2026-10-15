export interface IReadableStream<TChunk = any> extends ReadableStream<TChunk> {}

export interface IWritableStream<TChunk = any> extends WritableStream<TChunk> {}

export interface ITransformStream<TIn = any, TOut = any> {
  readonly readable: IReadableStream<TOut>;

  readonly writable: IWritableStream<TIn>;
}
