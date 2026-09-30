/**
 * 指定したチャンク列を上流から TransformStream へ流し、出力されたチャンクを順に返します。
 * チャンクの参照・順序・境界が保存されることの検証に使用します。
 */
export async function collectChunks<T>(
  stream: TransformStream<T, T>,
  chunks: readonly T[],
): Promise<T[]> {
  const source = new ReadableStream<T>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });
  const reader = source.pipeThrough(stream).getReader();
  const output: T[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    output.push(value);
  }

  return output;
}
