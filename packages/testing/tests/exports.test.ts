import { describe, test } from "vitest";

import { abortedSignal, captureRejection, captureThrown } from "../src/abort.js";
import {
  bytesEqual,
  concatBytes,
  concatChunks,
  createAllByteValues,
  createPseudoRandomBytes,
  splitBySizes,
  splitIntoChunks,
  toHex,
  toText,
} from "../src/bytes.js";
import * as index from "../src/index.js";
import { createRandom, forCases, forCasesAsync } from "../src/random.js";
import {
  collectBytes,
  collectChunks,
  pipeChunks,
  pumpThrough,
  readAll,
  runTransform,
  sourceFrom,
  sourceFromValues,
} from "../src/streams.js";

describe("index のエクスポート", () => {
  test("ヘルパーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.createRandom).toBe(createRandom);
    expect(index.forCases).toBe(forCases);
    expect(index.forCasesAsync).toBe(forCasesAsync);
    expect(index.concatBytes).toBe(concatBytes);
    expect(index.concatChunks).toBe(concatChunks);
    expect(index.bytesEqual).toBe(bytesEqual);
    expect(index.createAllByteValues).toBe(createAllByteValues);
    expect(index.createPseudoRandomBytes).toBe(createPseudoRandomBytes);
    expect(index.toHex).toBe(toHex);
    expect(index.toText).toBe(toText);
    expect(index.splitIntoChunks).toBe(splitIntoChunks);
    expect(index.splitBySizes).toBe(splitBySizes);
    expect(index.sourceFrom).toBe(sourceFrom);
    expect(index.sourceFromValues).toBe(sourceFromValues);
    expect(index.readAll).toBe(readAll);
    expect(index.collectBytes).toBe(collectBytes);
    expect(index.collectChunks).toBe(collectChunks);
    expect(index.pipeChunks).toBe(pipeChunks);
    expect(index.pumpThrough).toBe(pumpThrough);
    expect(index.runTransform).toBe(runTransform);
    expect(index.captureRejection).toBe(captureRejection);
    expect(index.captureThrown).toBe(captureThrown);
    expect(index.abortedSignal).toBe(abortedSignal);
  });
});
