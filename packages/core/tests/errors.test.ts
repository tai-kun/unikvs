import { test, describe } from "vitest";

import { ErrorBase } from "../src/errors.js";

describe("ErrorBase", () => {
  test("globalThis.Error クラスを継承する", ({ expect }) => {
    expect(new ErrorBase(...([{}, ""] as [any, any]))).toBeInstanceOf(globalThis.Error);
  });
});
