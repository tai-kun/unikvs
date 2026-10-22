import { applyMapKey } from "./_pipeline-graph.helpers.js";
import type {
  OperationScope,
  PipelineLeaf,
  PipelineNode,
  ResolvedLeaf,
} from "./_pipeline-graph.types.js";

/**
 * 単一操作のスコープで葉の写像キーを解決します。
 *
 * 新 `mapKey` は同期的であり、中断シグナルも受け付けないため、共有節の写像は操作内で 1 回だけ実行され、結果を使い回します。
 * 並行解決でも `Map` キャッシュにより重複しません (`resolve` 自体が同期的であるため、競合しません)。
 */
export class LeafResolver {
  /**
   * 根のキーです。
   */
  readonly #rootKey: string;

  /**
   * 操作共通の実行時情報です (共有ストアを含みます)。
   */
  readonly #scope: OperationScope;

  /**
   * 節ごとの解決結果のキャッシュです。
   */
  readonly #nodeCache: Map<PipelineNode, string>;

  /**
   * 通常は `PipelineGraph.createResolver` から生成します。
   *
   * @param scope 操作共通の実行時情報です。
   */
  public constructor(scope: OperationScope) {
    this.#rootKey = scope.key;
    this.#scope = scope;
    this.#nodeCache = new Map();
  }

  /**
   * 葉の写像キーを解決します。
   *
   * @param leaf 解決する葉です。
   * @returns 解決済みの葉を返します。
   */
  public resolve(leaf: PipelineLeaf): ResolvedLeaf {
    let key = this.#rootKey;

    for (const node of leaf.path) {
      const cached = this.#nodeCache.get(node);
      if (cached !== undefined) {
        key = cached;
        continue;
      }

      const mapped = applyMapKey(node.middleware, key, this.#scope);
      this.#nodeCache.set(node, mapped);
      key = mapped;
    }

    return { key, leaf };
  }
}
