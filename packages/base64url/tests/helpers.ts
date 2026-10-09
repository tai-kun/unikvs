/**
 * チャンク列を 1 つのバイト配列に連結します。
 * ストリームの分割結果を単体のバイト列と比較するために使用します。
 */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * バイト列を指定したサイズ以下のチャンクへ分割します。
 * base64url を任意の境界で分割してもデコードできることを検証するために使用します。
 */
export function splitIntoChunks(
  bytes: Uint8Array<ArrayBuffer>,
  size: number,
): Uint8Array<ArrayBuffer>[] {
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  for (let offset = 0; offset < bytes.length; offset += size) {
    chunks.push(bytes.subarray(offset, Math.min(offset + size, bytes.length)));
  }

  return chunks;
}

/**
 * 指定したチャンク列を順に流して閉じる ReadableStream を作成します。
 * 任意の分割でストリームにデータを流し込むために使用します。
 */
export function sourceFrom(
  chunks: readonly Uint8Array<ArrayBuffer>[],
): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });
}

/**
 * ストリームを最後まで読み取り、出力チャンクを返します。
 */
export async function readAll(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>[]> {
  const reader = stream.getReader();
  const outputChunks: Uint8Array<ArrayBuffer>[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    outputChunks.push(value);
  }

  return outputChunks;
}

/**
 * 変換ストリームへチャンク列を書き込みながら並行して読み取ります。
 * バックプレッシャーによるデッドロックを避けつつ、書き込み・読み取り時のエラーを握り潰さずに観測するために使用します。
 */
export async function pumpThrough(
  transform: TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  outputChunks: Uint8Array<ArrayBuffer>[];
  writeError: unknown;
  readError: unknown;
}> {
  const outputChunks: Uint8Array<ArrayBuffer>[] = [];
  let writeError: unknown;
  let readError: unknown;
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();

  const pumping = (async () => {
    try {
      for (const chunk of chunks) {
        await writer.write(chunk);
      }

      await writer.close();
    } catch (error) {
      writeError = error;
    }
  })();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outputChunks.push(value);
    }
  } catch (error) {
    readError = error;
  }

  await pumping;

  return { outputChunks, writeError, readError };
}
