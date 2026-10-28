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
 * 2 つのパイプラインを並行して実行し、片方が失敗したらもう片方を中断します。
 *
 * 中断したパイプラインの完了は待たず、最初に発生した失敗だけを呼び出し元へ伝えます。
 *
 * @param first 1 つ目のパイプラインを開始する関数です。
 * @param second 2 つ目のパイプラインを開始する関数です。
 */
async function pipeBoth(
  first: (signal: AbortSignal) => Promise<void>,
  second: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const firstController = new AbortController();
  const secondController = new AbortController();
  const pipes: Promise<void>[] = [];

  try {
    pipes.push(first(firstController.signal));
    pipes.push(second(secondController.signal));
    await Promise.all(pipes);
  } catch (error) {
    firstController.abort(error);
    secondController.abort(error);
    // 中断したパイプラインの拒否を回収し、未処理の拒否を残さないようにします。
    // 相手側が背圧で停止していると中断だけでは完了しないため、完了は待ちません。
    void Promise.allSettled(pipes);
    throw error;
  }
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

  const readable = outputTransform.readable;
  const writable = inputTransform.writable;

  // 新しいストリームとソースを双方向に接続します。
  // NinjaPromise で Unhandle Rejection を防止します。
  const closePromise = NinjaPromise.try(() =>
    pipeBoth(
      (signal) => inputTransform.readable.pipeTo(source.writable, { signal }),
      (signal) => source.readable.pipeTo(outputTransform.writable, { signal }),
    ),
  );

  return {
    readable,
    writable,
    closePromise,
  };
}
