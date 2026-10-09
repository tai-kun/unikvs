import { RepairNotAllowedError } from "@unikvs/core";
import { describe, test } from "vitest";

import LocalStorage from "../src/localstorage.js";
import { abortedSignal, captureThrown, createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

describe("LocalStorage - 書き戻しの許可", () => {
  test("既定では書き戻しを拒否する", ({ expect }) => {
    // 準備
    const storage = new LocalStorage({ storage: createFakeStorage() });

    // 実行と検証
    expect(storage.allowRepair).toBe(false);
    expect(() =>
      storage.write({ key: "a", data: "x", vars: { "unikvs:repair": true }, signal }),
    ).toThrow(RepairNotAllowedError);
    expect(storage.exists({ key: "a", signal })).toBe(false);
  });

  test("allowRepair: true では書き戻しを受け付ける", ({ expect }) => {
    // 準備
    const storage = new LocalStorage({ storage: createFakeStorage(), allowRepair: true });

    // 実行
    expect(storage.allowRepair).toBe(true);
    storage.write({ key: "a", data: "x", vars: { "unikvs:repair": true }, signal });

    // 検証
    expect(storage.read({ key: "a", signal })).toBe("x");
  });

  test("allowRepair: false でも通常の write は受け付ける", ({ expect }) => {
    // 準備
    const storage = new LocalStorage({ storage: createFakeStorage(), allowRepair: false });

    // 実行
    storage.write({ key: "a", data: "x", vars: {}, signal });
    storage.write({ key: "b", data: "y", vars: {}, signal });

    // 検証
    expect(storage.read({ key: "a", signal })).toBe("x");
    expect(storage.read({ key: "b", signal })).toBe("y");
  });

  test("書き戻し違反と中断が同時成立したとき、書き戻し拒否を優先する", ({ expect }) => {
    // 準備
    const storage = new LocalStorage({ storage: createFakeStorage() });

    // 実行
    const error = captureThrown(() =>
      storage.write({
        key: "a",
        data: "x",
        vars: { "unikvs:repair": true },
        signal: abortedSignal(),
      }),
    );

    // 検証
    expect(error).toBeInstanceOf(RepairNotAllowedError);
  });
});
