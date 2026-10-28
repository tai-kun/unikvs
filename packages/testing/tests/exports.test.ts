import { test, describe } from "vite-plus/test";

// oxlint-disable import/no-namespace
import { abortedSignal, captureThrown, captureRejection } from "../src/abort.js";
import {
  toHex,
  toText,
  bytesEqual,
  concatBytes,
  concatChunks,
  splitBySizes,
  splitIntoChunks,
  createAllByteValues,
  createPseudoRandomBytes,
} from "../src/bytes.js";
import {
  createNext,
  TestContext,
  createGetContext,
  createHasContext,
  createSetContext,
  createCopyContext,
  createMoveContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDecodeContext,
  createDeleteContext,
  createEncodeContext,
  createMapKeyContext,
  createRepairContext,
  createStreamContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "../src/context.js";
import * as index from "../src/index.js";
import { forCases, createRandom, forCasesAsync } from "../src/random.js";
import {
  readAll,
  pipeChunks,
  sourceFrom,
  pumpThrough,
  collectBytes,
  runTransform,
  collectChunks,
  sourceFromValues,
} from "../src/streams.js";

describe("index のエクスポート", () => {
  test("ヘルパーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
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
    expect(index.TestContext).toBe(TestContext);
    expect(index.createOpenContext).toBe(createOpenContext);
    expect(index.createCloseContext).toBe(createCloseContext);
    expect(index.createSetContext).toBe(createSetContext);
    expect(index.createCopyContext).toBe(createCopyContext);
    expect(index.createMoveContext).toBe(createMoveContext);
    expect(index.createRepairContext).toBe(createRepairContext);
    expect(index.createGetContext).toBe(createGetContext);
    expect(index.createStreamContext).toBe(createStreamContext);
    expect(index.createHasContext).toBe(createHasContext);
    expect(index.createDeleteContext).toBe(createDeleteContext);
    expect(index.createClearContext).toBe(createClearContext);
    expect(index.createMapKeyContext).toBe(createMapKeyContext);
    expect(index.createEncodeContext).toBe(createEncodeContext);
    expect(index.createDecodeContext).toBe(createDecodeContext);
    expect(index.createEncodeStreamContext).toBe(createEncodeStreamContext);
    expect(index.createDecodeStreamContext).toBe(createDecodeStreamContext);
    expect(index.createNext).toBe(createNext);
  });
});
