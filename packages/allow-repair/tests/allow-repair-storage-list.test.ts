import { RepairNotAllowedError } from "@unikvs/core";
import { describe, test } from "vitest";

import AllowRepair from "../src/allow-repair.js";

describe("storageNames の表示名解決", () => {
  test("単一要素のときはその名を含む", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (() => {
      try {
        gate.encode({
          vars: { "unikvs:repair": true, "unikvs:storageNames": ["cache"] },
          data: "x",
        });
      } catch (ex) {
        return ex as RepairNotAllowedError;
      }
      throw new Error("unreachable");
    })();

    // 検証
    expect(error.meta).toStrictEqual({ names: ["cache"] });
    expect(error.message).toBe('Repair writes via "cache" are not allowed');
  });

  test("複数要素のときは列挙を含む", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (() => {
      try {
        gate.encode({
          vars: { "unikvs:repair": true, "unikvs:storageNames": ["a", "b"] },
          data: "x",
        });
      } catch (ex) {
        return ex as RepairNotAllowedError;
      }
      throw new Error("unreachable");
    })();

    // 検証
    expect(error.meta).toStrictEqual({ names: ["a", "b"] });
    expect(error.message).toBe('Repair writes via "a, b" are not allowed');
  });

  test("空配列のときは AllowRepair に戻る", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (() => {
      try {
        gate.encode({ vars: { "unikvs:repair": true, "unikvs:storageNames": [] }, data: "x" });
      } catch (ex) {
        return ex as RepairNotAllowedError;
      }
      throw new Error("unreachable");
    })();

    // 検証
    expect(error.meta).toStrictEqual({ names: ["AllowRepair"] });
  });

  test("配列でないときは AllowRepair に戻る", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (() => {
      try {
        gate.encode({ vars: { "unikvs:repair": true, "unikvs:storageNames": "cache" }, data: "x" });
      } catch (ex) {
        return ex as RepairNotAllowedError;
      }
      throw new Error("unreachable");
    })();

    // 検証
    expect(error.meta).toStrictEqual({ names: ["AllowRepair"] });
    expect(error.message).toBe('Repair writes via "AllowRepair" are not allowed');
  });

  test("文字列以外は除外する", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (() => {
      try {
        gate.encode({
          vars: { "unikvs:repair": true, "unikvs:storageNames": ["a", 1, null] },
          data: "x",
        });
      } catch (ex) {
        return ex as RepairNotAllowedError;
      }
      throw new Error("unreachable");
    })();

    // 検証
    expect(error.meta).toStrictEqual({ names: ["a"] });
  });

  test("getEncodable でも単一要素を含む", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行と検証
    expect(() =>
      gate.getEncodable({ vars: { "unikvs:repair": true, "unikvs:storageNames": ["cache"] } }),
    ).toThrowError('Repair writes via "cache" are not allowed');
  });
});
