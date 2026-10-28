import { describe } from "vite-plus/test";

import Debug from "../src/debug.js";
import { decode, encode, createRecordsTest } from "./_helpers.js";

const test = createRecordsTest();
describe("ログのメタデータ", () => {
  test("encode は書き込みとしてロガーとレベルとメッセージを記録する", async ({
    expect,
    records,
  }) => {
    // 準備：
    const debug = new Debug();

    // 実行：
    await encode(debug, "hello", "greeting");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.category).toStrictEqual(["@unikvs/*", "@unikvs/debug"]);
    expect(records.at(0)?.level).toBe("debug");
    expect(records.at(0)?.properties["direction"]).toBe("write");
    expect(records.at(0)?.message).toStrictEqual([
      "Data was written: action=",
      "set",
      ", key=",
      "greeting",
      "",
    ]);
  });

  test("decode は読み込みとしてロガーとレベルとメッセージを記録する", async ({
    expect,
    records,
  }) => {
    // 準備：
    const debug = new Debug();

    // 実行：
    await decode(debug, "hello", "greeting");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.category).toStrictEqual(["@unikvs/*", "@unikvs/debug"]);
    expect(records.at(0)?.level).toBe("debug");
    expect(records.at(0)?.properties["direction"]).toBe("read");
    expect(records.at(0)?.message).toStrictEqual([
      "Data was read: action=",
      "get",
      ", key=",
      "greeting",
      "",
    ]);
  });
});
