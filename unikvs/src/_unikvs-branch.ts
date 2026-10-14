import type UniKvsStorage from "./_storage.js";
import type UniKvsTransformer from "./_transformer.js";
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
  readonly transformers: readonly UniKvsTransformer[];
};

/**
 * `UniKvsBranch` のインスタンスごとの内部状態です。
 * ネイティブの `#` フィールドの代わりに `WeakMap` に保持することで、別モジュールの `UniKvsConfig` から内部アクセサー経由で参照できます。
 * `branchStates` 自体は外部に公開しません。
 */
type BranchState = {
  /**
   * 自前の相対パイプラインです。
   * 登録順に保持します。
   */
  readonly transformers: UniKvsTransformer[];

  /**
   * 自前の分岐先と各登録時点の相対パイプラインのスナップショットです。
   */
  readonly destinations: BranchDestination[];
};

/**
 * インスタンスと内部状態の対応表です。
 * コンパイラーによる `#` フィールドのダウンレベルと同様に、`WeakMap` をブランド兼ストレージとして使います。
 */
export const branchStates = /*#__PURE__*/ new WeakMap<IUniKvsBranch, BranchState>();

/**
 * 分岐先のスナップショットを返します。
 *
 * 親の `fork` で接頭辞付加するために使用します。
 * `UniKvs.branch()` で作成された分岐以外の値が渡されたときは例外を投げます。
 * 外部からは使用しません。
 *
 * @param branch スナップショットを取得する分岐です。
 * @returns 分岐先のコピーを返します。
 */
export function getBranchDestinationsForFork(branch: IUniKvsBranch): BranchDestination[] {
  const state = branchStates.get(branch);
  if (!state) {
    throw new TypeError("fork() expects a branch created by UniKvs.branch().");
  }

  // コピーを返します。親の fork で接頭辞を付けても、元の分岐は変更されません。
  return state.destinations.map((dest) => ({
    storage: dest.storage,
    transformers: [...dest.transformers],
  }));
}
