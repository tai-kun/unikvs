import { concatBytes } from "./bytes.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#source-from)
 */
export function sourceFrom<T>(chunks: readonly T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#source-from-values)
 */
export const sourceFromValues: typeof sourceFrom = sourceFrom;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#read-all)
 */
export async function readAll<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const output: T[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    output.push(value);
  }

  return output;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#collect-bytes)
 */
export async function collectBytes(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  return concatBytes(await readAll(stream));
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#collect-chunks)
 */
export async function collectChunks<T>(
  stream: TransformStream<T, T>,
  chunks: readonly T[],
): Promise<T[]> {
  return readAll(sourceFrom(chunks).pipeThrough(stream));
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#pipe-chunks)
 */
export const pipeChunks: typeof collectChunks = collectChunks;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#pump-through)
 */
export async function pumpThrough<TInput, TOutput>(
  transform: TransformStream<TInput, TOutput>,
  chunks: readonly TInput[],
): Promise<{
  /**
   * 読み取り時に発生したエラーです。
   *
   * 失敗がなければ `undefined` です。
   */
  readError: unknown;

  /**
   * 書き込み時に発生したエラーです。
   *
   * 失敗がなければ `undefined` です。
   */
  writeError: unknown;

  /**
   * 読み取った出力チャンクの配列です。
   */
  outputChunks: TOutput[];
}> {
  const outputChunks: TOutput[] = [];
  let writeError: unknown;
  let readError: unknown;
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();

  const pumping = (async (): Promise<void> => {
    try {
      for (const chunk of chunks) {
        await writer.write(chunk);
      }

      await writer.close();
    } catch (ex) {
      writeError = ex;
    }
  })();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      outputChunks.push(value);
    }
  } catch (ex) {
    readError = ex;
  }

  await pumping;

  return {
    readError,
    writeError,
    outputChunks,
  };
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#run-transform)
 */
export async function runTransform(
  stream: TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
  inputChunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  /**
   * 発生した失敗内容です。
   *
   * 失敗がなければ `undefined` です。
   */
  closeError: unknown;

  /**
   * 読み取った出力チャンクの配列です。
   */
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const outputChunks: Uint8Array<ArrayBuffer>[] = [];
  let closeError: unknown;
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();

  const pumping = (async (): Promise<void> => {
    try {
      for (const chunk of inputChunks) {
        await writer.write(chunk);
      }

      await writer.close();
    } catch (ex) {
      closeError = ex;
    }
  })();

  while (true) {
    try {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      outputChunks.push(value);
    } catch (ex) {
      closeError ??= ex;
      break;
    }
  }

  await pumping;

  return {
    closeError,
    outputChunks,
  };
}
