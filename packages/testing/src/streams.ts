import { concatBytes } from "./bytes.js";

/**
 * 指定したチャンク列を順に流して閉じる ReadableStream を作成します。
 * 任意の分割でストリームにデータを流し込むために使用します。
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
 * 指定した値の列を順に流して閉じる ReadableStream を作成します。
 * 任意の値の並びをストリームへ流し込むために使用します。
 */
export const sourceFromValues = sourceFrom;

/**
 * ストリームを最後まで読み取り、出力チャンクを返します。
 * ストリームの出力順序や内容を検証するために使用します。
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
 * ストリームを最後まで読み取り、全チャンクを連結したバイト列を返します。
 * ストリーム経由の読み取りと通常の read の一致を検証するために使用します。
 */
export async function collectBytes(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  return concatBytes(await readAll(stream));
}

/**
 * 指定したチャンク列を上流から TransformStream へ流し、出力されたチャンクを順に返します。
 * チャンクの参照・順序・境界が保存されることの検証に使用します。
 */
export async function collectChunks<T>(
  stream: TransformStream<T, T>,
  chunks: readonly T[],
): Promise<T[]> {
  return readAll(sourceFrom(chunks).pipeThrough(stream));
}

/**
 * 変換ストリームにチャンクを順に流し込み、出力されたチャンクを返します。
 * ストリームが入力をそのまま透過することを検証するために使用します。
 */
export const pipeChunks = collectChunks;

/**
 * 変換ストリームへチャンク列を書き込みながら並行して読み取ります。
 * バックプレッシャーによるデッドロックを避けつつ、書き込み・読み取り時のエラーを握り潰さずに観測するために使用します。
 */
export async function pumpThrough<TInput, TOutput>(
  transform: TransformStream<TInput, TOutput>,
  chunks: readonly TInput[],
): Promise<{
  outputChunks: TOutput[];
  writeError: unknown;
  readError: unknown;
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

  return { outputChunks, writeError, readError };
}

/**
 * 変換ストリームにチャンクを順に書き込み、読み取れるデータをすべて読み取ります。
 * バックプレッシャーによるデッドロックを避けるため、書き込みと読み取りを並行して行います。
 * 書き込み・読み取り・クローズのどこで発生した失敗も closeError として返します。
 */
export async function runTransform(
  stream: TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
  inputChunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{ outputChunks: Uint8Array<ArrayBuffer>[]; closeError: unknown }> {
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

  return { outputChunks, closeError };
}
