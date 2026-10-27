import type UniKvsMiddleware from "./_middleware.js";
import type UniKvsStorage from "./_storage.js";
import type { IUniKvsBranch } from "./unikvs-branch.js";

/**
 * `fork` で親に引き継がれる分岐先の情報です。
 */
type BranchDestination = {
  /**
   * データの永続化先です。
   */
  readonly storage: UniKvsStorage;

  /**
   * ストレージに対するパイプラインです。
   * 登録順に保持します。
   */
  readonly middlewares: readonly UniKvsMiddleware[];
};

/**
 * `UniKvsBranch` のインスタンスごとの内部状態です。
 * ネイティブの `#` フィールドの代わりに `WeakMap` に保持することで、別モジュールの `UniKvsBuilder` から内部アクセサー経由で参照できます。
 * `branchStates` 自体は外部に公開しません。
 */
export type BranchState = {
  /**
   * 自前の相対パイプラインです。
   * 登録順に保持します。
   */
  readonly middlewares: UniKvsMiddleware[];

  /**
   * 自前の分岐先と各登録時点の相対パイプラインのスナップショットです。
   */
  readonly destinations: BranchDestination[];

  /**
   * ストレージに到達しない分岐を取り込んだかどうかです。
   * fork 時点の状態を保持します。
   */
  hasInvalidFork: boolean;
};

/**
 * インスタンスと内部状態の対応表です。
 * コンパイラーによる `#` フィールドのダウンレベルと同様に、`WeakMap` をブランド兼ストレージとして使います。
 */
export const branchStates: WeakMap<IUniKvsBranch, BranchState> = /* #__PURE__ */ new WeakMap<
  IUniKvsBranch,
  BranchState
>();

/**
 * 分岐先を親の接頭辞付きで追加し、分岐がストレージに到達するかどうかを返します。
 *
 * `new Branch()` で作成された分岐以外の値が渡されたときは例外を投げます。
 * 外部からは使用しません。
 *
 * @param destinations 追加先の分岐先列です。
 * @param prefix 親のミドルウェア列です。
 * @param branch 追加する分岐です。
 *
 * @returns 分岐先が 1 件以上あり、取り込んだ分岐がすべて有効なら `true` を返します。
 */
export function appendForkDestinations(
  destinations: BranchDestination[],
  prefix: readonly UniKvsMiddleware[],
  branch: IUniKvsBranch,
): boolean {
  const state = branchStates.get(branch);

  if (!state) {
    throw new TypeError("fork() expects a branch created by new Branch().");
  }

  const prefixSnapshot = [...prefix];

  for (const dest of state.destinations) {
    destinations.push({
      storage: dest.storage,
      // コピーして追加します。親の fork で接頭辞を付けても、元の分岐は変更されません。
      // fork 時点の親チェーンを接頭辞として各分岐先の先頭に付け、ブランチのミドルウェアを結合します。
      middlewares: [...prefixSnapshot, ...dest.middlewares],
    });
  }

  return state.destinations.length > 0 && !state.hasInvalidFork;
}
