import { describe } from "vitest";

import Debug from "../src/debug.js";
import { createRecordsTest } from "./_helpers.js";

const test = createRecordsTest();

describe("ログのメタデータ", () => {
  test("encode は書き込みとしてロガーとレベルとメッセージを記録する", ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "greeting" }, data: "hello" });

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.category).toStrictEqual(["unikvs", "@unikvs/debug"]);
    expect(records[0]!.level).toBe("debug");
    expect(records[0]!.properties["direction"]).toBe("write");
    expect(records[0]!.message).toStrictEqual([
      "Data was written: action=",
      "set",
      ", key=",
      "greeting",
      "",
    ]);
  });

  test("decode は読み込みとしてロガーとレベルとメッセージを記録する", ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    debug.decode({ vars: { "unikvs:action": "get", "unikvs:key": "greeting" }, data: "hello" });

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.category).toStrictEqual(["unikvs", "@unikvs/debug"]);
    expect(records[0]!.level).toBe("debug");
    expect(records[0]!.properties["direction"]).toBe("read");
    expect(records[0]!.message).toStrictEqual([
      "Data was read: action=",
      "get",
      ", key=",
      "greeting",
      "",
    ]);
  });
});
