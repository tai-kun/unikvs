import { RepairNotAllowedError } from "@unikvs/core";
import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import AllowRepair from "../src/allow-repair.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 *
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 */
const test = vitest.extend<{
  setLang: (lang: string) => void;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});

describe("初期化と基本属性", () => {
  test("name は AllowRepair を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行と検証
    expect(gate.name).toBe("AllowRepair");
  });

  test("isOpen は常に true を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行と検証
    expect(gate.isOpen).toBe(true);
  });

  test("初期状態では enabled が true である", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行と検証
    expect(gate.enabled).toBe(true);
  });
});

describe("許可状態の切替え", () => {
  test("disable で enabled が false になる", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行
    gate.disable();

    // 検証
    expect(gate.enabled).toBe(false);
  });

  test("disable 後に enable で true に戻る", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    gate.enable();

    // 検証
    expect(gate.enabled).toBe(true);
  });

  test("toggle は状態を反転し反転後の値を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行と検証
    expect(gate.toggle()).toBe(false);
    expect(gate.enabled).toBe(false);
    expect(gate.toggle()).toBe(true);
    expect(gate.enabled).toBe(true);
  });

  test("toggle を2回呼ぶと元の状態に戻る", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行
    gate.toggle();
    gate.toggle();

    // 検証
    expect(gate.enabled).toBe(true);
  });
});

describe("encode の透過と拒否", () => {
  test("非修復 vars では同一参照を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const data = "hello";

    // 実行と検証
    expect(gate.encode({ vars: {}, data })).toBe(data);
    expect(gate.encode({ vars: { "unikvs:repair": false }, data })).toBe(data);
    expect(gate.encode({ vars: { "unikvs:repair": 1 }, data })).toBe(data);
    expect(gate.encode({ vars: { "unikvs:repair": "true" }, data })).toBe(data);
  });

  test("disable 中でも非修復 vars では同一参照を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();
    const data = { foo: "bar" };

    // 実行と検証
    expect(gate.encode({ vars: {}, data })).toBe(data);
    expect(gate.encode({ vars: { "unikvs:repair": false }, data })).toBe(data);
    expect(gate.encode({ vars: { "unikvs:repair": 1 }, data })).toBe(data);
  });

  test("修復 vars でも既定状態では同一参照を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const data = new Uint8Array([1, 2, 3]);

    // 実行と検証
    expect(gate.encode({ vars: { "unikvs:repair": true }, data })).toBe(data);
  });

  test("disable 後に修復 vars で RepairNotAllowedError を投げる", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行と検証
    expect(() => gate.encode({ vars: { "unikvs:repair": true }, data: "x" })).toThrow(
      RepairNotAllowedError,
    );
  });

  test("enable 後に修復 vars で再び同一参照を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();
    gate.enable();
    const data = "hello";

    // 実行と検証
    expect(gate.encode({ vars: { "unikvs:repair": true }, data })).toBe(data);
  });

  test("文字列とバイト列とオブジェクトを同一参照で返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const text = "hello";
    const bytes = new Uint8Array([1, 2, 3]);
    const object = { foo: "bar" };

    // 実行と検証
    expect(gate.encode({ vars: {}, data: text })).toBe(text);
    expect(gate.encode({ vars: {}, data: bytes })).toBe(bytes);
    expect(gate.encode({ vars: {}, data: object })).toBe(object);
  });
});

describe("decode の透過", () => {
  test("通常の vars では同一参照を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const data = "hello";

    // 実行と検証
    expect(gate.decode({ data })).toBe(data);
  });

  test("disable 中でも修復 vars 付きで投げずに同一参照を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();
    const data = new Uint8Array([1, 2, 3]);

    // 実行と検証
    expect(gate.decode({ data })).toBe(data);
  });
});

describe("エラーの同一性", () => {
  test("拒否時は core の RepairNotAllowedError を投げる", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (() => {
      try {
        gate.encode({ vars: { "unikvs:repair": true }, data: "x" });
      } catch (ex) {
        return ex;
      }
      return null;
    })();

    // 検証
    expect(error).toBeInstanceOf(RepairNotAllowedError);
  });

  test("meta.names は AllowRepair である", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (() => {
      try {
        gate.encode({ vars: { "unikvs:repair": true }, data: "x" });
      } catch (ex) {
        return ex as RepairNotAllowedError;
      }
      throw new Error("unreachable");
    })();

    // 検証
    expect(error.meta).toStrictEqual({ names: ["AllowRepair"] });
  });

  test("name は UniKvsRepairNotAllowedError である", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (() => {
      try {
        gate.encode({ vars: { "unikvs:repair": true }, data: "x" });
      } catch (ex) {
        return ex as RepairNotAllowedError;
      }
      throw new Error("unreachable");
    })();

    // 検証
    expect(error.name).toBe("UniKvsRepairNotAllowedError");
  });

  test("既定のメッセージは中立文言である", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (() => {
      try {
        gate.encode({ vars: { "unikvs:repair": true }, data: "x" });
      } catch (ex) {
        return ex as RepairNotAllowedError;
      }
      throw new Error("unreachable");
    })();

    // 検証
    expect(error.message).toBe('Repair writes via "AllowRepair" are not allowed');
  });

  test("日本語では中立文言のメッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (() => {
      try {
        gate.encode({ vars: { "unikvs:repair": true }, data: "x" });
      } catch (ex) {
        return ex as RepairNotAllowedError;
      }
      throw new Error("unreachable");
    })();

    // 検証
    expect(error.message).toBe('"AllowRepair" への書き戻しは許可されていません');
  });
});
