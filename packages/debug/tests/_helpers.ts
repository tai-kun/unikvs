import { type LogRecord, configureSync } from "@logtape/logtape";
import { type TestAPI, test as vitest } from "vite-plus/test";

/**
 * Debug トランスフォーマーのログを集めるテスト用の sink を設定し、テストごとに記録を空にする `records` フィクスチャーを持つ `test` を返します。
 * 実際に記録されたレコードの内容を検証するために使用します。
 */
export function createRecordsTest(): TestAPI<{ records: LogRecord[] }> {
  const records: LogRecord[] = [];
  configureSync({
    reset: true,
    sinks: {
      test: (record) => {
        records.push(record);
      },
    },
    loggers: [
      {
        sinks: ["test"],
        category: ["@unikvs/*", "@unikvs/debug"],
        lowestLevel: "debug",
      },
    ],
  });

  return vitest.extend<{ records: LogRecord[] }>({
    async records({}, use) {
      records.length = 0;
      await use(records);
    },
  });
}
