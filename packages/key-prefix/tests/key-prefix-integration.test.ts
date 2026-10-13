import { AllowRepair } from "@unikvs/allow-repair";
import { Variables } from "@unikvs/core";
import { KeyNotFoundError, type IStorage } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import { abortedSignal, captureRejection, sourceFrom } from "@unikvs/testing";
import { UniKvs } from "unikvs";
import { describe, test } from "vitest";

import { KeyPrefixClearNotSupportedError } from "../src/errors.js";
import KeyPrefix from "../src/key-prefix.js";
import { createPrefixedKvs, collectValueBytes, type TestMapping } from "./_helpers.js";

/**
 * 受信した書き込み引数を記録するストレージです。
 * vars の論理キーの維持の検証に使用します。
 */
class VarsRecordingStorage extends Memory {
  public override readonly name: string = "VarsRecordingStorage";

  public lastWriteArgs: Pick<IStorage.WriteArgs<any>, "key" | "data" | "vars"> | undefined;

  public override write(args: Pick<IStorage.WriteArgs<any>, "key" | "data" | "vars">): void {
    this.lastWriteArgs = args;
    super.write(args);
  }
}

describe("物理キーへの写像", () => {
  test("set を呼び出したとき、プレフィックス付きの物理キーで保存される", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createPrefixedKvs("tenant:");
    // 実行
    await kvs.set("k1", "v1");

    // 検証
    expect(storage.exists({ key: "tenant:k1" })).toBe(true);
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(storage.read({ key: "tenant:k1" })).toBe("v1");
    expect(await kvs.get("k1")).toBe("v1");
    expect(await kvs.has("k1")).toBe(true);
    expect(await kvs.has("k2")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("delete を呼び出したとき、プレフィックス付きの物理キーが削除される", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createPrefixedKvs("tenant:");
    await kvs.set("k1", "v1");

    // 実行
    await kvs.delete("k1");

    // 検証
    expect(storage.exists({ key: "tenant:k1" })).toBe(false);
    expect(await kvs.has("k1")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("stream の読み書きではプレフィックス付きの物理キーを使う", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createPrefixedKvs("tenant:");
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    await kvs.set("logs", sourceFrom([data]));

    // 検証
    expect(storage.exists({ key: "tenant:logs" })).toBe(true);
    expect(storage.exists({ key: "logs" })).toBe(false);
    const vs = await kvs.stream("logs");
    expect((await collectValueBytes(vs)).flatMap((chunk) => [...chunk])).toStrictEqual([...data]);

    // 後片付け
    await vs.dispose();
    await kvs.close();
  });
});

describe("宛先ごとのプレフィックス", () => {
  test("set した値は宛先ごとに異なる物理キーで保存される", async ({ expect }) => {
    // 準備
    const mainStorage = new Memory();
    const storageA = new Memory();
    const storageB = new Memory();
    const kvs = UniKvs.config<TestMapping>()
      .connect(new KeyPrefix(""))
      .persist(mainStorage)
      .fork(UniKvs.branch().connect(new KeyPrefix("a:")).persist(storageA))
      .fork(UniKvs.branch().connect(new KeyPrefix("b:")).persist(storageB))
      .create();
    await kvs.open();

    // 実行
    await kvs.set("k1", "v1");

    // 検証
    expect(storageA.exists({ key: "a:k1" })).toBe(true);
    expect(storageA.exists({ key: "b:k1" })).toBe(false);
    expect(storageB.exists({ key: "b:k1" })).toBe(true);
    expect(storageB.exists({ key: "a:k1" })).toBe(false);
    expect(mainStorage.exists({ key: "k1" })).toBe(true);
    expect(await kvs.get("k1")).toBe("v1");

    // 後片付け
    await kvs.close();
  });

  test("has と delete は宛先ごとの解決キーを使う", async ({ expect }) => {
    // 準備
    const mainStorage = new Memory();
    const storageA = new Memory();
    const storageB = new Memory();
    const kvs = UniKvs.config<TestMapping>()
      .persist(mainStorage)
      .fork(UniKvs.branch().connect(new KeyPrefix("a:")).persist(storageA))
      .fork(UniKvs.branch().connect(new KeyPrefix("b:")).persist(storageB))
      .create();
    await kvs.open();
    storageA.write({ key: "b:k1", data: "contamination", vars: new Variables() });

    // 実行と検証: 別宛先の物理キーが混入しても論理キーでは見えない。
    expect(await kvs.has("k1")).toBe(false);

    // 実行と検証: 自宛先の解決キーで書くと見える。
    storageB.write({ key: "b:k1", data: "v1", vars: new Variables() });
    expect(await kvs.has("k1")).toBe(true);

    // 実行
    await kvs.delete("k1");

    // 検証: 自宛先の解決キーのみが削除され、混入キーは残る。
    expect(storageB.exists({ key: "b:k1" })).toBe(false);
    expect(storageA.exists({ key: "b:k1" })).toBe(true);

    // 後片付け
    await kvs.close();
  });

  test("共有インスタンスを 2 宛先で使うとき、同一の物理キーになる", async ({ expect }) => {
    // 準備
    const mainStorage = new Memory();
    const storageA = new Memory();
    const storageB = new Memory();
    const shared = new KeyPrefix("shared:");
    const kvs = UniKvs.config<TestMapping>()
      .persist(mainStorage)
      .fork(UniKvs.branch().connect(shared).persist(storageA))
      .fork(UniKvs.branch().connect(shared).persist(storageB))
      .create();
    await kvs.open();

    // 実行
    await kvs.set("k1", "v1");

    // 検証
    expect(storageA.read({ key: "shared:k1" })).toBe("v1");
    expect(storageB.read({ key: "shared:k1" })).toBe("v1");

    // 後片付け
    await kvs.close();
  });
});

describe("適用順序", () => {
  test("同一チェーンに二重適用したとき、登録順にプレフィックスが付与される", async ({ expect }) => {
    // 準備
    const orderedStorage = new Memory();
    const ordered = UniKvs.config<TestMapping>()
      .connect(new KeyPrefix("a:"))
      .connect(new KeyPrefix("b:"))
      .persist(orderedStorage)
      .create();
    await ordered.open();

    // 実行
    await ordered.set("k1", "v1");

    // 検証
    expect(orderedStorage.exists({ key: "b:a:k1" })).toBe(true);
    expect(orderedStorage.exists({ key: "a:b:k1" })).toBe(false);
    expect(await ordered.get("k1")).toBe("v1");

    // 後片付け
    await ordered.close();
  });
});

describe("論理キーの維持", () => {
  test("storage が受信する vars のキーは論理キーである", async ({ expect }) => {
    // 準備
    const storage = new VarsRecordingStorage();
    const kvs = UniKvs.config<TestMapping>()
      .connect(new KeyPrefix("tenant:"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("k1", "v1");

    // 検証
    expect(storage.lastWriteArgs?.vars?.get("unikvs:key")).toBe("k1");
    expect(storage.lastWriteArgs?.key).toBe("tenant:k1");

    // 後片付け
    await kvs.close();
  });

  test("存在しないキーを取得したとき、論理キーで KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const { kvs } = await createPrefixedKvs("tenant:");

    // 実行
    const error = await captureRejection(kvs.get("k2"));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "k2" });

    // 後片付け
    await kvs.close();
  });
});

describe("clear の誤解防止", () => {
  test("allow が既定のとき、他テナントのデータも削除される", async ({ expect }) => {
    // 準備
    const storage = new Memory();
    const tenantA = UniKvs.config<TestMapping>()
      .connect(new KeyPrefix("tenantA:"))
      .persist(storage)
      .create();
    const tenantB = UniKvs.config<TestMapping>()
      .connect(new KeyPrefix("tenantB:"))
      .persist(storage)
      .create();
    await tenantA.open();
    await tenantB.open();
    await tenantA.set("k1", "a1");
    await tenantB.set("k1", "b1");

    // 実行
    await tenantA.clear();

    // 検証: 共有ストレージでは他テナントまで削除されることが仕様である。
    await expect(tenantB.get("k1")).rejects.toThrow(KeyNotFoundError);

    // 後片付け
    await tenantA.close();
    await tenantB.close();
  });

  test("clearBehavior が deny のとき、UniKvs.clear が拒否され両テナントのデータが残る", async ({
    expect,
  }) => {
    // 準備
    const storage = new Memory();
    const tenantA = UniKvs.config<TestMapping>()
      .connect(new KeyPrefix("tenantA:", { clearBehavior: "deny" }))
      .persist(storage)
      .create();
    const tenantB = UniKvs.config<TestMapping>()
      .connect(new KeyPrefix("tenantB:", { clearBehavior: "deny" }))
      .persist(storage)
      .create();
    await tenantA.open();
    await tenantB.open();
    await tenantA.set("k1", "a1");
    await tenantB.set("k1", "b1");

    // 実行と検証
    await expect(tenantA.clear()).rejects.toThrow(KeyPrefixClearNotSupportedError);
    expect(await tenantA.get("k1")).toBe("a1");
    expect(await tenantB.get("k1")).toBe("b1");

    // 後片付け
    await tenantA.close();
    await tenantB.close();
  });

  test("deny の設定が複数あるとき、最初に検出したプレフィックスが報告され削除は実行されない", async ({
    expect,
  }) => {
    // 準備
    const storage = new Memory();
    const kvs = UniKvs.config<TestMapping>()
      .connect(new KeyPrefix("first:", { clearBehavior: "deny" }))
      .connect(new KeyPrefix("second:", { clearBehavior: "deny" }))
      .persist(storage)
      .create();
    await kvs.open();
    await kvs.set("k1", "v1");

    // 実行
    const error = await captureRejection(kvs.clear());

    // 検証
    expect(error).toBeInstanceOf(KeyPrefixClearNotSupportedError);
    expect((error as KeyPrefixClearNotSupportedError).meta).toStrictEqual({
      prefix: "first:",
      clearBehavior: "deny",
    });
    expect(storage.exists({ key: "second:first:k1" })).toBe(true);

    // 後片付け
    await kvs.close();
  });
});

describe("repair との連動", () => {
  test("repair 付きの get では書き戻しがプレフィックス付きで行われる", async ({ expect }) => {
    // 準備
    const storageA = new Memory();
    const storageB = new Memory();
    const kvs = UniKvs.config<TestMapping>()
      .connect(new KeyPrefix("tenant:"))
      .connect(new AllowRepair())
      .persist(storageA)
      .persist(storageB)
      .create();
    await kvs.open();
    storageB.write({ key: "tenant:k1", data: "v1", vars: new Variables() });

    // 実行
    const value = await kvs.get("k1", { repair: true });

    // 検証
    expect(value).toBe("v1");
    expect(storageA.exists({ key: "tenant:k1" })).toBe(true);
    expect(storageA.exists({ key: "k1" })).toBe(false);
    expect(storageA.read({ key: "tenant:k1" })).toBe("v1");

    // 後片付け
    await kvs.close();
  });

  test("repair 付きの stream では書き戻しがプレフィックス付きで行われる", async ({ expect }) => {
    // 準備
    const storageA = new Memory();
    const storageB = new Memory();
    const kvs = UniKvs.config<TestMapping>()
      .connect(new KeyPrefix("tenant:"))
      .connect(new AllowRepair())
      .persist(storageA)
      .persist(storageB)
      .create();
    await kvs.open();
    const data = new Uint8Array([4, 5, 6]);
    storageB.write({ key: "tenant:logs", data, vars: new Variables() });

    // 実行
    const vs = await kvs.stream("logs", { repair: true });
    const output = (await collectValueBytes(vs)).flatMap((chunk) => [...chunk]);

    // 検証
    expect(output).toStrictEqual([...data]);
    expect(storageA.exists({ key: "tenant:logs" })).toBe(true);
    expect(storageA.exists({ key: "logs" })).toBe(false);

    // 後片付け
    await vs.dispose();
    await kvs.close();
  });
});

describe("中断", () => {
  test("中断済みシグナルでの get は中断される", async ({ expect }) => {
    // 準備
    const { kvs } = await createPrefixedKvs("tenant:");
    await kvs.set("k1", "v1");

    // 実行
    const error = await captureRejection(kvs.get("k1", { signal: abortedSignal() }));

    // 検証
    expect((error as DOMException).name).toBe("AbortError");

    // 後片付け
    await kvs.close();
  });
});
