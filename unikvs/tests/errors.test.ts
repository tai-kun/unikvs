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
  TransformerIsNotOpenError,
  EncodableStreamNotSupportedError,
  DecodableStreamNotSupportedError,
  PluginOperationAggregateError,
  MissingStorageError,
  TransformerRegistrationError,
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
    expect(() => {
      throw new UniKvsIsOpenError();
    }).toThrow("UniKvs is open");
  });
});

describe("UniKvsIsNotOpenError", () => {
  test("投げられたとき、メッセージが `UniKvs is not open` である", ({ expect }) => {
    // 実行と検証
    expect(() => {
      throw new UniKvsIsNotOpenError();
    }).toThrow("UniKvs is not open");
  });
});

describe("KeyNotFoundError", () => {
  test("指定されたキーがエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(() => {
      throw new KeyNotFoundError({ key: "my-key" });
    }).toThrow(/my-key/);
  });
});

describe("StorageIsNotOpenError", () => {
  test("指定されたストレージ名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(() => {
      throw new StorageIsNotOpenError({ name: "MyStorage" });
    }).toThrow(/MyStorage/);
  });
});

describe("WritableStreamNotSupportedError", () => {
  test("指定されたストレージ名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(() => {
      throw new WritableStreamNotSupportedError({ name: "MyStorage" });
    }).toThrow(/MyStorage/);
  });
});

describe("ReadableStreamNotSupportedError", () => {
  test("指定されたストレージ名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(() => {
      throw new ReadableStreamNotSupportedError({ name: "MyStorage" });
    }).toThrow(/MyStorage/);
  });
});

describe("MultipartWriteNotSupportedError", () => {
  test("指定されたストレージ名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(() => {
      throw new MultipartWriteNotSupportedError({ name: "MyStorage" });
    }).toThrow(/MyStorage/);
  });
});

describe("TransformerIsNotOpenError", () => {
  test("指定されたトランスフォーマー名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(() => {
      throw new TransformerIsNotOpenError({ name: "MyTransformer" });
    }).toThrow(/MyTransformer/);
  });
});

describe("EncodableStreamNotSupportedError", () => {
  test("指定されたトランスフォーマー名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(() => {
      throw new EncodableStreamNotSupportedError({ name: "MyTransformer" });
    }).toThrow(/MyTransformer/);
  });
});

describe("DecodableStreamNotSupportedError", () => {
  test("指定されたトランスフォーマー名がエラーメッセージに含まれる", ({ expect }) => {
    // 実行と検証
    expect(() => {
      throw new DecodableStreamNotSupportedError({ name: "MyTransformer" });
    }).toThrow(/MyTransformer/);
  });
});

describe("PluginOperationAggregateError", () => {
  test("複数のエラー情報を保持する", ({ expect }) => {
    // 準備
    const errors = [
      { plugin: "storage" as const, reason: new Error("fail1") },
      { plugin: "transformer" as const, reason: new Error("fail2") },
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
});

describe("MissingStorageError", () => {
  test("エラーメッセージがストレージ不足を伝える", ({ expect }) => {
    // 実行と検証
    expect(() => {
      throw new MissingStorageError();
    }).toThrow(/At least one storage is required/);
  });
});

describe("TransformerRegistrationError", () => {
  test("エラーメッセージがトランスフォーマー追加不可を伝える", ({ expect }) => {
    // 実行と検証
    expect(() => {
      throw new TransformerRegistrationError();
    }).toThrow(/Cannot add transformers after storage/);
  });
});
