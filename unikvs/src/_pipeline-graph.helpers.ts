import { type IReadableStream, type ITransformContext } from "@unikvs/core";

import {
  type DecodeContext,
  type EncodeContext,
  type DecodeStreamContext,
  type EncodeStreamContext,
  MapKeyContext,
} from "./_contexts.js";
import type UniKvsMiddleware from "./_middleware.js";
import type {
  PipelineLeaf,
  PipelineNode,
  PipelineEntry,
  OperationScope,
  IActiveLeafChecker,
} from "./_pipeline-graph.types.js";
import { ReadableStreamSchema } from "./_streams.schemas.js";
import * as v from "./_valibot.js";
import {
  MiddlewareNextNotCalledError,
  MiddlewareNextNotAwaitedError,
  MiddlewareDestinationFrozenError,
  MiddlewareDestinationMissingError,
  MiddlewareNextCalledMultipleTimesError,
} from "./errors.js";

/**
 * `next()` と `destination` の規約違反を表すエラーの共用型です。
 */
export type MiddlewareContractError =
  | MiddlewareNextCalledMultipleTimesError
  | MiddlewareNextNotAwaitedError
  | MiddlewareNextNotCalledError
  | MiddlewareDestinationMissingError
  | MiddlewareDestinationFrozenError;

/**
 * `next()` と `destination` の規約違反かどうかを判定します。
 *
 * @param ex 判定する例外です。
 *
 * @returns 規約違反の場合は `true` を返します。
 */
export function isMiddlewareContractError(ex: unknown): ex is MiddlewareContractError {
  return (
    ex instanceof MiddlewareNextCalledMultipleTimesError ||
    ex instanceof MiddlewareNextNotAwaitedError ||
    ex instanceof MiddlewareNextNotCalledError ||
    ex instanceof MiddlewareDestinationMissingError ||
    ex instanceof MiddlewareDestinationFrozenError
  );
}

/**
 * 操作内で発生したミドルウェアの規約違反を保持します。
 *
 * 規約違反は、上流のミドルウェアが下流の拒否を握り潰しても操作全体を失敗させる必要があります。
 * そのため、各境界で最初の規約違反を記録し、ミドルウェアから戻った時点で再び投げます。
 */
export class MiddlewareContractTracker {
  /**
   * 最初に記録された規約違反です。
   */
  #error: MiddlewareContractError | undefined;

  /**
   * 規約違反を記録します。最初の 1 件だけを保持します。
   *
   * @param ex 記録する例外です。
   */
  public record(ex: unknown): void {
    if (this.#error === undefined && isMiddlewareContractError(ex)) {
      this.#error = ex;
    }
  }

  /**
   * 記録された規約違反があれば投げます。
   */
  public throwIfViolated(): void {
    if (this.#error !== undefined) {
      throw this.#error;
    }
  }
}

/**
 * 対象判定に通る葉だけを登録順に絞ります。
 *
 * 全葉が対象なら複製せず `node.allLeaves` を返します。
 *
 * @param node 対象の節です。
 * @param isActive 書き込み対象とする葉を判定します。
 *
 * @returns 対象の葉を登録順に返します。
 */
export function activeLeavesOf(
  node: PipelineNode,
  isActive: IActiveLeafChecker,
): readonly PipelineLeaf[] {
  const active = node.allLeaves.filter(isActive);

  if (active.length === node.allLeaves.length) {
    return node.allLeaves;
  }

  return active;
}

/**
 * 葉と節を登録順に並べた静的な項目列を作成します。
 *
 * 各操作の走査はこの並びをそのまま読みます。
 * 並べ替え用の順序は項目に保持せず、作成時のローカル変数で解決します。
 *
 * @param leaves この節で終端する葉です。
 * @param children 子の節です。
 *
 * @returns 登録順に並べた項目列を返します。
 */
export function createEntries(
  leaves: readonly PipelineLeaf[],
  children: readonly PipelineNode[],
): PipelineEntry[] {
  return [
    ...leaves.map((leaf) => ({
      entry: {
        kind: "leaf" as const,
        leaf,
      },
      order: leaf.index,
    })),
    ...children.map((child) => {
      const [firstLeaf] = child.allLeaves;

      if (firstLeaf === undefined) {
        throw new Error("子節に葉が存在しません。");
      }

      return {
        entry: {
          kind: "node" as const,
          node: child,
        },
        order: firstLeaf.index,
      };
    }),
  ]
    .toSorted((a, b) => a.order - b.order)
    .map((item) => item.entry);
}

/**
 * 変換後のデータが設定されていることを検証し、変換後のデータを返します。
 *
 * ミドルウェアが `destination` を設定しなかったときに投げます。
 *
 * @param middleware 対象のミドルウェアです。
 * @param ctx 検証するコンテキストです。
 * @param operation エラーに付与する操作名です。
 *
 * @returns 変換後のデータを返します。
 */
export function requireDestination(
  middleware: UniKvsMiddleware,
  ctx: EncodeContext | DecodeContext | EncodeStreamContext | DecodeStreamContext,
  operation: "encode" | "decode",
): unknown {
  if ("destination" in ctx) {
    return ctx.destination;
  }

  throw new MiddlewareDestinationMissingError({
    name: middleware.name,
    operation,
  });
}

/**
 * 変換後のストリームが設定されていることを検証し、型を検証したストリームを返します。
 *
 * ミドルウェアが `destination` を設定しなかったときに投げます。
 * ストリームの場合は存在確認に加えて `ReadableStream` の型も検証します。
 *
 * @param middleware 対象のミドルウェアです。
 * @param ctx 検証するコンテキストです。
 * @param operation エラーに付与する操作名です。
 *
 * @returns 変換後のストリームを返します。
 */
export function requireStreamDestination(
  middleware: UniKvsMiddleware,
  ctx: EncodeStreamContext | DecodeStreamContext,
  operation: "encode" | "decode",
): IReadableStream {
  const destination = requireDestination(middleware, ctx, operation);

  return v.parseOutput(ReadableStreamSchema, destination);
}

/**
 * コンテキストの `destination` を凍結します。
 *
 * パイプラインの `next` から同期的に呼び出します。
 * 凍結後の読み取りはできますが、書き込むと `MiddlewareDestinationFrozenError` を投げます。
 *
 * @param ctx 凍結するコンテキストです。
 */
export function freezeDestination(ctx: ITransformContext): void {
  const { destination } = ctx;
  Object.defineProperty(ctx, "destination", {
    get() {
      return destination;
    },
    set() {
      throw new MiddlewareDestinationFrozenError({
        key: ctx.key,
        action: ctx.action,
      });
    },
    enumerable: true,
    configurable: true,
  });
}

/**
 * 単一ミドルウェアの `mapKey` を実行します。
 *
 * 共有ストアを参照するため、カスタム変数の下流変更が写像にも見えます。
 *
 * @param middleware 対象のミドルウェアです。
 * @param key 写像前のキーです。
 * @param scope 操作共通の実行時情報です。
 *
 * @returns 写像後のキーを返します。
 */
export function applyMapKey(
  middleware: UniKvsMiddleware,
  key: string,
  scope: OperationScope,
): string {
  const c = new MapKeyContext({
    key,
    store: scope.store,
  });

  return middleware.mapKey(c);
}
