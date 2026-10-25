import type { ITransformStream } from "@unikvs/core";
import { NinjaPromise } from "ninja-promise";

/**
 * 入出力変換を挟んだストリームです。
 */
export interface IProxiedTransformStream<TInput = any, TOutput = any> extends ITransformStream<
  TInput,
  TOutput
> {
  /**
   * 入力からソースへの接続が終わると解決します。
   */
  closePromise: NinjaPromise<void>;
}

/**
 * ソースの前後に入出力変換を挟んだ新しいストリームを作ります。
 *
 * 書き込まれた値は `proxyInput` で変換してソースへ送り、ソースの出力は `proxyOutput` で変換して読み取ります。`proxyInput` と `proxyOutput` には変換コールバックまたは `Transformer` オブジェクトを指定できます。返される `closePromise` は入力からソースへの接続が終わると解決し、途中の失敗は読み取りと `closePromise` へ伝わります。
 *
 * @param source 変換対象のソースストリームです。
 * @param proxyInput 入力値をソースの入力へ変換する処理です。
 * @param proxyOutput ソースの出力を出力値へ変換する処理です。
 *
 * @returns 入力と出力が変換されたストリームと終了を表す `closePromise` です。
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
