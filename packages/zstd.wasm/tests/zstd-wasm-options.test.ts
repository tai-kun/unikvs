import { describe, test } from "vitest";

import ZstdWasm, { type ZstdWasmOptions } from "../src/zstd-wasm.js";
import { bytesEqual } from "./helpers.js";

/**
 * 中断されていないシグナルを作成します。
 */
function createSignal(): AbortSignal {
  return new AbortController().signal;
}

describe("コンストラクターオプション", () => {
  test("空のオプションでは既定と等価に往復できる", async ({ expect }) => {
    // 準備
    const options: ZstdWasmOptions = {};
    const target = new ZstdWasm(options);
    await target.open({ signal: createSignal() });
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行
    const decoded = await target.decode({ data: await target.encode({ data: input }) });

    // 検証
    expect(decoded).toStrictEqual(input);
    expect(target.name).toBe("ZstdWasm");
  });

  test("level の既定は 3 であり明示 3 と等価である", async ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const omittedTarget = new ZstdWasm();
    const explicitTarget = new ZstdWasm({ level: 3 });
    await omittedTarget.open({ signal: createSignal() });
    await explicitTarget.open({ signal: createSignal() });

    // 実行
    const omitted = await omittedTarget.encode({ data: input });
    const explicit = await explicitTarget.encode({ data: input });

    // 検証
    expect(bytesEqual(omitted, explicit)).toBe(true);
  });

  test("level 省略と undefined 明示は等価である", async ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const omittedTarget = new ZstdWasm();
    const undefinedTarget = new ZstdWasm({ level: undefined });
    await omittedTarget.open({ signal: createSignal() });
    await undefinedTarget.open({ signal: createSignal() });

    // 実行
    const omitted = await omittedTarget.encode({ data: input });
    const undefinedLevel = await undefinedTarget.encode({ data: input });

    // 検証
    expect(bytesEqual(omitted, undefinedLevel)).toBe(true);
  });

  test("level に null を明示すると既定 3 に吸収される", async ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const omittedTarget = new ZstdWasm();
    const nulledTarget = new ZstdWasm({
      level: null as unknown as ZstdWasmOptions["level"],
    });
    await omittedTarget.open({ signal: createSignal() });
    await nulledTarget.open({ signal: createSignal() });

    // 実行
    const omitted = await omittedTarget.encode({ data: input });
    const nulled = await nulledTarget.encode({ data: input });

    // 検証
    expect(bytesEqual(omitted, nulled)).toBe(true);
  });

  test("level を上書きすると往復できる", async ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行と検証
    for (const level of [1, 22]) {
      const target = new ZstdWasm({ level });
      await target.open({ signal: createSignal() });
      const decoded = await target.decode({ data: await target.encode({ data: input }) });
      expect(decoded, `level=${level}`).toStrictEqual(input);
    }
  });
});
