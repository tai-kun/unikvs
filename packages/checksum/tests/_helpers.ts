/**
 * バイト列を小文字の 16 進文字列に変換します。
 * 実装側の変換を経由せずに期待値を組み立てるために使用します。
 */
export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * 複数のチャンクを 1 つのバイト列に連結します。
 * ストリームを通過したデータを一括処理したデータと比較するために使用します。
 */
export function concatChunks(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * バイト列を指定した長さで順に切り出します。
 * 任意の境界で分割されたチャンク列を作るために使用します。
 */
export function splitBySizes(
  data: Uint8Array<ArrayBuffer>,
  sizes: readonly number[],
): Uint8Array<ArrayBuffer>[] {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const size of sizes) {
    if (offset >= data.length) {
      break;
    }
    const end = Math.min(offset + size, data.length);
    chunks.push(data.subarray(offset, end));
    offset = end;
  }
  if (offset < data.length) {
    chunks.push(data.subarray(offset));
  }
  return chunks;
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

  const pumping = (async () => {
    try {
      for (const chunk of inputChunks) {
        await writer.write(chunk);
      }
      await writer.close();
    } catch (error) {
      closeError = error;
    }
  })();

  while (true) {
    try {
      const { done, value } = await reader.read();
      if (done) break;
      outputChunks.push(value);
    } catch (error) {
      closeError ??= error;
      break;
    }
  }

  await pumping;

  return { outputChunks, closeError };
}
