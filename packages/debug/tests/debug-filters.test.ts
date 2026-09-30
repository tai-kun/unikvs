import { describe } from "vitest";

import Debug, { type DebugInfoArgs } from "../src/debug.js";
import { createRecordsTest } from "./_helpers.js";

const test = createRecordsTest();

const NON_STRING_ACTIONS: readonly { readonly name: string; readonly value: unknown }[] = [
  { name: "数値", value: 42 },
  { name: "真偽値", value: true },
  { name: "null", value: null },
  { name: "undefined", value: undefined },
  { name: "シンボル", value: Symbol("set") },
  { name: "配列", value: ["set"] },
  { name: "String オブジェクト", value: new String("set") },
  { name: "toString を持つオブジェクト", value: { toString: () => "set" } },
];

const NON_STRING_KEYS: readonly { readonly name: string; readonly value: unknown }[] = [
  { name: "数値", value: 42 },
  { name: "真偽値", value: true },
  { name: "null", value: null },
  { name: "undefined", value: undefined },
  { name: "配列", value: ["k"] },
  { name: "String オブジェクト", value: new String("k") },
];

describe("フィルターの呼び出し", () => {
  test("keyFilter と actionFilter は解決済みの文字列で呼ばれる", ({ expect }) => {
    // 準備
    const actionArgs: string[] = [];
    const keyArgs: string[] = [];
    const debug = new Debug({
      actionFilter: (action) => {
        actionArgs.push(action);
        return true;
      },
      keyFilter: (key) => {
        keyArgs.push(key);
        return true;
      },
    });

    // 実行
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "greeting" }, data: "hello" });

    // 検証
    expect(actionArgs).toStrictEqual(["set"]);
    expect(keyArgs).toStrictEqual(["greeting"]);
  });

  test.for(NON_STRING_ACTIONS)(
    "操作が$nameの場合は記録せずフィルターも呼ばない",
    ({ value }, { expect, records }) => {
      // 準備
      const actionArgs: unknown[] = [];
      const keyArgs: unknown[] = [];
      const infoArgs: DebugInfoArgs[] = [];
      const debug = new Debug({
        actionFilter: (action) => {
          actionArgs.push(action);
          return true;
        },
        keyFilter: (key) => {
          keyArgs.push(key);
          return true;
        },
        getDebugInfo: (args) => {
          infoArgs.push(args);
          return {};
        },
      });

      // 実行
      debug.encode({ vars: { "unikvs:action": value, "unikvs:key": "k" }, data: "d" });

      // 検証
      expect(records).toHaveLength(0);
      expect(actionArgs).toStrictEqual([]);
      expect(keyArgs).toStrictEqual([]);
      expect(infoArgs).toStrictEqual([]);
    },
  );

  test.for(NON_STRING_KEYS)(
    "キーが$nameの場合は記録せず keyFilter も呼ばない",
    ({ value }, { expect, records }) => {
      // 準備
      const actionArgs: unknown[] = [];
      const keyArgs: unknown[] = [];
      const debug = new Debug({
        actionFilter: (action) => {
          actionArgs.push(action);
          return true;
        },
        keyFilter: (key) => {
          keyArgs.push(key);
          return true;
        },
      });

      // 実行
      debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": value }, data: "d" });

      // 検証
      expect(records).toHaveLength(0);
      expect(actionArgs).toStrictEqual(["set"]);
      expect(keyArgs).toStrictEqual([]);
    },
  );

  test("actionFilter が拒否した場合は keyFilter を呼ばない", ({ expect, records }) => {
    // 準備
    const keyArgs: unknown[] = [];
    const debug = new Debug({
      actionFilter: () => false,
      keyFilter: (key) => {
        keyArgs.push(key);
        return true;
      },
    });

    // 実行
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "k" }, data: "d" });

    // 検証
    expect(records).toHaveLength(0);
    expect(keyArgs).toStrictEqual([]);
  });

  test.for([
    { name: "actionFilter", options: { actionFilter: () => false } },
    { name: "keyFilter", options: { keyFilter: () => false } },
  ] as const)(
    "$name が拒否した場合は getDebugInfo を呼ばない",
    ({ options }, { expect, records }) => {
      // 準備
      const infoArgs: DebugInfoArgs[] = [];
      const debug = new Debug({
        ...options,
        getDebugInfo: (args) => {
          infoArgs.push(args);
          return {};
        },
      });

      // 実行
      debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "k" }, data: "d" });

      // 検証
      expect(records).toHaveLength(0);
      expect(infoArgs).toStrictEqual([]);
    },
  );

  test("空文字の操作とキーも文字列として記録する", ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    debug.encode({ vars: { "unikvs:action": "", "unikvs:key": "" }, data: "d" });

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties).toMatchObject({ action: "", key: "", direction: "write" });
  });
});

describe("既定のフィルターとコールバック", () => {
  test("オプション省略時は任意のキーと操作を受け入れる", ({ expect }) => {
    // 準備
    const debug = new Debug();

    // 実行と検証
    expect(debug.keyFilter("any key")).toBe(true);
    expect(debug.actionFilter("any action")).toBe(true);
    expect(debug.getDebugInfo).toBe(Debug.getDefaultDebugInfo);
  });

  test("複数のインスタンスは互いに独立している", ({ expect, records }) => {
    // 準備
    const first = new Debug({
      keyFilter: (key) => key === "first",
      getDebugInfo: () => ({ instance: "first" }),
    });
    const second = new Debug({
      keyFilter: (key) => key === "second",
      getDebugInfo: () => ({ instance: "second" }),
    });

    // 実行
    first.encode({ vars: { "unikvs:action": "set", "unikvs:key": "second" }, data: "a" });
    second.encode({ vars: { "unikvs:action": "set", "unikvs:key": "first" }, data: "b" });
    first.encode({ vars: { "unikvs:action": "set", "unikvs:key": "first" }, data: "c" });
    second.encode({ vars: { "unikvs:action": "set", "unikvs:key": "second" }, data: "d" });

    // 検証
    expect(records).toHaveLength(2);
    expect(records[0]!.properties).toMatchObject({ key: "first", instance: "first" });
    expect(records[1]!.properties).toMatchObject({ key: "second", instance: "second" });
  });
});
