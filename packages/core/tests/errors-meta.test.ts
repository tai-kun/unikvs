import { describe, test } from "vitest";

import { ErrorBase, type ErrorOptions, InvalidUsageErrorBase } from "../src/errors.js";

type KeyNotFoundErrorArgs = {
  readonly key: string;
};

/**
 * ErrorBase のメタ情報・名前・プロトタイプチェーンの契約を検証するためのサンプルエラーです。
 */
class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorArgs> {
  static {
    this.prototype.name = "KeyNotFoundError";
  }

  public constructor(args: KeyNotFoundErrorArgs, options?: ErrorOptions) {
    super(args, ({ key }) => `Key not found: ${key}`, options);
  }
}

describe("name", () => {
  test("プロトタイプに設定した名前を返す", ({ expect }) => {
    // 実行
    const error = new KeyNotFoundError({ key: "foo" });

    // 検証
    expect(error.name).toBe("KeyNotFoundError");
  });

  test("名前を設定していなければ Error を継承する", ({ expect }) => {
    // 準備
    class PlainError extends ErrorBase<undefined> {}

    // 実行と検証
    expect(new PlainError("plain").name).toBe("Error");
  });

  test("toString は名前とメッセージを連結して返す", ({ expect }) => {
    // 実行
    const error = new KeyNotFoundError({ key: "foo" });

    // 検証
    expect(error.toString()).toBe("KeyNotFoundError: Key not found: foo");
  });
});

describe("meta", () => {
  test("コンストラクターへ渡したオブジェクトを参照として保持する", ({ expect }) => {
    // 準備
    const args = { key: "foo" };

    // 実行
    const error = new KeyNotFoundError(args);

    // 検証
    expect(error.meta).toBe(args);
  });

  test("meta が undefined のときは undefined を保持する", ({ expect }) => {
    // 準備
    class NoMetaError extends ErrorBase<undefined> {
      public constructor(options?: ErrorOptions) {
        super("no meta", options);
      }
    }

    // 実行
    const error = new NoMetaError();

    // 検証
    expect(error.meta).toBe(undefined);
    expect(error.message).toBe("no meta");
  });

  test("meta を明示的に undefined として渡せる", ({ expect }) => {
    // 実行
    const error = new ErrorBase<undefined>(undefined, "explicit meta");

    // 検証
    expect(error.meta).toBe(undefined);
    expect(error.message).toBe("explicit meta");
  });

  test("文字列以外の値も meta として保持できる", ({ expect }) => {
    // 準備
    const meta = { count: 3, tags: ["a", "b"] };

    // 実行
    const error = new ErrorBase<typeof meta>(meta, () => "with meta");

    // 検証
    expect(error.meta).toBe(meta);
  });
});

describe("cause", () => {
  test("options を省略すると cause プロパティーは存在しない", ({ expect }) => {
    // 実行
    const error = new KeyNotFoundError({ key: "foo" });

    // 検証
    expect("cause" in error).toBe(false);
    expect(error.cause).toBe(undefined);
  });

  test("cause を明示的に undefined として渡すと cause プロパティーが存在する", ({ expect }) => {
    // 実行
    const error = new KeyNotFoundError({ key: "foo" }, { cause: undefined });

    // 検証
    expect("cause" in error).toBe(true);
    expect(error.cause).toBe(undefined);
  });

  test("Error 以外の値も cause として参照を保持する", ({ expect }) => {
    // 準備
    const cause = { reason: "disk full" };

    // 実行
    const error = new KeyNotFoundError({ key: "foo" }, { cause });

    // 検証
    expect(error.cause).toBe(cause);
  });
});

describe("プロトタイプチェーン", () => {
  test("サブクラスのプロトタイプは ErrorBase を直接継承する", ({ expect }) => {
    // 実行と検証
    expect(Object.getPrototypeOf(KeyNotFoundError.prototype)).toBe(ErrorBase.prototype);
  });

  test("InvalidUsageErrorBase のプロトタイプは ErrorBase を直接継承する", ({ expect }) => {
    // 実行と検証
    expect(Object.getPrototypeOf(InvalidUsageErrorBase.prototype)).toBe(ErrorBase.prototype);
  });
});

describe("既定のクラス", () => {
  test("ErrorBase はそのままインスタンス化できる", ({ expect }) => {
    // 実行
    const error = new ErrorBase(undefined, "boom");

    // 検証
    expect(error).toBeInstanceOf(ErrorBase);
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.meta).toBe(undefined);
    expect(error.message).toBe("boom");
  });

  test("InvalidUsageErrorBase はそのままインスタンス化できる", ({ expect }) => {
    // 実行
    const error = new InvalidUsageErrorBase(undefined, "invalid usage");

    // 検証
    expect(error).toBeInstanceOf(InvalidUsageErrorBase);
    expect(error).toBeInstanceOf(ErrorBase);
    expect(error.message).toBe("invalid usage");
  });
});
