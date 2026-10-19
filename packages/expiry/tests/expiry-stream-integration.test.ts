import type { IStorage } from "@unikvs/core";
import { Json } from "@unikvs/json";
import { Memory } from "@unikvs/memory";
import { createStreamContext, sourceFrom } from "@unikvs/testing";
import { UniKvs, type StreamValue } from "unikvs";
import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import Expiry from "../src/expiry.js";

const NOW = 1_000_000;
const FUTURE = NOW + 60_000;

const EXPIRES_AT_VAR = "@unikvs/expiry:expiresAt";

type TestMapping = {
  logs: StreamValue<string>;
};

async function createStreamKvs(now: () => number) {
  const onExpireCalls: { key: string; expiresAt: number }[] = [];
  const storage = new Memory();
  const kvs = UniKvs.config<TestMapping>()
    .use(
      new Expiry({
        now,
        onExpire: (info) => {
          onExpireCalls.push({ ...info });
        },
      }),
    )
    .use(new Json())
    .persist(storage)
    .create();
  await kvs.open();

  return { kvs, storage, onExpireCalls };
}

async function collectText(stream: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return chunks;
}

describe("ストリームの書き込みと読み出し", () => {
  test("期限内はチャンクを順に読み出せる", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createStreamKvs(() => NOW);
    await kvs.set("logs", sourceFrom(["a", "b", "c"]), {
      vars: { [EXPIRES_AT_VAR]: FUTURE },
    });

    // 実行と検証: 下流には直列化された包みが保存されている。
    const raw = await new Response(
      storage.getReadable(createStreamContext("logs") as IStorage.GetReadableContext),
    ).text();
    expect(raw).toContain('"expiresAt"');
    expect(raw).toContain('"@unikvs/expiry":1');

    // 実行と検証: 包みは剥がされて読み出せる。
    const vs = await kvs.stream("logs");
    try {
      expect(await collectText(vs)).toStrictEqual(["a", "b", "c"]);
    } finally {
      await vs.dispose();
    }

    // 後片付け
    await kvs.close();
  });

  test("期限を過ぎた stream の読み出しは KeyNotFoundError で失敗する", async ({ expect }) => {
    // 準備
    let now = NOW;
    const { kvs, onExpireCalls } = await createStreamKvs(() => now);
    await kvs.set("logs", sourceFrom(["a", "b", "c"]), {
      vars: { [EXPIRES_AT_VAR]: FUTURE },
    });
    now = FUTURE;

    // 実行
    const vs = await kvs.stream("logs");
    const error = await (async () => {
      try {
        await collectText(vs);

        return undefined;
      } catch (reason: unknown) {
        return reason;
      } finally {
        await vs.dispose();
      }
    })();

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "logs" });
    expect(onExpireCalls).toStrictEqual([{ key: "logs", expiresAt: FUTURE }]);

    // 後片付け
    await kvs.close();
  });

  test("期限を指定しないストリームは期限切れにならない", async ({ expect }) => {
    // 準備
    const { kvs } = await createStreamKvs(() => NOW + 10 * 365 * 24 * 60 * 60 * 1_000);
    await kvs.set("logs", sourceFrom(["a"]));

    // 実行と検証
    const vs = await kvs.stream("logs");
    try {
      expect(await collectText(vs)).toStrictEqual(["a"]);
    } finally {
      await vs.dispose();
    }

    // 後片付け
    await kvs.close();
  });
});
