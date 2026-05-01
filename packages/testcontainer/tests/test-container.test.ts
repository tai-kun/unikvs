import { test } from "vitest";

import TestContainer from "../src/test-container.js";

test("コンテナの起動と終了ができる", async ({ expect }) => {
  await using container = await new TestContainer("busybox:latest").start();

  expect(container).toBeDefined();
});
