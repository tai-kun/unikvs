import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import {
  ErrorBase,
  InvalidPartSizeError,
  InvalidUsageErrorBase,
  KeyNotFoundError,
  ReadonlyVariableError,
  RepairNotAllowedError,
  StorageAbortedError,
  UnsupportedRuntimeError,
} from "../src/errors.js";

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

describe("RepairNotAllowedError", () => {
  test("ErrorBase を継承し name は UniKvsRepairNotAllowedError である", ({ expect }) => {
    // 実行
    const error = new RepairNotAllowedError({ names: ["Memory"] });

    // 検証
    expect(error).toBeInstanceOf(ErrorBase);
    expect(error.name).toBe("UniKvsRepairNotAllowedError");
  });

  test("meta にストレージ名一覧を保持する", ({ expect }) => {
    // 実行
    const error = new RepairNotAllowedError({ names: ["Memory"] });

    // 検証
    expect(error.meta).toStrictEqual({ names: ["Memory"] });
  });

  test("既定のメッセージはストレージ名を含む", ({ expect }) => {
    // 実行と検証
    expect(new RepairNotAllowedError({ names: ["Memory"] }).message).toBe(
      'Repair writes via "Memory" are not allowed',
    );
  });

  test("複数名のときは列挙したメッセージになる", ({ expect }) => {
    // 実行と検証
    expect(new RepairNotAllowedError({ names: ["a", "b"] }).message).toBe(
      'Repair writes via "a, b" are not allowed',
    );
  });

  test("空配列のときは不明名で組み立てる", ({ expect }) => {
    // 実行と検証
    expect(new RepairNotAllowedError({ names: [] }).message).toBe(
      'Repair writes via "(unknown)" are not allowed',
    );
  });

  test("日本語では書き戻し拒否のメッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new RepairNotAllowedError({ names: ["Memory"] }).message).toBe(
      '"Memory" への書き戻しは許可されていません',
    );
  });
});

describe("KeyNotFoundError", () => {
  test("ErrorBase を継承し name は UniKvsKeyNotFoundError である", ({ expect }) => {
    const error = new KeyNotFoundError({ key: "k1" });

    expect(error).toBeInstanceOf(ErrorBase);
    expect(error.name).toBe("UniKvsKeyNotFoundError");
  });

  test("meta にキーを保持する", ({ expect }) => {
    expect(new KeyNotFoundError({ key: "k1" }).meta).toStrictEqual({ key: "k1" });
  });

  test("既定のメッセージはキーを含む", ({ expect }) => {
    expect(new KeyNotFoundError({ key: "k1" }).message).toBe("Key not found: k1");
  });

  test("日本語ではキーを含むメッセージを返す", ({ expect, setLang }) => {
    setLang("ja");

    expect(new KeyNotFoundError({ key: "k1" }).message).toBe("キー k1 が見つかりません");
  });
});

describe("UnsupportedRuntimeError", () => {
  test("InvalidUsageErrorBase を継承し name は UniKvsUnsupportedRuntimeError である", ({
    expect,
  }) => {
    const error = new UnsupportedRuntimeError({ name: "Redis", runtime: "Bun" });

    expect(error).toBeInstanceOf(InvalidUsageErrorBase);
    expect(error.name).toBe("UniKvsUnsupportedRuntimeError");
  });

  test("meta に名前とランタイムを保持する", ({ expect }) => {
    expect(new UnsupportedRuntimeError({ name: "Redis", runtime: "Bun" }).meta).toStrictEqual({
      name: "Redis",
      runtime: "Bun",
    });
  });

  test("既定のメッセージは名前とランタイムを含む", ({ expect }) => {
    expect(new UnsupportedRuntimeError({ name: "Redis", runtime: "Bun" }).message).toBe(
      "Redis can only be used in the Bun runtime",
    );
  });

  test("日本語ではランタイム制約のメッセージを返す", ({ expect, setLang }) => {
    setLang("ja");

    expect(new UnsupportedRuntimeError({ name: "Redis", runtime: "Bun" }).message).toBe(
      "Redis は Bun ランタイムでのみ使用できます",
    );
  });
});

describe("InvalidPartSizeError", () => {
  test("ErrorBase を継承し name は UniKvsInvalidPartSizeError である", ({ expect }) => {
    const error = new InvalidPartSizeError({ actual: 0 });

    expect(error).toBeInstanceOf(ErrorBase);
    expect(error.name).toBe("UniKvsInvalidPartSizeError");
  });

  test("meta に実際の値を保持する", ({ expect }) => {
    expect(new InvalidPartSizeError({ actual: 0 }).meta).toStrictEqual({ actual: 0 });
  });

  test("既定のメッセージは実際の値を含む", ({ expect }) => {
    expect(new InvalidPartSizeError({ actual: 0 }).message).toContain("Invalid part size 0");
  });

  test("日本語ではパートサイズ不正のメッセージを返す", ({ expect, setLang }) => {
    setLang("ja");

    expect(new InvalidPartSizeError({ actual: 0 }).message).toContain("無効なパートサイズ 0");
  });
});

describe("ReadonlyVariableError", () => {
  test("InvalidUsageErrorBase を継承し name は UniKvsReadonlyVariableError である", ({
    expect,
  }) => {
    const error = new ReadonlyVariableError({ key: "x" });

    expect(error).toBeInstanceOf(InvalidUsageErrorBase);
    expect(error.name).toBe("UniKvsReadonlyVariableError");
  });

  test("meta にキーを保持する", ({ expect }) => {
    expect(new ReadonlyVariableError({ key: "x" }).meta).toStrictEqual({ key: "x" });
  });

  test("既定のメッセージはキーを含む", ({ expect }) => {
    expect(new ReadonlyVariableError({ key: "x" }).message).toContain('"x"');
  });

  test("日本語では読み取り専用のメッセージを返す", ({ expect, setLang }) => {
    setLang("ja");

    expect(new ReadonlyVariableError({ key: "x" }).message).toContain('"x"');
  });
});

describe("StorageAbortedError", () => {
  test("ErrorBase を継承し name は UniKvsStorageAbortedError である", ({ expect }) => {
    const error = new StorageAbortedError({ key: "k1" });

    expect(error).toBeInstanceOf(ErrorBase);
    expect(error.name).toBe("UniKvsStorageAbortedError");
  });

  test("meta にキーを保持する", ({ expect }) => {
    expect(new StorageAbortedError({ key: "k1" }).meta).toStrictEqual({ key: "k1" });
  });

  test("既定のメッセージはキーを含む", ({ expect }) => {
    expect(new StorageAbortedError({ key: "k1" }).message).toContain('"k1"');
  });

  test("日本語では中断のメッセージを返す", ({ expect, setLang }) => {
    setLang("ja");

    expect(new StorageAbortedError({ key: "k1" }).message).toContain('"k1"');
  });
});
