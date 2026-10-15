import { RepairNotAllowedError, type IMiddleware } from "@unikvs/core";
import {
  captureRejection,
  createClearContext,
  createDecodeContext,
  createDeleteContext,
  createEncodeContext,
  createGetContext,
  createHasContext,
  createNext,
  createRepairContext,
  createSetContext,
  createStreamContext,
  type TestContext,
} from "@unikvs/testing";
import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import AllowRepair from "../src/allow-repair.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 *
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 */
const test = vitest.extend<{
  setLang: (lang: string) => void;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});

/**
 * 値をエンコードして出力された値を返します。
 * 透過されることを検証するために使用します。
 */
async function encode(gate: AllowRepair, c: TestContext): Promise<unknown> {
  await gate.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

describe("初期化と基本属性", () => {
  test("name は AllowRepair を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行と検証
    expect(gate.name).toBe("AllowRepair");
  });

  test("isOpen は常に true を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行と検証
    expect(gate.isOpen).toBe(true);
  });

  test("初期状態では enabled が true である", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行と検証
    expect(gate.enabled).toBe(true);
  });
});

describe("許可状態の切替え", () => {
  test("disable で enabled が false になる", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行
    gate.disable();

    // 検証
    expect(gate.enabled).toBe(false);
  });

  test("disable 後に enable で true に戻る", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    gate.enable();

    // 検証
    expect(gate.enabled).toBe(true);
  });

  test("toggle は状態を反転し反転後の値を返す", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行と検証
    expect(gate.toggle()).toBe(false);
    expect(gate.enabled).toBe(false);
    expect(gate.toggle()).toBe(true);
    expect(gate.enabled).toBe(true);
  });

  test("toggle を2回呼ぶと元の状態に戻る", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行
    gate.toggle();
    gate.toggle();

    // 検証
    expect(gate.enabled).toBe(true);
  });
});

describe("encode の透過", () => {
  test("非修復コンテキストでは同一参照を返す", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const data = "hello";

    // 実行と検証
    expect(await encode(gate, createSetContext("k1", { source: data }))).toBe(data);
    expect(await encode(gate, createEncodeContext(data, "k1"))).toBe(data);
  });

  test("disable 中でも同一参照を返す", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();
    const data = { foo: "bar" };

    // 実行と検証
    expect(await encode(gate, createSetContext("k1", { source: data }))).toBe(data);
    expect(await encode(gate, createEncodeContext(data, "k1"))).toBe(data);
  });

  test("書き戻し要求があっても encode は透過する", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();
    const data = "x";

    // 実行と検証
    expect(await encode(gate, createRepairContext("k1", ["n1"], { source: data }))).toBe(data);
  });

  test("文字列とバイト列とオブジェクトを同一参照で返す", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const text = "hello";
    const bytes = new Uint8Array([1, 2, 3]);
    const object = { foo: "bar" };

    // 実行と検証
    expect(await encode(gate, createEncodeContext(text, "k1"))).toBe(text);
    expect(await encode(gate, createEncodeContext(bytes, "k1"))).toBe(bytes);
    expect(await encode(gate, createEncodeContext(object, "k1"))).toBe(object);
  });
});

describe("use による修復の許可と拒否", () => {
  test("既定状態で書き戻し付き get を next に委譲する", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    let called = false;

    // 実行
    await gate.use(
      createGetContext("k1", {
        repair: { enabled: true, targets: ["n1"] },
      }) as IMiddleware.UseContext,
      async () => {
        called = true;
      },
    );

    // 検証
    expect(called).toBe(true);
  });

  test("disable 後に書き戻し付き get で RepairNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行と検証
    await expect(
      gate.use(
        createGetContext("k1", {
          repair: { enabled: true, targets: ["n1"] },
        }) as IMiddleware.UseContext,
        createNext(),
      ),
    ).rejects.toThrow(RepairNotAllowedError);
  });

  test("disable 後に書き戻し付き stream で RepairNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行と検証
    await expect(
      gate.use(
        createStreamContext("k1", {
          repair: { enabled: true, targets: ["n1"] },
        }) as IMiddleware.UseContext,
        createNext(),
      ),
    ).rejects.toThrow(RepairNotAllowedError);
  });

  test("disable 中でも書き戻しなしの操作は next に委譲する", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();
    const called: Record<string, boolean> = {};

    // 実行
    for (const c of [
      createSetContext("k1"),
      createGetContext("k1"),
      createStreamContext("k1"),
      createHasContext("k1"),
      createDeleteContext("k1"),
      createClearContext("k1"),
    ]) {
      await gate.use(c as IMiddleware.UseContext, async () => {
        called[c.action] = true;
      });
    }

    // 検証
    expect(called).toStrictEqual({
      set: true,
      get: true,
      stream: true,
      has: true,
      delete: true,
      clear: true,
    });
  });

  test("enable 後に書き戻し付き get で再び next に委譲する", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();
    gate.enable();
    let called = false;

    // 実行
    await gate.use(
      createGetContext("k1", {
        repair: { enabled: true, targets: ["n1"] },
      }) as IMiddleware.UseContext,
      async () => {
        called = true;
      },
    );

    // 検証
    expect(called).toBe(true);
  });
});

describe("decode の透過", () => {
  test("通常のコンテキストでは同一参照を返す", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const data = "hello";

    // 実行
    const c = createDecodeContext(data, "k1");
    await gate.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証
    expect(c.destination).toBe(data);
  });

  test("disable 中でも投げずに同一参照を返す", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const c = createDecodeContext(data, "k1");
    await gate.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証
    expect(c.destination).toBe(data);
  });
});

describe("エラーの同一性", () => {
  test("拒否時は core の RepairNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = await captureRejection(
      gate.use(
        createRepairContext("k1", [], { source: "x" }) as IMiddleware.UseContext,
        createNext(),
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(RepairNotAllowedError);
  });

  test("meta.names は targets をそのまま保持する", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (await captureRejection(
      gate.use(
        createRepairContext("k1", [], { source: "x" }) as IMiddleware.UseContext,
        createNext(),
      ),
    )) as RepairNotAllowedError;

    // 検証
    expect(error.meta).toStrictEqual({ names: [] });
  });

  test("name は UniKvsRepairNotAllowedError である", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (await captureRejection(
      gate.use(
        createRepairContext("k1", [], { source: "x" }) as IMiddleware.UseContext,
        createNext(),
      ),
    )) as RepairNotAllowedError;

    // 検証
    expect(error.name).toBe("UniKvsRepairNotAllowedError");
  });

  test("既定のメッセージは不明名を含む", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (await captureRejection(
      gate.use(
        createRepairContext("k1", [], { source: "x" }) as IMiddleware.UseContext,
        createNext(),
      ),
    )) as RepairNotAllowedError;

    // 検証
    expect(error.message).toBe('Repair writes via "(unknown)" are not allowed');
  });

  test("日本語では不明名のメッセージを返す", async ({ expect, setLang }) => {
    // 準備
    setLang("ja");
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (await captureRejection(
      gate.use(
        createRepairContext("k1", [], { source: "x" }) as IMiddleware.UseContext,
        createNext(),
      ),
    )) as RepairNotAllowedError;

    // 検証
    expect(error.message).toBe('"(unknown)" への書き戻しは許可されていません');
  });
});
