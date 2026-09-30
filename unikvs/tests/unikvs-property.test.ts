import { ChecksumSha256 } from "@unikvs/checksum";
import { Compression } from "@unikvs/compression";
import { Memory } from "@unikvs/memory";
import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import type { PlainValue, StreamValue, Value } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import { FakeStreamTransformer, collectBytes, streamOf } from "./_helpers.js";
import { type Random, forCasesAsync } from "./_random.js";

const SEED = 20260930;
const KEYS = ["a", "b", "c", ""] as const;

/**
 * モデル照合で使用する操作です。
 */
type Op =
  | { readonly type: "set"; readonly key: string; readonly value: string }
  | { readonly type: "get" | "has" | "delete" | "clear"; readonly key: string };

/**
 * ランダムな CRUD 操作列を生成します。
 */
function generateOps(rng: Random, count: number): Op[] {
  return rng.array(count, (r) => {
    const type = r.pick(["set", "get", "has", "delete", "clear"] as const);
    const key = r.pick(KEYS);

    return type === "set" ? { type, key, value: r.string(r.int(0, 8)) } : { type, key };
  });
}

describe("UniKvs - 決定的ファズ: CRUD モデル", () => {
  test("ランダムな操作列が Map リファレンスと一致する", async ({ expect }) => {
    // 実行と検証
    await forCasesAsync(SEED, 40, async (rng) => {
      const kvs = UniKvs.config<Record<string, PlainValue<string>>>()
        .appendStorage(new Memory())
        .create();
      await kvs.open();
      const model = new Map<string, string>();

      try {
        for (const op of generateOps(rng, rng.int(0, 30))) {
          switch (op.type) {
            case "set":
              await kvs.set(op.key, op.value);
              model.set(op.key, op.value);
              break;
            case "get":
              if (model.has(op.key)) {
                expect(await kvs.get(op.key)).toBe(model.get(op.key));
              } else {
                await expect(kvs.get(op.key)).rejects.toThrow(KeyNotFoundError);
              }
              break;
            case "has":
              expect(await kvs.has(op.key)).toBe(model.has(op.key));
              break;
            case "delete":
              await kvs.delete(op.key);
              model.delete(op.key);
              break;
            case "clear":
              await kvs.clear();
              model.clear();
              break;
          }
        }

        for (const key of KEYS) {
          expect(await kvs.has(key)).toBe(model.has(key));
        }
      } finally {
        await kvs.close();
      }
    });
  });
});

describe("UniKvs - 決定的ファズ: ストリーム往復", () => {
  test("ランダムなチャンク分割でもバイト列が一致する", async ({ expect }) => {
    // 実行と検証
    await forCasesAsync(SEED + 1, 40, async (rng) => {
      const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
        .appendStorage(new Memory())
        .create();
      await kvs.open();

      try {
        const bytes = rng.bytes(rng.int(0, 64));
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let offset = 0;
        for (let i = 0, n = rng.int(0, 8); i < n && offset < bytes.length; i++) {
          const size = rng.int(1, 16);
          chunks.push(bytes.slice(offset, offset + size));
          offset += size;
        }
        if (offset < bytes.length) {
          chunks.push(bytes.slice(offset));
        }

        await kvs.set("logs", streamOf(chunks));
        const vs = await kvs.stream("logs");
        const got = await collectBytes(vs);
        expect([...got]).toEqual([...bytes]);
        await vs.dispose();
      } finally {
        await kvs.close();
      }
    });
  });
});

describe("UniKvs - 決定的ファズ: トランスフォーマー構成", () => {
  test("ランダムな圧縮・チェックサム・パススルー構成でもバイト列が往復する", async ({ expect }) => {
    // 実行と検証
    await forCasesAsync(SEED + 2, 30, async (rng) => {
      const compression = rng.pick(["none", "gzip", "deflate"] as const);
      const useChecksum = rng.bool();
      const usePassthrough = rng.bool();
      const bytes = rng.bytes(rng.int(0, 128));

      let config = UniKvs.config<{ data: Value<Uint8Array<ArrayBuffer>> }>();
      if (useChecksum) {
        config = config.appendTransformer(new ChecksumSha256());
      }
      if (compression !== "none") {
        config = config.appendTransformer(new Compression(compression));
      }
      if (usePassthrough) {
        config = config.appendTransformer(new FakeStreamTransformer("pass-through"));
      }
      const kvs = config.appendStorage(new Memory()).create();
      await kvs.open();

      try {
        await kvs.set("data", bytes);
        expect([...(await kvs.get("data"))]).toEqual([...bytes]);

        const vs = await kvs.stream("data");
        expect([...(await collectBytes(vs))]).toEqual([...bytes]);
        await vs.dispose();
      } finally {
        await kvs.close();
      }
    });
  });
});
