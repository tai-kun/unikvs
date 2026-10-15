import type { IMiddleware } from "@unikvs/core";
import { createEncodeContext, createNext } from "@unikvs/testing";
import { describe } from "vitest";

import Debug, { type DebugInfoArgs } from "../src/debug.js";
import { createRecordsTest } from "./_helpers.js";

const test = createRecordsTest();

/**
 * データを書き込みとして記録します。
 */
async function encode(debug: Debug, data: unknown, key: string): Promise<void> {
  const c = createEncodeContext(data, key);
  await debug.encode(c as IMiddleware.EncodeContext, createNext());
}

describe("フィルターの呼び出し", () => {
  test("keyFilter と actionFilter は解決済みの文字列で呼ばれる", async ({ expect }) => {
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
    await encode(debug, "hello", "greeting");

    // 検証
    expect(actionArgs).toStrictEqual(["set"]);
    expect(keyArgs).toStrictEqual(["greeting"]);
  });

  test("actionFilter が拒否した場合は keyFilter を呼ばない", async ({ expect, records }) => {
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
    await encode(debug, "d", "k");

    // 検証
    expect(records).toHaveLength(0);
    expect(keyArgs).toStrictEqual([]);
  });

  test.for([
    { name: "actionFilter", options: { actionFilter: () => false } },
    { name: "keyFilter", options: { keyFilter: () => false } },
  ] as const)(
    "$name が拒否した場合は getDebugInfo を呼ばない",
    async ({ options }, { expect, records }) => {
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
      await encode(debug, "d", "k");

      // 検証
      expect(records).toHaveLength(0);
      expect(infoArgs).toStrictEqual([]);
    },
  );

  test("空文字のキーも文字列として記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    await encode(debug, "d", "");

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties).toMatchObject({ action: "set", key: "", direction: "write" });
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

  test("複数のインスタンスは互いに独立している", async ({ expect, records }) => {
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
    await encode(first, "a", "second");
    await encode(second, "b", "first");
    await encode(first, "c", "first");
    await encode(second, "d", "second");

    // 検証
    expect(records).toHaveLength(2);
    expect(records[0]!.properties).toMatchObject({ key: "first", instance: "first" });
    expect(records[1]!.properties).toMatchObject({ key: "second", instance: "second" });
  });
});
