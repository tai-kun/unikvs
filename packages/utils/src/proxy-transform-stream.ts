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
  let inputTransformer:
    | Transformer<TInput, TSourceInput>
    | TransformerTransformCallback<TInput, TSourceInput> = proxyInput;

  if (typeof inputTransformer === "function") {
    const transform = inputTransformer;
    inputTransformer = { transform };
  }

  let outputTransformer:
    | Transformer<TSourceOutput, TOutput>
    | TransformerTransformCallback<TSourceOutput, TOutput> = proxyOutput;

  if (typeof outputTransformer === "function") {
    const transform = outputTransformer;
    outputTransformer = { transform };
  }

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
