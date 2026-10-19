import { Memory } from "@unikvs/memory";
import { UniKvs, type PlainValue, type StreamValue } from "unikvs";

import KeyPrefix, { type KeyPrefixOptions } from "../src/key-prefix.js";

/**
 * 統合テストで使うキーと値の対応です。
 * 論理キーと物理キーの対応の検証に使用します。
 */
export type TestMapping = {
  k1: PlainValue<string>;
  k2: PlainValue<string>;
  logs: StreamValue<Uint8Array<ArrayBuffer>>;
};

/**
 * ValueStream の全チャンクを順に収集して返します。
 * ストリーム経路の物理キーの検証に使用します。
 */
export async function collectValueBytes(
  stream: AsyncIterable<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>[]> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * 指定したプレフィックスの KeyPrefix を適用したクライアントを作成します。
 * Memory 実体への物理キーの書き込みの検証に使用します。
 */
export async function createPrefixedKvs(prefix: string, options?: KeyPrefixOptions) {
  const storage = new Memory();
  const kvs = UniKvs.config<TestMapping>()
    .use(new KeyPrefix(prefix, options))
    .persist(storage)
    .create();
  await kvs.open();

  return { kvs, storage };
}
