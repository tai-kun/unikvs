import { describe } from "vitest";

import { readAll, test } from "./_helpers.js";
import { type Random, forCasesAsync } from "./_random.js";

const SEED = 20_260_930;
const CASE_COUNT = 30;

const KEYS = ["a.bin", "b.bin", "c.bin"] as const;

type Command =
  | { readonly type: "write"; readonly key: string; readonly data: Uint8Array<ArrayBuffer> }
  | { readonly type: "read" | "delete" | "exists"; readonly key: string }
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
      type: "write",
      key: random.pick(KEYS),
      data: random.bytes(random.int(0, 256)),
    };
  }

  if (kind === 1) {
    return {
      type: random.pick(["read", "delete", "exists"] as const),
      key: random.pick(KEYS),
    };
  }

  return { type: "clear" };
}

describe("決定的ファズテストの振る舞い", () => {
  test("固定シードの任意のキーとバイト列の write→read が往復する", async ({ expect, storage }) => {
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      // 準備
      const key = randomKey(random);
      const data = random.bytes(random.int(0, 4096));

      // 実行
      await storage.write({ key, data });
      const loaded = await storage.read({ key });

      // 検証
      expect(loaded).toStrictEqual(data);
    });
  });

  test("固定シードの任意のチャンク分割でストリームへ書き込んだ内容が読み取りと一致する", async ({
    expect,
    storage,
  }) => {
    await forCasesAsync(SEED + 1, CASE_COUNT, async (random) => {
      // 準備
      const key = randomKey(random);
      const data = random.bytes(random.int(0, 4096));
      const chunkSizes = random.array(random.int(1, 10), () => random.int(1, 1000));
      const writable = await storage.getWritable({ key });
      const writer = writable.getWriter();

      // 実行
      let offset = 0;
      let index = 0;
      while (offset < data.length) {
        const size = Math.min(chunkSizes[index % chunkSizes.length]!, data.length - offset);
        await writer.write(data.subarray(offset, offset + size));
        offset += size;
        index++;
      }

      await writer.close();
      const loaded = await readAll(await storage.getReadable({ key }));

      // 検証
      expect(loaded).toStrictEqual(data);
    });
  });

  test("固定シードの任意の操作列に対して Map モデルと同じ状態を保つ", async ({
    expect,
    storage,
  }) => {
    await forCasesAsync(SEED + 2, CASE_COUNT, async (random) => {
      // 準備: 実行ごとに独立させるため、前の実行の状態を消去します。
      await storage.clear();
      const model = new Map<string, Uint8Array<ArrayBuffer>>();
      const commands = random.array(random.int(1, 20), () => randomCommand(random));

      // 実行と検証
      for (const command of commands) {
        switch (command.type) {
          case "write": {
            await storage.write({ key: command.key, data: command.data });
            model.set(command.key, command.data);
            break;
          }
          case "exists": {
            expect(await storage.exists({ key: command.key })).toBe(model.has(command.key));
            break;
          }
          case "delete": {
            if (model.has(command.key)) {
              await storage.delete({ key: command.key });
              model.delete(command.key);
            } else {
              const error = await storage.delete({ key: command.key }).catch((ex: unknown) => ex);
              expect(error).toBeInstanceOf(DOMException);
              expect((error as DOMException).name).toBe("NotFoundError");
            }

            break;
          }
          case "read": {
            if (model.has(command.key)) {
              expect(await storage.read({ key: command.key })).toStrictEqual(
                model.get(command.key),
              );
            } else {
              const error = await storage.read({ key: command.key }).catch((ex: unknown) => ex);
              expect(error).toBeInstanceOf(DOMException);
              expect((error as DOMException).name).toBe("NotFoundError");
            }

            break;
          }
          case "clear": {
            await storage.clear();
            model.clear();
            expect(storage.isOpen).toBe(true);
            break;
          }
        }
      }

      for (const key of KEYS) {
        expect(await storage.exists({ key })).toBe(model.has(key));
        if (model.has(key)) {
          expect(await storage.read({ key })).toStrictEqual(model.get(key));
        }
      }
    });
  });
});
