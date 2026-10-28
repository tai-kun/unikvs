import type { ITransformStream } from "@unikvs/core";
import { NinjaPromise } from "ninja-promise";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#iproxied-transform-stream)
 */
export interface IProxiedTransformStream<TInput = any, TOutput = any> extends ITransformStream<
  TInput,
  TOutput
> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#iproxied-transform-stream-closepromise)
   */
  closePromise: NinjaPromise<void>;
}

/**
 * 変換関数または変換オブジェクトを Transformer へ正規化します。
 *
 * @param transformer 変換関数または変換オブジェクトです。
 *
 * @returns 正規化された Transformer です。
 */
function toTransformer<TInput, TOutput>(
  transformer: Transformer<TInput, TOutput> | TransformerTransformCallback<TInput, TOutput>,
): Transformer<TInput, TOutput> {
  return typeof transformer === "function" ? { transform: transformer } : transformer;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#proxy-transform-stream)
 */
export default function proxyTransformStream<TSourceInput, TSourceOutput, TInput, TOutput>(
  source: ITransformStream<TSourceInput, TSourceOutput>,
  proxyInput:
    | Transformer<TInput, TSourceInput>
    | TransformerTransformCallback<TInput, TSourceInput>,
  proxyOutput:
    | Transformer<TSourceOutput, TOutput>
    | TransformerTransformCallback<TSourceOutput, TOutput>,
): IProxiedTransformStream<TInput, TOutput> {
  const inputTransformer = toTransformer(proxyInput);
  const outputTransformer = toTransformer(proxyOutput);

  const inputTransform = new TransformStream<TInput, TSourceInput>(inputTransformer);
  const outputTransform = new TransformStream<TSourceOutput, TOutput>(outputTransformer);

  const readable = source.readable.pipeThrough(outputTransform);
  const writable = inputTransform.writable;

  // 新しいストリームとソースを接続します。
  // NinjaPromise で Unhandle Rejection を防止します。
  const closePromise = NinjaPromise.try(async () => {
    await inputTransform.readable.pipeTo(source.writable);
  });

  return {
    readable,
    writable,
    closePromise,
  };
}
