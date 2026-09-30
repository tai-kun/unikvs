import { configureSync, type LogRecord } from "@logtape/logtape";
import { test as vitest } from "vitest";

/**
 * Debug トランスフォーマーのログを集めるテスト用の sink を設定し、
 * テストごとに記録を空にする `records` フィクスチャーを持つ `test` を返します。
 * 実際に記録されたレコードの内容を検証するために使用します。
 */
export function createRecordsTest() {
  const records: LogRecord[] = [];

  configureSync({
    sinks: {
      test: (record) => {
        records.push(record);
      },
    },
    loggers: [
      {
        category: ["unikvs", "@unikvs/debug"],
        sinks: ["test"],
        lowestLevel: "debug",
      },
    ],
    reset: true,
  });

  return vitest.extend<{ records: LogRecord[] }>({
    // oxlint-disable-next-line no-empty-pattern
    async records({}, use) {
      records.length = 0;
      await use(records);
    },
  });
}

/**
 * 変換ストリームにチャンクを順に流し込み、出力されたチャンクを返します。
 * ストリームが入力をそのまま透過することを検証するために使用します。
 */
export async function pipeChunks<T>(
  stream: TransformStream<T, T>,
  chunks: readonly T[],
): Promise<T[]> {
  const readable = new ReadableStream<T>({
    start: (controller) => {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  const reader = readable.pipeThrough(stream).getReader();
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
