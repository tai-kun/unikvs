import { test, describe, expectTypeOf } from "vite-plus/test";

// oxlint-disable import/no-namespace
import { UnsupportedRuntimeError, ZstdNodeInvalidLevelError } from "../src/errors.js";
import * as index from "../src/index.js";
import type {
  UnsupportedRuntimeErrorArgs,
  UnsupportedRuntimeErrorMeta,
  ZstdNodeInvalidLevelErrorArgs,
  ZstdNodeInvalidLevelErrorMeta,
} from "../src/index.js";
import ZstdNode from "../src/zstd-node.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.ZstdNode).toBe(ZstdNode);
    expect(index.ZstdNodeInvalidLevelError).toBe(ZstdNodeInvalidLevelError);
    expect(index.UnsupportedRuntimeError).toBe(UnsupportedRuntimeError);
    // 実装は展開失敗を専用エラーで包まないため、ZstdNodeDecompressError は公開しない。
    expect("ZstdNodeDecompressError" in index).toBe(false);
  });

  test("エラーの型が公開されている", ({ expect }) => {
    // 準備：
    const args: ZstdNodeInvalidLevelErrorArgs = { actual: 0 };
    const meta: ZstdNodeInvalidLevelErrorMeta = { actual: 0 };
    const runtimeArgs: UnsupportedRuntimeErrorArgs = {
      name: "ZstdNode",
      runtime: "Node.js",
    };
    const runtimeMeta: UnsupportedRuntimeErrorMeta = {
      name: "ZstdNode",
      runtime: "Node.js",
    };

    // 実行と検証：
    expect(args.actual).toBe(0);
    expect(meta.actual).toBe(0);
    expect(runtimeArgs.name).toBe("ZstdNode");
    expect(runtimeMeta.runtime).toBe("Node.js");

    expectTypeOf<ZstdNodeInvalidLevelErrorArgs>().toHaveProperty("actual");
    expectTypeOf<ZstdNodeInvalidLevelErrorMeta>().toEqualTypeOf<{ readonly actual: unknown }>();
  });

  test("存在しないエラーの型は公開されていない", () => {
    // @ts-expect-error ZstdNodeDecompressError に対応する Args 型は存在しない。
    expectTypeOf<index.ZstdNodeDecompressErrorArgs>().toBeNever();
  });
});
