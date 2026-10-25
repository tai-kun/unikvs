import type { IStorage } from "@unikvs/core";
import {
  type Random,
  collectBytes,
  forCasesAsync,
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import { test } from "./_helpers.js";

/**
 * 値が undefined でないことを表明して取り出します。
 */
function unwrap<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("想定外の undefined です。");
  }

  return value;
}

const { signal } = new AbortController();

const SEED = 20_260_930;
const CASE_COUNT = 30;

const KEYS = ["a.bin", "b.bin", "c.bin"] as const;

type Command =
  | {
      readonly key: string;
      readonly data: Uint8Array<ArrayBuffer>;
      readonly type: "write";
    }
  | {
      readonly key: string;
      readonly type: "read" | "delete" | "exists";
    }
  | { readonly type: "clear" };

/**
 * 常に有効なファイル名になるランダムキーを生成します。
 * キー検証で弾かれない入力だけをファズテストへ渡すために使用します。
 */
function randomKey(random: Random): string {
  return `${random.string(random.int(1, 12))}.bin`;
}

/**
 * 1 件分のランダムな操作を生成します。
 * Map モデルと照合する操作列を作るために使用します。
 */
function randomCommand(random: Random): Command {
  const kind = random.int(0, 2);

  if (kind === 0) {
    return {
      key: random.pick(KEYS),
      data: random.bytes(random.int(0, 256)),
      type: "write",
    };
  }

  if (kind === 1) {
    return {
      key: random.pick(KEYS),
      type: random.pick(["read", "delete", "exists"] as const),
    };
  }

  return { type: "clear" };
}

describe("決定的ファズテストの振る舞い", () => {
  test("固定シードの任意のキーとバイト列の write→read が往復する", async ({ expect, storage }) => {
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      // 準備：
      const key = randomKey(random);
      const data = random.bytes(random.int(0, 4096));

      // 実行：
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

      const loaded = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

      // 検証：
      expect(loaded).toStrictEqual(data);
    });
  });

  test("固定シードの任意のチャンク分割でストリームへ書き込んだ内容が読み取りと一致する", async ({
    expect,
    storage,
  }) => {
    await forCasesAsync(SEED + 1, CASE_COUNT, async (random) => {
      // 準備：
      const key = randomKey(random);
      const data = random.bytes(random.int(0, 4096));
      const chunkSizes = random.array(random.int(1, 10), () => random.int(1, 1000));
      const writable = await storage.getWritable(
        createSetContext(key, { signal }) as IStorage.GetWritableContext,
      );
      const writer = writable.getWriter();

      // 実行：
      let offset = 0;
      let index = 0;

      while (offset < data.length) {
        const chunkSize = chunkSizes[index % chunkSizes.length];

        const size = Math.min(unwrap(chunkSize), data.length - offset);
        await writer.write(data.subarray(offset, offset + size));
        offset += size;

        index++;
      }

      await writer.close();
      const loaded = await collectBytes(
        await storage.getReadable(
          createStreamContext(key, { signal }) as IStorage.GetReadableContext,
        ),
      );

      // 検証：
      expect(loaded).toStrictEqual(data);
    });
  });

  test("固定シードの任意の操作列に対して Map モデルと同じ状態を保つ", async ({
    expect,
    storage,
  }) => {
    await forCasesAsync(SEED + 2, CASE_COUNT, async (random) => {
      // 準備 : 実行ごとに独立させるため、前の実行の状態を消去します。
      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
      const model = new Map<string, Uint8Array<ArrayBuffer>>();
      const commands = random.array(random.int(1, 20), () => randomCommand(random));

      // 実行と検証：
      for (const command of commands) {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        switch (command.type) {
          case "write": {
            await storage.write(
              createSetContext(command.key, { signal }) as IStorage.WriteContext,
              command.data,
            );
            model.set(command.key, command.data);
            break;
          }

          case "exists": {
            expect(
              await storage.exists(
                createHasContext(command.key, { signal }) as IStorage.ExistsContext,
              ),
            ).toBe(model.has(command.key));
            break;
          }

          case "delete": {
            // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
            if (model.has(command.key)) {
              await storage.delete(
                createDeleteContext(command.key, { signal }) as IStorage.DeleteContext,
              );
              model.delete(command.key);
            } else {
              const error = await storage
                .delete(createDeleteContext(command.key, { signal }) as IStorage.DeleteContext)
                .catch((ex: unknown) => ex);
              expect(error).toBeInstanceOf(DOMException);
              expect((error as DOMException).name).toBe("NotFoundError");
            }

            break;
          }

          case "read": {
            // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
            if (model.has(command.key)) {
              expect(
                await storage.read(
                  createGetContext(command.key, { signal }) as IStorage.ReadContext,
                ),
              ).toStrictEqual(model.get(command.key));
            } else {
              const error = await storage
                .read(createGetContext(command.key, { signal }) as IStorage.ReadContext)
                .catch((ex: unknown) => ex);
              expect(error).toBeInstanceOf(DOMException);
              expect((error as DOMException).name).toBe("NotFoundError");
            }

            break;
          }

          case "clear": {
            await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
            model.clear();
            expect(storage.isOpen).toBe(true);
            break;
          }
        }
      }

      for (const key of KEYS) {
        expect(
          await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
        ).toBe(model.has(key));
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (model.has(key)) {
          expect(
            await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
          ).toStrictEqual(model.get(key));
        }
      }
    });
  });
});
