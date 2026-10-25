import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import Null from "../src/null.js";

// 結合テストは packages/null 側に置かないため、本ファイルでは単体テストのみとする。

/**
 * テストごとに空の Null インスタンスを提供します。
 * 各テストが他のテストの状態に依存しないようにするために使用します。
 */
const test = vitest.extend<{ storage: Null }>({
  async storage({}, use) {
    await use(new Null());
  },
});
describe("初期化と接続管理", () => {
  test("name は Null である", ({ expect, storage }) => {
    // 実行と検証：
    expect(storage.name).toBe("Null");
  });

  test("isOpen は常に true である", ({ expect, storage }) => {
    // 実行と検証：
    expect(storage.isOpen).toBe(true);
  });

  test("open・close・onOtherWriteError は存在しない", ({ expect, storage }) => {
    // 実行と検証：
    expect("open" in storage).toBe(false);
    expect("close" in storage).toBe(false);
    expect("onOtherWriteError" in storage).toBe(false);
  });
});
describe("書き込み", () => {
  test("write を呼び出したとき、例外を投げず正常終了する", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => {
      storage.write(createSetContext("k1") as IStorage.WriteContext, undefined);
    }).not.toThrow();
  });

  test("余剰プロパティ付きで write を呼び出したとき、正常終了する", ({ expect, storage }) => {
    // 準備：
    const c = createSetContext("k1") as IStorage.WriteContext;
    c.set("extra", "value");

    // 実行と検証：
    expect(() => {
      storage.write(c, "v1");
    }).not.toThrow();
  });

  test("write の後に read しても KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, undefined);

    // 実行と検証：
    expect(() => storage.read(createGetContext("k1") as IStorage.ReadContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("write の後に exists しても false を返す", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, undefined);

    // 実行：
    const result = storage.exists(createHasContext("k1") as IStorage.ExistsContext);

    // 検証：
    expect(result).toBe(false);
  });

  test("中断済みの信号を渡しても、書き込みは成功する", ({ expect, storage }) => {
    // 準備：
    const controller = new AbortController();
    controller.abort();

    // 実行と検証：
    expect(() => {
      storage.write(
        createSetContext("k1", { signal: controller.signal }) as IStorage.WriteContext,
        "v1",
      );
    }).not.toThrow();

    expect(() => storage.read(createGetContext("k1") as IStorage.ReadContext)).toThrow(
      KeyNotFoundError,
    );
  });
});
describe("読み出し", () => {
  test("read は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => storage.read(createGetContext("unknown") as IStorage.ReadContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("read が投げる KeyNotFoundError はキーを保持する", ({ expect, storage }) => {
    // 準備：
    const key = "k1";
    let error: unknown;

    // 実行：
    try {
      storage.read(createGetContext(key) as IStorage.ReadContext);
    } catch (ex) {
      error = ex;
    }

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({ meta: { key } });
  });

  test("exists は書き込みの有無にかかわらず false を返す", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, undefined);

    // 実行と検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.exists(createHasContext("unknown") as IStorage.ExistsContext)).toBe(false);
  });

  test("特殊なキーであっても、read は KeyNotFoundError を投げ、exists は false を返す", ({
    expect,
    storage,
  }) => {
    // 準備：
    const keys = ["", "__proto__", "a".repeat(1024)];

    // 実行と検証：
    for (const key of keys) {
      expect(() => storage.read(createGetContext(key) as IStorage.ReadContext)).toThrow(
        KeyNotFoundError,
      );
      expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
    }
  });

  test("中断済みの信号を渡しても、read は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備：
    const controller = new AbortController();
    controller.abort();

    // 実行と検証：
    expect(() =>
      storage.read(createGetContext("k1", { signal: controller.signal }) as IStorage.ReadContext),
    ).toThrow(KeyNotFoundError);
  });

  test("中断済みの信号を渡しても、exists は false を返す", ({ expect, storage }) => {
    // 準備：
    const controller = new AbortController();
    controller.abort();

    // 実行と検証：
    expect(
      storage.exists(
        createHasContext("k1", { signal: controller.signal }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });
});
describe("削除", () => {
  test("delete は書き込みの有無にかかわらず KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, undefined);

    // 実行と検証：
    expect(() => storage.delete(createDeleteContext("k1") as IStorage.DeleteContext)).toThrow(
      KeyNotFoundError,
    );
    expect(() => storage.delete(createDeleteContext("unknown") as IStorage.DeleteContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("delete が投げる KeyNotFoundError はキーを保持する", ({ expect, storage }) => {
    // 準備：
    const key = "k1";
    let error: unknown;

    // 実行：
    try {
      storage.delete(createDeleteContext(key) as IStorage.DeleteContext);
    } catch (ex) {
      error = ex;
    }

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({ meta: { key } });
  });

  test("余剰プロパティ付きで delete を呼び出しても KeyNotFoundError を投げる", ({
    expect,
    storage,
  }) => {
    // 準備：
    const c = createDeleteContext("k1") as IStorage.DeleteContext;
    c.set("extra", "value");

    // 実行と検証：
    expect(() => storage.delete(c)).toThrow(KeyNotFoundError);
  });

  test("clear を呼び出したとき、例外を投げず正常終了する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, undefined);

    // 実行と検証：
    expect(() => {
      storage.clear(createClearContext() as IStorage.ClearContext);
    }).not.toThrow();
  });

  test("clear の後に exists しても false を返す", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, undefined);

    // 実行：
    storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("余剰プロパティ付きで clear を呼び出したとき、正常終了する", ({ expect, storage }) => {
    // 準備：
    const c = createClearContext() as IStorage.ClearContext;
    c.set("extra", "value");

    // 実行と検証：
    expect(() => {
      storage.clear(c);
    }).not.toThrow();
  });

  test("中断済みの信号を渡しても、delete は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備：
    const controller = new AbortController();
    controller.abort();

    // 実行と検証：
    expect(() =>
      storage.delete(
        createDeleteContext("k1", { signal: controller.signal }) as IStorage.DeleteContext,
      ),
    ).toThrow(KeyNotFoundError);
  });

  test("中断済みの信号を渡しても、clear は成功する", ({ expect, storage }) => {
    // 準備：
    const controller = new AbortController();
    controller.abort();

    // 実行と検証：
    expect(() => {
      storage.clear(createClearContext("", { signal: controller.signal }) as IStorage.ClearContext);
    }).not.toThrow();
  });
});
