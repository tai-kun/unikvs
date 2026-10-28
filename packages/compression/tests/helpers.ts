import type { IMiddleware } from "@unikvs/core";
import { createNext, createDecodeContext, createEncodeContext } from "@unikvs/testing";

import type Compression from "../src/compression.js";

/**
 * テストで使用する対応フォーマットの一覧です。
 */
export const FORMATS = ["gzip", "deflate", "deflate-raw"] as const;

/**
 * バイト列を圧縮して返します。
 */
export async function encode(
  compression: Compression,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await compression.encode(
    c as IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * 圧縮されたバイト列を展開して返します。
 */
export async function decode(
  compression: Compression,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await compression.decode(
    c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}
