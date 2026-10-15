import type { IMiddleware } from "@unikvs/core";
import {
  bytesEqual,
  createDecodeContext,
  createEncodeContext,
  createNext,
  createOpenContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { ZstdWasmInvalidLevelError } from "../src/errors.js";
import ZstdWasm, { type ZstdWasmOptions } from "../src/zstd-wasm.js";

type ByteEncode = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
type ByteDecode = IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

/**
 * ターゲットを開きます。
 */
async function openTarget(target: ZstdWasm, signal: AbortSignal): Promise<void> {
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
}

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  target: ZstdWasm,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await target.encode(c as ByteEncode, createNext());

  return c.destination;
}

/**
 * 圧縮されたバイト列を展開して返します。
 */
async function decode(
  target: ZstdWasm,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await target.decode(c as ByteDecode, createNext());

  return c.destination;
}

describe("コンストラクターオプション", () => {
  test("空のオプションでは既定と等価に往復できる", async ({ expect, signal }) => {
    // 準備
    const options: ZstdWasmOptions = {};
    const target = new ZstdWasm(options);
    await openTarget(target, signal);
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行
    const decoded = await decode(target, await encode(target, input));

    // 検証
    expect(decoded).toStrictEqual(input);
    expect(target.name).toBe("ZstdWasm");
  });

  test("level の既定は 3 であり明示 3 と等価である", async ({ expect, signal }) => {
    // 準備
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const omittedTarget = new ZstdWasm();
    const explicitTarget = new ZstdWasm({ level: 3 });
    await openTarget(omittedTarget, signal);
    await openTarget(explicitTarget, signal);

    // 実行
    const omitted = await encode(omittedTarget, input);
    const explicit = await encode(explicitTarget, input);

    // 検証
    expect(bytesEqual(omitted, explicit)).toBe(true);
  });

  test("level 省略と undefined 明示は等価である", async ({ expect, signal }) => {
    // 準備
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const omittedTarget = new ZstdWasm();
    const undefinedTarget = new ZstdWasm({ level: undefined });
    await openTarget(omittedTarget, signal);
    await openTarget(undefinedTarget, signal);

    // 実行
    const omitted = await encode(omittedTarget, input);
    const undefinedLevel = await encode(undefinedTarget, input);

    // 検証
    expect(bytesEqual(omitted, undefinedLevel)).toBe(true);
  });

  test("level に null を明示すると ZstdWasmInvalidLevelError で拒否される", ({ expect }) => {
    // 実行と検証
    // 実装は規定値への吸収に null を含めず、無効値として拒否する。
    expect(
      () =>
        new ZstdWasm({
          level: null as unknown as ZstdWasmOptions["level"],
        }),
    ).toThrow(ZstdWasmInvalidLevelError);
  });

  test("level を上書きすると往復できる", async ({ expect, signal }) => {
    // 準備
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行と検証
    for (const level of [1, 22]) {
      const target = new ZstdWasm({ level });
      await openTarget(target, signal);
      const decoded = await decode(target, await encode(target, input));
      expect(decoded, `level=${level}`).toStrictEqual(input);
    }
  });
});
