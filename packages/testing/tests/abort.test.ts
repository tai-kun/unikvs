import { test, describe } from "vite-plus/test";

import { abortedSignal, captureThrown, captureRejection } from "../src/abort.js";

describe("captureRejection", () => {
  test("拒否理由を返す", async ({ expect }) => {
    // 準備：
    const failure = new Error("boom");

    // 実行：
    const result = await captureRejection(Promise.reject(failure));

    // 検証：
    expect(result).toBe(failure);
  });

  test("解決した場合は投げる", async ({ expect }) => {
    // 実行と検証：
    await expect(captureRejection(Promise.resolve(1))).rejects.toThrow();
  });
});

describe("captureThrown", () => {
  test("投げられた例外を返す", ({ expect }) => {
    // 準備：
    const failure = new Error("boom");

    // 実行：
    const result = captureThrown(() => {
      throw failure;
    });

    // 検証：
    expect(result).toBe(failure);
  });

  test("投げられない場合は投げる", ({ expect }) => {
    // 実行と検証：
    expect(() => captureThrown(() => 1)).toThrow();
  });
});

describe("abortedSignal", () => {
  test("中断済みのシグナルを返す", ({ expect }) => {
    // 実行：
    const signal = abortedSignal(new Error("stop"));

    // 検証：
    expect(signal.aborted).toBe(true);
  });
});
