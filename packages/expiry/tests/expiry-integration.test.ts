import type { IStorage } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import { captureRejection, createGetContext, createHasContext } from "@unikvs/testing";
import { type PlainValue, UniKvs } from "unikvs";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError, ExpiryInvalidExpiresAtError } from "../src/errors.js";
import Expiry, { type ExpiryOptions, type ExpiryExpiredInfo } from "../src/expiry.js";

const NOW = 1_000_000;
const FUTURE = NOW + 60_000;
const PAST = NOW - 1;

const EXPIRES_AT_VAR = "@unikvs/expiry:expiresAt";

const EXPIRY_MARKER = "@unikvs/expiry";

/**
 * 下流に保存される有効期限エンベロープを作成します。
 *
 * @param expiresAt 失効時刻 (epoch ミリ秒) または期限なしの `null` です。
 * @param data 包む値です。
 *
 * @returns エンベロープを返します。
 */
function envelope(expiresAt: number | null, data: unknown): Record<string, unknown> {
  return {
    [EXPIRY_MARKER]: 1,
    expiresAt,
    data,
  };
}

type TestMapping = {
  report: PlainValue<string>;
};

async function createExpiryKvs(
  options?: ExpiryOptions,
  now?: () => number,
): Promise<{
  kvs: UniKvs<TestMapping>;
  storage: Memory;
  onExpireCalls: {
    key: string;
    expiresAt: number;
  }[];
}> {
  const onExpireCalls: {
    key: string;
    expiresAt: number;
  }[] = [];
  const storage = new Memory();
  const kvs = UniKvs.config<TestMapping>()
    .use(
      new Expiry({
        ...options,
        now: now ?? ((): number => NOW),
        onExpire: (info: ExpiryExpiredInfo): void => {
          onExpireCalls.push({ ...info });
        },
      }),
    )
    .persist(storage)
    .create();
  await kvs.open();

  return {
    kvs,
    storage,
    onExpireCalls,
  };
}

describe("書き込みと読み出し", () => {
  test("期限を指定しないとき、下流には expiresAt が null の包みが保存される", async ({
    expect,
  }) => {
    // 準備：
    const { kvs, storage } = await createExpiryKvs();

    // 実行：
    await kvs.set("report", "hello");

    // 検証：
    expect(storage.read(createGetContext("report") as IStorage.ReadContext)).toStrictEqual(
      envelope(null, "hello"),
    );
    expect(await kvs.get("report")).toBe("hello");
    expect(await kvs.has("report")).toBe(true);

    // 後片付け。
    await kvs.close();
  });

  test("未来の期限を指定したとき、期限内は読み出せる", async ({ expect }) => {
    // 準備：
    const { kvs, storage } = await createExpiryKvs();
    const expiresAt = new Date(FUTURE).toISOString();

    // 実行：
    await kvs.set("report", "hello", { vars: { [EXPIRES_AT_VAR]: expiresAt } });

    // 検証：
    expect(storage.read(createGetContext("report") as IStorage.ReadContext)).toStrictEqual(
      envelope(FUTURE, "hello"),
    );
    expect(await kvs.get("report")).toBe("hello");
    expect(await kvs.has("report")).toBe(true);

    // 後片付け。
    await kvs.close();
  });

  test("Date と数値の指定でも期限内は読み出せる", async ({ expect }) => {
    // 準備：
    const { kvs } = await createExpiryKvs();

    // 実行と検証 : Date を指定する。
    await kvs.set("report", "date", { vars: { [EXPIRES_AT_VAR]: new Date(FUTURE) } });
    expect(await kvs.get("report")).toBe("date");

    // 実行と検証 : エポックミリ秒を指定する。
    await kvs.set("report", "number", { vars: { [EXPIRES_AT_VAR]: FUTURE } });
    expect(await kvs.get("report")).toBe("number");

    // 後片付け。
    await kvs.close();
  });
});

describe("期限切れの読み出し", () => {
  test("期限を過ぎた get は KeyNotFoundError で失敗する", async ({ expect }) => {
    // 準備：
    let now = NOW;
    const { kvs, onExpireCalls } = await createExpiryKvs(undefined, (): number => now);
    await kvs.set("report", "hello", { vars: { [EXPIRES_AT_VAR]: FUTURE } });
    now = FUTURE;

    // 実行：
    const error = await captureRejection(kvs.get("report"));

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "report" });

    expect(onExpireCalls).toStrictEqual([
      {
        key: "report",
        expiresAt: FUTURE,
      },
    ]);

    // 後片付け。
    await kvs.close();
  });

  test("期限切れの has は下流の存在確認を返す", async ({ expect }) => {
    // 準備 : 期限切れの判定は読み出し経路で行い、has は下流の存在確認をそのまま返す。
    let now = NOW;
    const { kvs, storage } = await createExpiryKvs(undefined, (): number => now);
    await kvs.set("report", "hello", { vars: { [EXPIRES_AT_VAR]: FUTURE } });
    now = FUTURE;

    // 実行と検証：
    expect(await kvs.has("report")).toBe(true);
    expect(storage.exists(createHasContext("report") as IStorage.ExistsContext)).toBe(true);

    // 後片付け。
    await kvs.close();
  });

  test("書き込み時点で過去の期限は直ちに読み出せない", async ({ expect }) => {
    // 準備：
    const { kvs } = await createExpiryKvs();
    await kvs.set("report", "hello", { vars: { [EXPIRES_AT_VAR]: PAST } });

    // 実行：
    const error = await captureRejection(kvs.get("report"));

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "report" });

    // 後片付け。
    await kvs.close();
  });

  test("期限切れのキーは削除できる", async ({ expect }) => {
    // 準備：
    let now = NOW;
    const { kvs } = await createExpiryKvs(undefined, (): number => now);
    await kvs.set("report", "hello", { vars: { [EXPIRES_AT_VAR]: FUTURE } });
    now = FUTURE;

    // 実行：
    await kvs.delete("report");

    // 検証：
    expect(await kvs.has("report")).toBe(false);

    // 後片付け。
    await kvs.close();
  });
});

describe("既定の有効期限", () => {
  test("defaultExpiresAt を過ぎると読み出せない", async ({ expect }) => {
    // 準備：
    let now = NOW;
    const { kvs } = await createExpiryKvs({ defaultExpiresAt: FUTURE }, (): number => now);
    await kvs.set("report", "hello");
    now = FUTURE;

    // 実行：
    const error = await captureRejection(kvs.get("report"));

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);

    // 後片付け。
    await kvs.close();
  });

  test("キーごとの指定は既定値より優先される", async ({ expect }) => {
    // 準備：
    let now = NOW;
    const { kvs } = await createExpiryKvs({ defaultExpiresAt: PAST }, (): number => now);
    await kvs.set("report", "hello", { vars: { [EXPIRES_AT_VAR]: FUTURE } });

    // 実行と検証 : キーごとの未来の期限が有効である。
    expect(await kvs.get("report")).toBe("hello");

    // 実行と検証 : 期限を過ぎると読み出せない。
    now = FUTURE;

    const error = await captureRejection(kvs.get("report"));
    expect(error).toBeInstanceOf(KeyNotFoundError);

    // 後片付け。
    await kvs.close();
  });
});

describe("不正な指定", () => {
  test("不正な expiresAt では set が失敗する", async ({ expect }) => {
    // 準備：
    const { kvs } = await createExpiryKvs();

    // 実行：
    const error = await captureRejection(
      kvs.set("report", "hello", { vars: { [EXPIRES_AT_VAR]: "not-a-date" } }),
    );

    // 検証：
    expect(error).toBeInstanceOf(ExpiryInvalidExpiresAtError);
    expect((error as ExpiryInvalidExpiresAtError).meta).toStrictEqual({
      key: "report",
      actual: "not-a-date",
    });
    expect(await kvs.has("report")).toBe(false);

    // 後片付け。
    await kvs.close();
  });
});
