import { ChecksumSha256 } from "@unikvs/checksum";
import { Compression } from "@unikvs/compression";
import { Memory } from "@unikvs/memory";
import { type Random, forCasesAsync } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import { Builder } from "../src/index.js";
import type { IUniKvsBuilder } from "../src/unikvs-builder.js";
import type { Value, PlainValue, StreamValue } from "../src/value-schemas.js";
import { streamOf, collectBytes, FakeStreamMiddleware } from "./_helpers.js";

const SEED = 20_260_930;
const KEYS = ["a", "b", "c", ""] as const;

/**
 * モデル照合で使用する操作です。
 */
type Op =
  | {
      readonly key: string;
      readonly type: "set";
      readonly value: string;
    }
  | {
      readonly key: string;
      readonly type: "get" | "has" | "delete" | "clear";
    };

/**
 * ランダムな CRUD 操作列を生成します。
 */
function generateOps(rng: Random, count: number): Op[] {
  return rng.array(count, (r) => {
    const type = r.pick(["set", "get", "has", "delete", "clear"] as const);
    const key = r.pick(KEYS);

    return type === "set"
      ? {
          key,
          type,
          value: r.string(r.int(0, 8)),
        }
      : {
          key,
          type,
        };
  });
}

describe("UniKvs - 決定的ファズ: CRUD モデル", () => {
  test("ランダムな操作列が Map リファレンスと一致する", async ({ expect }) => {
    // 実行と検証：
    await forCasesAsync(SEED, 40, async (rng) => {
      await using kvs = new Builder<Record<string, PlainValue<string>>>()
        .persist(new Memory())
        .build();
      await kvs.open();

      const model = new Map<string, string>();

      for (const op of generateOps(rng, rng.int(0, 30))) {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        switch (op.type) {
          case "set": {
            await kvs.set(op.key, op.value);
            model.set(op.key, op.value);
            break;
          }

          case "get": {
            // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
            if (model.has(op.key)) {
              await expect(kvs.get(op.key)).resolves.toBe(model.get(op.key));
            } else {
              await expect(kvs.get(op.key)).rejects.toThrow(KeyNotFoundError);
            }

            break;
          }

          case "has": {
            await expect(kvs.has(op.key)).resolves.toBe(model.has(op.key));
            break;
          }

          case "delete": {
            await kvs.delete(op.key);
            model.delete(op.key);
            break;
          }

          case "clear": {
            await kvs.clear();
            model.clear();
            break;
          }
        }
      }

      for (const key of KEYS) {
        await expect(kvs.has(key)).resolves.toBe(model.has(key));
      }
    });
  });
});

describe("UniKvs - 決定的ファズ: ストリーム往復", () => {
  test("ランダムなチャンク分割でもバイト列が一致する", async ({ expect }) => {
    // 実行と検証：
    await forCasesAsync(SEED + 1, 40, async (rng) => {
      await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
        .persist(new Memory())
        .build();
      await kvs.open();

      const bytes = rng.bytes(rng.int(0, 64));
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let offset = 0;

      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      for (let i = 0, n = rng.int(0, 8); i < n && offset < bytes.length; i++) {
        const size = rng.int(1, 16);
        chunks.push(bytes.slice(offset, offset + size));
        offset += size;
      }

      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (offset < bytes.length) {
        chunks.push(bytes.slice(offset));
      }

      await kvs.set("logs", streamOf(chunks));
      const vs = await kvs.stream("logs");
      const got = await collectBytes(vs);
      expect([...got]).toEqual([...bytes]);
      await vs.dispose();
    });
  });
});

describe("UniKvs - 決定的ファズ: ミドルウェア構成", () => {
  test("ランダムな圧縮・チェックサム・パススルー構成でもバイト列が往復する", async ({ expect }) => {
    // 実行と検証：
    await forCasesAsync(SEED + 2, 30, async (rng) => {
      const compression = rng.pick(["none", "gzip", "deflate"] as const);
      const useChecksum = rng.bool();
      const usePassthrough = rng.bool();
      const bytes = rng.bytes(rng.int(0, 128));

      let builder: IUniKvsBuilder<{ data: Value<Uint8Array<ArrayBuffer>> }> = new Builder<{
        data: Value<Uint8Array<ArrayBuffer>>;
      }>();

      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (useChecksum) {
        builder = builder.use(new ChecksumSha256());
      }

      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (compression !== "none") {
        builder = builder.use(new Compression(compression));
      }

      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (usePassthrough) {
        builder = builder.use(new FakeStreamMiddleware("pass-through"));
      }

      await using kvs = builder.persist(new Memory()).build();
      await kvs.open();
      await kvs.set("data", bytes);
      expect([...(await kvs.get("data"))]).toEqual([...bytes]);

      const vs = await kvs.stream("data");
      expect([...(await collectBytes(vs))]).toEqual([...bytes]);
      await vs.dispose();
    });
  });
});
