import { describe, test } from "vitest";

import {
  InvalidUsageErrorBase,
  InvalidInputError,
  InvalidOutputError,
  UniKvsIsOpenError,
  UniKvsIsNotOpenError,
  KeyNotFoundError,
  StorageIsNotOpenError,
  WritableStreamNotSupportedError,
  ReadableStreamNotSupportedError,
  MultipartWriteNotSupportedError,
  MiddlewareIsNotOpenError,
  StreamEncodingNotSupportedError,
  StreamDecodingNotSupportedError,
  PluginOperationAggregateError,
  MissingStorageError,
} from "../src/errors.js";

describe("InvalidUsageErrorBase", () => {
  test("ErrorBase を継承している", ({ expect }) => {
    // 実行と検証
    expect(InvalidUsageErrorBase.prototype).toBeInstanceOf(Error);
  });
});

describe("InvalidInputError", () => {
  test("issues のメッセージが連結されたエラーメッセージを持つ", ({ expect }) => {
    // 準備
    const issues = [
      { message: "Invalid type", kind: "type" as const },
      { message: "Expected string", kind: "type" as const },
    ] as any;

    // 実行
    const error = new InvalidInputError({ value: 42, issues });

    // 検証
    expect(error.message).toBe("Invalid type: Expected string");
  });

  test("issues が1つのとき、そのメッセージがそのままエラーメッセージになる", ({ expect }) => {
    // 準備
    const issues = [{ message: "Only one issue", kind: "type" as const }] as any;

    // 実行
    const error = new InvalidInputError({ value: "foo", issues });

    // 検証
    expect(error.message).toBe("Only one issue");
  });
});

describe("InvalidOutputError", () => {
  test("issues のメッセージが連結されたエラーメッセージを持つ", ({ expect }) => {
    // 準備
    const issues = [
      { message: "Invalid format", kind: "type" as const },
      { message: "Expected Uint8Array", kind: "type" as const },
    ] as any;

    // 実行
    const error = new InvalidOutputError({ value: "bad", issues });

    // 検証
    expect(error.message).toBe("Invalid format: Expected Uint8Array");
  });
});

describe("UniKvsIsOpenError", () => {
  test("投げられたとき、メッセージが `UniKvs is open` である", ({ expect }) => {
    // 実行と検証
    expect(new UniKvsIsOpenError().message).toMatch(/UniKvs is open/);
  });
});

describe("UniKvsIsNotOpenError", () => {
  test("投げられたとき、メッセージが `UniKvs is not open` である", ({ expect }) => {
    // 実行と検証
    expect(new UniKvsIsNotOpenError().message).toMatch(/UniKvs is not open/);
  });
});

describe("KeyNotFoundError", () => {
  test("指定されたキーがエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(new KeyNotFoundError({ key: "my-key" }).message).toMatch(/my-key/);
  });
});

describe("StorageIsNotOpenError", () => {
  test("指定されたストレージ名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(new StorageIsNotOpenError({ name: "MyStorage" }).message).toMatch(/MyStorage/);
  });
});

describe("WritableStreamNotSupportedError", () => {
  test("指定されたストレージ名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(new WritableStreamNotSupportedError({ name: "MyStorage" }).message).toMatch(/MyStorage/);
  });
});

describe("ReadableStreamNotSupportedError", () => {
  test("指定されたストレージ名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(new ReadableStreamNotSupportedError({ name: "MyStorage" }).message).toMatch(/MyStorage/);
  });
});

describe("MultipartWriteNotSupportedError", () => {
  test("指定されたストレージ名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(new MultipartWriteNotSupportedError({ name: "MyStorage" }).message).toMatch(/MyStorage/);
  });
});

describe("MiddlewareIsNotOpenError", () => {
  test("指定されたミドルウェア名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(new MiddlewareIsNotOpenError({ name: "MyMiddleware" }).message).toMatch(/MyMiddleware/);
  });
});

describe("StreamEncodingNotSupportedError", () => {
  test("指定されたミドルウェア名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(new StreamEncodingNotSupportedError({ name: "MyMiddleware" }).message).toMatch(
      /MyMiddleware/,
    );
  });
});

describe("StreamDecodingNotSupportedError", () => {
  test("指定されたミドルウェア名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(new StreamDecodingNotSupportedError({ name: "MyMiddleware" }).message).toMatch(
      /MyMiddleware/,
    );
  });
});

describe("PluginOperationAggregateError", () => {
  test("複数のエラー情報を保持する", ({ expect }) => {
    // 準備
    const errors = [
      { plugin: "storage" as const, reason: new Error("fail1") },
      { plugin: "middleware" as const, reason: new Error("fail2") },
    ];

    // 実行
    const error = new PluginOperationAggregateError({ action: "open", errors });

    // 検証
    expect(error.meta.errors).toHaveLength(2);
    expect(error.meta.plugin).toBe("plugin");
    expect(error.meta.action).toBe("open");
  });

  test("plugin が1種類のとき、meta.plugin がその値になる", ({ expect }) => {
    // 準備
    const errors = [{ plugin: "storage" as const, reason: new Error("fail") }];

    // 実行
    const error = new PluginOperationAggregateError({ action: "write", errors });

    // 検証
    expect(error.meta.plugin).toBe("storage");
  });

  test("name と index を保持する", ({ expect }) => {
    // 準備
    const reason = new Error("fail");
    const errors = [{ plugin: "storage" as const, name: "storage2", index: 1, reason }];

    // 実行
    const error = new PluginOperationAggregateError({ action: "write", errors });

    // 検証
    expect(error.meta.errors).toStrictEqual([
      { plugin: "storage", name: "storage2", index: 1, reason },
    ]);
  });

  test("name と index を省略した場合はプロパティを追加しない", ({ expect }) => {
    // 準備
    const reason = new Error("fail");
    const errors = [{ plugin: "storage" as const, reason }];

    // 実行
    const error = new PluginOperationAggregateError({ action: "write", errors });

    // 検証
    expect(error.meta.errors).toStrictEqual([{ plugin: "storage", reason }]);
    expect(error.meta.errors[0]).not.toHaveProperty("name");
    expect(error.meta.errors[0]).not.toHaveProperty("index");
  });
});

describe("MissingStorageError", () => {
  test("エラーメッセージがストレージ不足を伝える", ({ expect }) => {
    // 実行と検証
    expect(new MissingStorageError().message).toMatch(/At least one storage is required/);
  });
});
