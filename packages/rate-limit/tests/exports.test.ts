// oxlint-disable import/no-namespace
import { test, describe } from "vite-plus/test";

import { RateLimitExceededError, RateLimitInvalidOptionError } from "../src/errors.js";
import * as index from "../src/index.js";
import RateLimit from "../src/rate-limit.js";

describe("index のエクスポート", () => {
  test("RateLimit ミドルウェアがエクスポートされている", ({ expect }) => {
    expect(index.RateLimit).toBe(RateLimit);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    expect(index.RateLimitExceededError).toBe(RateLimitExceededError);
    expect(index.RateLimitInvalidOptionError).toBe(RateLimitInvalidOptionError);
  });
});
