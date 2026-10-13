import {
  type Variables,
  type IEncodable,
  type IReadableStream,
  RepairNotAllowedError,
} from "@unikvs/core";
import { toAbortPromise } from "abort-signal-utils";
import { callAbortableFnOnce } from "call-fn-once";

import { logger, repairLogger } from "./_logger.js";
import type UniKvsStorage from "./_storage.js";
import { cancelStreams } from "./_streams.js";
import type UniKvsTransformer from "./_transformer.js";

// -------------------------------------------------------------------------------------------------
//
// 型定義
//
// -------------------------------------------------------------------------------------------------

/**
 * パイプラインの葉となる宛先です。
 */
export type PipelineLeaf = {
  /**
   * データの永続化先です。
   */
  readonly storage: UniKvsStorage;

  /**
   * 宛先の登録順 (0 起点) です。
   */
  readonly index: number;

  /**
   * ストレージ名のキャッシュです。
   */
  readonly name: string;

  /**
   * 経路上に `AllowRepair` が存在するかどうかです。
   */
  readonly canRepair: boolean;

  /**
   * 葉 1 件分の凍結された名前空間です。
   */
  readonly nameNames: readonly string[];

  /**
   * 根直下から葉の直前までのノード列です。
   * グラフ自身の走査と内部単体テスト専用です。
   *
   * @internal
   */
  readonly path: readonly PipelineNode[];
};

/**
 * パイプラインの節となるトランスフォーマーです。
 */
type PipelineNode = {
  /**
   * 節を構成するトランスフォーマーです。
   */
  readonly transformer: UniKvsTransformer;

  /**
   * この節で終端する葉です。
   * 登録順に保持します。
   */
  readonly leaves: readonly PipelineLeaf[];

  /**
   * 子の節です。
   * 登録順に保持します。
   */
  readonly children: readonly PipelineNode[];

  /**
   * 直下の葉と節を登録順に列挙した静的な項目列です。
   */
  readonly entries: readonly PipelineEntry[];

  /**
   * 部分木の全葉です。
   * 登録順に保持します。
   */
  readonly allLeaves: readonly PipelineLeaf[];

  /**
   * 部分木の全葉名です。
   * 凍結されています。
   */
  readonly leafNames: readonly string[];
};

/**
 * 節または葉を登録順に列挙するための項目です。
 */
type PipelineEntry =
  | {
      /**
       * 葉であることを示します。
       */
      readonly kind: "leaf";

      /**
       * 対象の葉です。
       */
      readonly leaf: PipelineLeaf;
    }
  | {
      /**
       * 節であることを示します。
       */
      readonly kind: "node";

      /**
       * 対象の節です。
       */
      readonly node: PipelineNode;
    };

/**
 * コンパイル前の宛先定義です。
 */
type PipelineDestination = {
  /**
   * データの永続化先です。
   */
  readonly storage: UniKvsStorage;

  /**
   * 適用順のトランスフォーマー列です。末尾未使用分は含みません。
   */
  readonly transformers: readonly UniKvsTransformer[];
};

/**
 * 葉へ書き込むためのエンコード結果です。
 */
type EncodeTarget = {
  /**
   * 対象の葉です。
   */
  readonly leaf: PipelineLeaf;

  /**
   * エンコード済みのデータです。
   */
  readonly data: unknown;

  /**
   * 葉用に派生した vars です。
   */
  readonly vars: Variables;

  /**
   * 写像済みのキーです。
   */
  readonly key: string;
};

/**
 * 解決済みの葉です。
 */
export type ResolvedLeaf = {
  /**
   * 対象の葉です。
   */
  readonly leaf: PipelineLeaf;

  /**
   * 葉用に派生した vars です。
   */
  readonly vars: Variables;

  /**
   * 写像済みのキーです。
   */
  readonly key: string;
};

/**
 * ストリームのエンコード先となる葉です。
 */
export type StreamEncodeTarget = {
  /**
   * 対象の葉です。
   */
  readonly leaf: PipelineLeaf;

  /**
   * 葉へ書き込むストリームです。
   */
  readonly stream: IReadableStream;

  /**
   * 葉用に派生した vars です。
   */
  readonly vars: Variables;

  /**
   * 写像済みのキーです。
   */
  readonly key: string;
};

/**
 * 構築済みのストリームエンコード木です。
 */
type StreamEncodeTree = {
  /**
   * 登録順の書き込み対象です。
   */
  readonly targets: StreamEncodeTarget[];

  /**
   * 読み取り側へ渡すストリームです。`splitRead` を指定したときだけ分岐後の読み取り側になります。
   */
  readonly readStream: IReadableStream;
};

/**
 * 書き込み対象とする葉を判定する関数です。
 */
interface IActiveLeafChecker {
  /**
   * 書き込み対象とする葉を判定します。
   *
   * @param leaf 対象の葉です。
   * @returns 判定結果です。
   */
  (leaf: PipelineLeaf): boolean;
}

/**
 * 節の `getEncodable` または `mapKey` が失敗したときの処理を行う関数です。
 */
interface IEncodeNodeErrorHandler {
  /**
   * 節の `getEncodable` または `mapKey` が失敗したときの処理です。
   *
   * `true` を返すと節の部分木をスキップします。
   * 例外を投げた場合はそのまま伝播します。
   *
   * @param ex 節の取得または写像で発生した例外です。
   * @param activeLeaves 節の配下で対象となる葉です。
   * @returns 部分木をスキップする場合は `true` を返します。
   */
  (ex: unknown, activeLeaves: readonly PipelineLeaf[]): boolean;
}

/**
 * ストリームエンコード木の構築オプションです。
 */
type BuildEncodeTreeOptions = {
  /**
   * 書き込み対象とする葉を判定します。省略時は全葉が対象です。
   */
  readonly isActive?: IActiveLeafChecker | undefined;

  /**
   * 読み取り側と書き込み側を分岐するかどうかです。書き戻しで使用します。
   */
  readonly splitRead?: boolean | undefined;

  /**
   * 節のセットアップ失敗を分類します。省略時は生の例外として伝播します。
   */
  readonly onNodeError?: IEncodeNodeErrorHandler | undefined;
};

// -------------------------------------------------------------------------------------------------
//
// ヘルパー
//
// -------------------------------------------------------------------------------------------------

/**
 * コンパイル中の節です。フィールドは finalize で確定します。
 */
type MutableNode = {
  /**
   * 節を構成するトランスフォーマーです。
   */
  readonly transformer: UniKvsTransformer;

  /**
   * この節で終端する葉です。登録順に保持します。
   */
  readonly leaves: PipelineLeaf[];

  /**
   * 子の節です。登録順に保持します。
   */
  readonly children: MutableNode[];

  /**
   * 直下の葉と節を登録順に列挙した項目列です。finalize で確定します。
   */
  entries: readonly PipelineEntry[];

  /**
   * 部分木の全葉です。登録順に保持します。finalize で確定します。
   */
  allLeaves: readonly PipelineLeaf[];

  /**
   * 部分木の全葉名です。finalize で確定します。
   */
  leafNames: readonly string[];
};

/**
 * 解決途中の節の状態です。
 */
type ResolvedNode = {
  /**
   * 節の名前空間を反映した vars です。
   */
  readonly vars: Variables;

  /**
   * 節の配下の葉名です。
   */
  readonly names: readonly string[];

  /**
   * 節で写像したキーです。
   */
  readonly key: string;
};

/**
 * 親の vars から葉名の名簿を反映した vars を派生します。
 *
 * 名前配列が親と同一なら複製しません。
 * 名前が変わる境界でのみ複製します。名簿は凍結配列のまま読み取り専用で付与します。
 *
 * @param parent 派生元の vars です。
 * @param names 付与する名簿です。
 * @param parentNames 親に付与済みの名簿です。
 * @returns 派生した vars を返します。同一名簿の場合は親をそのまま返します。
 */
function deriveVars(
  parent: Variables,
  names: readonly string[],
  parentNames: readonly string[] | undefined,
): Variables {
  if (names === parentNames) {
    return parent;
  }

  // 複製時の上書きは読み取り専用を迂回するため、親が読み取り専用でも差し替えられます。
  const cloned = parent.clone({
    "unikvs:storageNames": names,
  });
  if (!cloned.isReadonly("unikvs:storageNames")) {
    cloned.setReadonly("unikvs:storageNames", names);
  }

  return cloned;
}

/**
 * 対象判定に通る葉だけを登録順に絞ります。
 *
 * 全葉が対象なら複製せず `node.allLeaves` を返します。
 *
 * @param node 対象の節です。
 * @param isActive 書き込み対象とする葉を判定します。
 * @returns 対象の葉を登録順に返します。
 */
function activeLeavesOf(node: PipelineNode, isActive: IActiveLeafChecker): readonly PipelineLeaf[] {
  const active = node.allLeaves.filter(isActive);
  if (active.length === node.allLeaves.length) {
    return node.allLeaves;
  }

  return active;
}

/**
 * 葉の列に対応する名前空間を返します。
 *
 * 単一葉では凍結済み名簿をそのまま共有します。
 *
 * @param leaves 対象の葉の列です。
 * @returns 葉の列に対応する名簿を返します。
 */
function activeLeafNames(leaves: readonly PipelineLeaf[]): readonly string[] {
  if (leaves.length === 1) {
    return leaves[0]!.nameNames;
  }

  return Object.freeze(leaves.map((leaf) => leaf.name));
}

/**
 * 葉と節を登録順に並べた静的な項目列を作成します。
 *
 * 各操作の走査はこの並びをそのまま読みます。
 * 並べ替え用の順序は項目に保持せず、作成時のローカル変数で解決します。
 *
 * @param leaves この節で終端する葉です。
 * @param children 子の節です。
 * @returns 登録順に並べた項目列を返します。
 */
function createEntries(
  leaves: readonly PipelineLeaf[],
  children: readonly PipelineNode[],
): PipelineEntry[] {
  return [
    ...leaves.map((leaf) => ({
      order: leaf.index,
      entry: {
        kind: "leaf" as const,
        leaf,
      },
    })),
    ...children.map((child) => ({
      order: child.allLeaves[0]!.index,
      entry: {
        kind: "node" as const,
        node: child,
      },
    })),
  ]
    .toSorted((a, b) => a.order - b.order)
    .map((item) => item.entry);
}

/**
 * 計画段階で確定した葉です。
 */
type PlannedLeaf = {
  /**
   * 対象の葉です。
   */
  readonly leaf: PipelineLeaf;

  /**
   * 葉用に派生した vars です。
   */
  readonly vars: Variables;

  /**
   * 写像済みのキーです。
   */
  readonly key: string;
};

/**
 * 計画段階で確定した節です。
 */
type PlannedNode = {
  /**
   * 節のエンコード処理です。
   */
  readonly encodable: IEncodable;

  /**
   * 直下の分岐を登録順に並べた項目列です。
   */
  readonly entries: readonly GraphEntry[];
};

/**
 * ストリームグラフの分岐の割り当てに使用する項目です。
 */
type GraphEntry =
  | {
      /**
       * 葉であることを示します。
       */
      readonly kind: "leaf";

      /**
       * 確定済みの葉です。
       */
      readonly leaf: PlannedLeaf;
    }
  | {
      /**
       * 節であることを示します。
       */
      readonly kind: "node";

      /**
       * 確定済みの節です。
       */
      readonly node: PlannedNode;
    };

/**
 * 計画段階で節 1 件を確定します。
 *
 * ストリームはまだ作らず、encodable とキーだけを確保します。
 * 対象葉を含まない節は null を返し、呼び出し側がその分岐を除去します。
 *
 * @param node 確定する節です。
 * @param parentVars 親から継承した vars です。
 * @param parentNames 親に付与済みの名簿です。
 * @param parentKey 親から継承したキーです。
 * @param isActive 書き込み対象とする葉を判定します。省略時は全葉が対象です。
 * @param signal 中断シグナルです。
 * @param onNodeError 節のセットアップ失敗を分類します。省略時は生の例外として伝播します。
 * @returns 確定した節を返します。対象葉を含まない場合は null を返します。
 */
async function planNode(
  node: PipelineNode,
  parentVars: Variables,
  parentNames: readonly string[] | undefined,
  parentKey: string,
  isActive: IActiveLeafChecker | undefined,
  signal: AbortSignal,
  onNodeError: IEncodeNodeErrorHandler | undefined,
): Promise<PlannedNode | null> {
  signal.throwIfAborted();

  const activeLeaves = isActive === undefined ? node.allLeaves : activeLeavesOf(node, isActive);
  if (activeLeaves.length === 0) {
    return null;
  }

  const names = activeLeaves === node.allLeaves ? node.leafNames : activeLeafNames(activeLeaves);
  const vars = deriveVars(parentVars, names, parentNames);
  let encodable: IEncodable;
  let key: string;

  try {
    encodable = await node.transformer.getEncodable(vars, signal);
    key = await node.transformer.mapKey(vars, signal, parentKey);
  } catch (ex) {
    if (onNodeError?.(ex, activeLeaves)) {
      return null;
    }

    throw ex;
  }

  const childPlans = new Map<PipelineNode, PlannedNode>();
  for (const child of node.children) {
    const planned = await planNode(child, vars, names, key, isActive, signal, onNodeError);
    if (planned !== null) {
      childPlans.set(child, planned);
    }
  }

  const leafPlans = new Map<PipelineLeaf, PlannedLeaf>();
  for (const leaf of node.leaves) {
    if (isActive !== undefined && !isActive(leaf)) {
      continue;
    }

    leafPlans.set(leaf, {
      leaf,
      vars: deriveVars(vars, leaf.nameNames, names),
      key,
    });
  }

  // 部分木全体がスキップされた節は、消費されないパイプと tee を作らないよう除去します。
  if (childPlans.size === 0 && leafPlans.size === 0) {
    return null;
  }

  const entries: GraphEntry[] = [];
  for (const entry of node.entries) {
    switch (entry.kind) {
      case "leaf": {
        const planned = leafPlans.get(entry.leaf);
        if (planned !== undefined) {
          entries.push({
            kind: "leaf",
            leaf: planned,
          });
        }

        break;
      }

      case "node": {
        const planned = childPlans.get(entry.node);
        if (planned !== undefined) {
          entries.push({
            kind: "node",
            node: planned,
          });
        }

        break;
      }

      default:
        entry satisfies never;
    }
  }

  return {
    entries,
    encodable,
  };
}

/**
 * 確定済みの計画から tee とパイプを構築して書き込み対象を収集します。
 *
 * 登録順に逐次チェーン tee で入力を分けます。
 * 最後の分岐は tee せず残りをそのまま使います。
 *
 * @param entries 割り当てる分岐の列です。
 * @param input 分岐元の入力ストリームです。
 * @param targets 書き込み対象を収集する列です。
 * @param streams 構築したストリームを収集する集合です。
 */
function buildGraph(
  entries: readonly GraphEntry[],
  input: IReadableStream,
  targets: StreamEncodeTarget[],
  streams: Set<IReadableStream>,
): void {
  const assigned: IReadableStream[] = [];

  let current = input;
  for (let i = 0; i < entries.length; i++) {
    if (i < entries.length - 1) {
      const [branch, rest] = current.tee();
      streams.add(branch);
      streams.add(rest);
      assigned.push(branch);
      current = rest;
    } else {
      assigned.push(current);
    }
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const stream = assigned[i]!;
    switch (entry.kind) {
      case "leaf":
        targets.push({
          ...entry.leaf,
          stream,
        });
        break;

      case "node": {
        const output = stream.pipeThrough(entry.node.encodable);
        streams.add(output);
        buildGraph(entry.node.entries, output, targets, streams);
        break;
      }

      default:
        entry satisfies never;
    }
  }
}

// -------------------------------------------------------------------------------------------------
//
// LeafResolver
//
// -------------------------------------------------------------------------------------------------

/**
 * 単一操作のスコープで葉の vars と写像キーを解決します。
 *
 * 共有節の `mapKey` は操作内で 1 回だけ実行されます。並行して解決されるときも進行中の Promise を共有するため、写像が重複しません。
 */
class LeafResolver {
  /**
   * 単一葉のグラフで根と共有する名前空間です。複数葉では undefined です。
   */
  readonly #rootParentNames: readonly string[] | undefined;

  /**
   * 根の vars です。
   */
  readonly #rootVars: Variables;

  /**
   * 根のキーです。
   */
  readonly #rootKey: string;

  /**
   * 中断シグナルです。
   */
  readonly #signal: AbortSignal;

  /**
   * 節ごとの解決結果のキャッシュです。進行中の Promise を共有し、確定後は結果を使い回します。
   */
  readonly #nodeCache: callAbortableFnOnce.CacheMap;

  /**
   * 通常は `PipelineGraph.createResolver` から生成します。
   *
   * @param rootParentNames 単一葉のグラフで根と共有する名前空間です。
   * @param rootVars 根の vars です。
   * @param rootKey 根のキーです。
   * @param signal 中断シグナルです。
   */
  public constructor(
    rootParentNames: readonly string[] | undefined,
    rootVars: Variables,
    rootKey: string,
    signal: AbortSignal,
  ) {
    this.#rootParentNames = rootParentNames;
    this.#rootVars = rootVars;
    this.#rootKey = rootKey;
    this.#signal = signal;
    this.#nodeCache = new Map();
  }

  /**
   * 葉の vars とキーを解決します。
   *
   * @param leaf 解決する葉です。
   * @returns 解決済みの葉を返します。
   */
  public async resolve(leaf: PipelineLeaf): Promise<ResolvedLeaf> {
    // 宛先ごとの写像の開始前に中断を確認します。
    this.#signal.throwIfAborted();

    let key = this.#rootKey;
    let vars = this.#rootVars;
    let names = this.#rootParentNames;

    for (const node of leaf.path) {
      // 共有節は進行中の Promise を共有し、並行解決でも写像は 1 回だけです。
      const resolvedNode = await callAbortableFnOnce({
        fn: async (signal) => {
          const nodeVars = deriveVars(vars, node.leafNames, names);
          using abortPromise = toAbortPromise(this.#signal);
          const resolvedNode = await Promise.race([
            node.transformer.mapKey(nodeVars, signal, key).then((nodeKey): ResolvedNode => ({
              key: nodeKey,
              vars: nodeVars,
              names: node.leafNames,
            })),
            abortPromise,
          ]);

          return resolvedNode;
        },
        key: node,
        signal: this.#signal,
        cacheMap: this.#nodeCache,
      });
      key = resolvedNode.key;
      vars = resolvedNode.vars;
      names = resolvedNode.names;
    }

    return {
      key,
      leaf,
      vars: deriveVars(vars, leaf.nameNames, names),
    };
  }
}

// -------------------------------------------------------------------------------------------------
//
// PipelineGraph
//
// -------------------------------------------------------------------------------------------------

/**
 * コンパイル済みのパイプライン・グラフです。
 *
 * 宛先の変換チェーンをトランスフォーマーのインスタンス同一性で共有する根付き木として保持し、操作ごとの走査・エンコード・書き戻し・ストリーム構築を提供します。
 *
 * 不変条件:
 * - 葉（`leaves`）と各節の項目（`entries`）は宛先の登録順です。
 * - 名簿（`leafNames` / `nameNames`）は凍結された配列で、直通区間では参照を共有します。
 * - 単一葉のグラフでは全節と葉が同じ vars インスタンスを使います（`prepareRootVars`）。
 * - 共有節は 1 操作内で 1 回だけ（`encode` / `getEncodable`）を実行します。分岐点ではプレーン値のエンコード結果を共有し、ストリームは tee で分岐します。
 * - 書き戻しの拒否は、走査中と書き込み中の 2 経路で分類します。いずれも即時に確定します。
 */
export class PipelineGraph {
  /**
   * 宛先定義の列を trie にコンパイルします。
   *
   * トランスフォーマーはインスタンス同一性で共有します。同一インスタンスが複数の節に現れても、open/close/onClear の対象には初出の 1 件だけを保持します。
   *
   * @param destinations コンパイルする宛先定義です。
   * @returns コンパイル済みのパイプライン・グラフを返します。
   */
  public static compile(destinations: readonly PipelineDestination[]): PipelineGraph {
    const rootLeaves: PipelineLeaf[] = [];
    const rootChildren: MutableNode[] = [];
    const allLeaves: PipelineLeaf[] = [];
    const transformers: UniKvsTransformer[] = [];
    const seenTransformers = new Set<UniKvsTransformer>();

    for (const dest of destinations) {
      // 葉の index は登録順のもとです。名簿・書き込み順・エラー識別の基準になります。
      const index = allLeaves.length;
      const name = dest.storage.name;
      const path: PipelineNode[] = [];
      let parent: MutableNode | null = null;
      let canRepair = false;

      let siblings = rootChildren;
      for (const transformer of dest.transformers) {
        // 共有はインスタンス同一性だけで判定し、同構造でも別インスタンスは共有しません。
        let node = siblings.find((candidate) => candidate.transformer === transformer);
        if (node === undefined) {
          node = {
            leaves: [],
            entries: [],
            children: [],
            allLeaves: [],
            leafNames: [],
            transformer,
          };
          siblings.push(node);

          // open/close/onClear の重複実行を避けるため、初出のインスタンスだけを保持します。
          if (!seenTransformers.has(transformer)) {
            seenTransformers.add(transformer);
            transformers.push(transformer);
          }
        }
        // canRepair は経路上の AllowRepair の有無の論理和で、葉ごとに確定します。
        if (transformer.name === "AllowRepair") {
          canRepair = true;
        }

        path.push(node);
        parent = node;
        siblings = node.children;
      }

      const leaf: PipelineLeaf = {
        name,
        path,
        index,
        storage: dest.storage,
        canRepair,
        nameNames: Object.freeze([name]),
      };

      if (parent === null) {
        rootLeaves.push(leaf);
      } else {
        parent.leaves.push(leaf);
      }

      allLeaves.push(leaf);
    }

    const finalize = (node: MutableNode): void => {
      // 直通の節は子の葉名簿と全葉を共有します。直通区間で vars の複製が起きないようにするためです。
      if (node.leaves.length === 0 && node.children.length === 1) {
        const child = node.children[0]!;
        finalize(child);
        node.entries = [
          {
            kind: "node",
            node: child,
          },
        ];
        node.allLeaves = child.allLeaves;
        node.leafNames = child.leafNames;
      } else {
        const leaves = [...node.leaves];
        for (const child of node.children) {
          finalize(child);
          leaves.push(...child.allLeaves);
        }

        leaves.sort((a, b) => a.index - b.index);

        node.entries = createEntries(node.leaves, node.children);
        node.allLeaves = leaves;
        if (leaves.length === 1) {
          node.leafNames = leaves[0]!.nameNames;
        } else {
          node.leafNames = Object.freeze(leaves.map((leaf) => leaf.name));
        }
      }
    };

    for (const child of rootChildren) {
      finalize(child);
    }

    let rootEntries: readonly PipelineEntry[];
    let rootAllLeaves: readonly PipelineLeaf[];
    let rootLeafNames: readonly string[];
    if (rootLeaves.length === 0 && rootChildren.length === 1) {
      const child = rootChildren[0]!;
      rootEntries = [
        {
          kind: "node",
          node: child,
        },
      ];
      rootAllLeaves = child.allLeaves;
      rootLeafNames = child.leafNames;
    } else {
      const collected = [...rootLeaves];
      for (const child of rootChildren) {
        collected.push(...child.allLeaves);
      }

      rootEntries = createEntries(rootLeaves, rootChildren);
      rootAllLeaves = collected.toSorted((a, b) => a.index - b.index);
      if (rootAllLeaves.length === 1) {
        rootLeafNames = rootAllLeaves[0]!.nameNames;
      } else {
        rootLeafNames = Object.freeze(rootAllLeaves.map((leaf) => leaf.name));
      }
    }

    return new PipelineGraph(rootAllLeaves, rootEntries, rootLeafNames, transformers);
  }

  /**
   * 全葉です。
   * 登録順に保持します。
   */
  readonly #leaves: readonly PipelineLeaf[];

  /**
   * 根直下の葉と節を登録順に列挙した静的な項目列です。
   */
  readonly #entries: readonly PipelineEntry[];

  /**
   * 全葉名です。
   */
  readonly #leafNames: readonly string[];

  /**
   * open/close/onClear の対象となるトランスフォーマーです。初出順に保持します。
   */
  readonly #transformers: readonly UniKvsTransformer[];

  /**
   * 全葉数が 1 件かどうかです。
   */
  readonly #isSingleLeaf: boolean;

  /**
   * 単一葉のグラフで根と共有する名前空間です。複数葉では undefined です。
   */
  readonly #rootParentNames: readonly string[] | undefined;

  private constructor(
    leaves: readonly PipelineLeaf[],
    entries: readonly PipelineEntry[],
    leafNames: readonly string[],
    transformers: readonly UniKvsTransformer[],
  ) {
    this.#leaves = leaves;
    this.#entries = entries;
    this.#leafNames = leafNames;
    this.#transformers = transformers;
    this.#isSingleLeaf = leaves.length === 1;
    if (this.#isSingleLeaf) {
      this.#rootParentNames = leaves[0]!.nameNames;
    }
  }

  /**
   * 全葉です。登録順に保持します。
   */
  public get leaves(): readonly PipelineLeaf[] {
    return this.#leaves;
  }

  /**
   * open/close/onClear の対象となるトランスフォーマーです。
   * 初出順・重複なしです。
   */
  public get transformers(): readonly UniKvsTransformer[] {
    return this.#transformers;
  }

  /**
   * 全葉数が 1 件かどうかです。
   */
  public get isSingleLeaf(): boolean {
    return this.#isSingleLeaf;
  }

  /**
   * 葉数です。
   */
  public get size(): number {
    return this.#leaves.length;
  }

  /**
   * 葉を登録順に列挙します。
   */
  public [Symbol.iterator](): IterableIterator<PipelineLeaf> {
    return this.#leaves[Symbol.iterator]();
  }

  /**
   * 節を根から前順 (親が子より前、兄弟は登録順) に列挙します。
   *
   * 構造の確認・保守用です。操作の走査には使用しません。
   *
   * @yields 前順の節です。
   */
  public *nodes(): IterableIterator<PipelineNode> {
    function* visit(node: PipelineNode): IterableIterator<PipelineNode> {
      yield node;
      for (const entry of node.entries) {
        if (entry.kind === "node") {
          yield* visit(entry.node);
        }
      }
    }

    for (const entry of this.#entries) {
      if (entry.kind === "node") {
        yield* visit(entry.node);
      }
    }
  }

  /**
   * 根の vars を返します。
   *
   * 単一葉のグラフでは、渡された vars に葉名の名簿を読み取り専用で付与して使い回します。
   *
   * @param vars 操作の vars です。
   * @returns 根の vars を返します。
   */
  public prepareRootVars(vars: Variables): Variables {
    if (this.#isSingleLeaf) {
      vars.setReadonly("unikvs:storageNames", this.#leaves[0]!.nameNames);
    }

    return vars;
  }

  /**
   * `clear` 用の共有 vars を返します。
   *
   * `prepareRootVars` が返した vars を渡してください。単一葉のグラフでは、付与済みのストレージ名を持つ根の vars をそのまま使い回します。
   *
   * @param vars `prepareRootVars` が返した根の vars です。
   * @returns clear 用の vars を返します。
   */
  public prepareClearVars(vars: Variables): Variables {
    if (this.#isSingleLeaf) {
      return vars;
    }

    return deriveVars(vars, this.#leafNames, undefined);
  }

  /**
   * 共有 vars から葉用の vars を派生します。
   *
   * 単一葉のグラフでは同じインスタンスを返します。
   *
   * @param parent 派生元の vars です。
   * @param leaf 対象の葉です。
   * @returns 葉用の vars を返します。
   */
  public deriveLeafVars(parent: Variables, leaf: PipelineLeaf): Variables {
    return deriveVars(parent, leaf.nameNames, this.#leafNames);
  }

  /**
   * 単一操作のスコープでキー写像をメモ化するリゾルバーを生成します。
   *
   * @param rootVars 根の vars です。
   * @param key 根のキーです。
   * @param signal 中断シグナルです。
   * @returns 葉リゾルバーを返します。
   */
  public createResolver(rootVars: Variables, key: string, signal: AbortSignal): LeafResolver {
    return new LeafResolver(this.#rootParentNames, rootVars, key, signal);
  }

  /**
   * 葉の経路のトランスフォーマーを逆順に適用してデータをデコードします。
   *
   * 各段の後に中断を確認します。旧 `get` 経路は確認頻度が低かったため、ここへの統合にあたり確認を強めています。
   *
   * @param leaf デコード元の葉です。
   * @param vars デコードに使用する vars です。
   * @param signal 中断シグナルです。
   * @param data デコードするデータです。
   * @returns デコード済みのデータを返します。
   */
  public async decode(
    leaf: PipelineLeaf,
    vars: Variables,
    signal: AbortSignal,
    data: unknown,
  ): Promise<unknown> {
    let decoded = data;

    using abortPromise = toAbortPromise(signal);
    for (const node of leaf.path.toReversed()) {
      decoded = await Promise.race([node.transformer.decode(vars, signal, decoded), abortPromise]);
    }

    return decoded;
  }

  /**
   * 葉の経路のトランスフォーマーを逆順に `pipeThrough` してストリームをデコードします。
   *
   * @param leaf デコード元の葉です。
   * @param vars デコードに使用する vars です。
   * @param signal 中断シグナルです。
   * @param source 入力ストリームです。
   * @returns デコード済みのストリームを返します。
   */
  public async decodeStream(
    leaf: PipelineLeaf,
    vars: Variables,
    signal: AbortSignal,
    source: IReadableStream,
  ): Promise<IReadableStream> {
    let decoded = source;
    // 途中で失敗したときは構築済みのパイプを解放し、ソースストリームがロックされたまま残らないようにします。
    const pipes: IReadableStream[] = [];
    try {
      for (const node of leaf.path.toReversed()) {
        const d = await node.transformer.getDecodable(vars, signal);
        decoded = decoded.pipeThrough(d);
        pipes.push(decoded);
      }
    } catch (ex) {
      await cancelStreams(pipes, ex);
      throw ex;
    }

    return decoded;
  }

  /**
   * 共有節を 1 回だけ実行しながら、全葉向けのプレーン値をエンコードします。
   *
   * エンコード中の失敗は生の例外として投げます。
   *
   * @param rootVars 根の vars です。
   * @param key 根のキーです。
   * @param signal 中断シグナルです。
   * @param data エンコードするデータです。
   * @returns 登録順のエンコード結果を返します。
   */
  public async encode(
    rootVars: Variables,
    key: string,
    signal: AbortSignal,
    data: unknown,
  ): Promise<EncodeTarget[]> {
    // 共有節は 1 回だけ encode し、得られた値は全分岐で参照を共有します（複製しません）。
    const targets: EncodeTarget[] = [];

    const walk = async (
      node: PipelineNode,
      input: unknown,
      parentVars: Variables,
      parentNames: readonly string[] | undefined,
      parentKey: string,
    ): Promise<void> => {
      signal.throwIfAborted();

      const vars = deriveVars(parentVars, node.leafNames, parentNames);
      // mapKey は encode の後に、同じ vars で適用します。
      const encoded = await node.transformer.encode(vars, signal, input);
      const nodeKey = await node.transformer.mapKey(vars, signal, parentKey);
      for (const entry of node.entries) {
        if (entry.kind === "node") {
          await walk(entry.node, encoded, vars, node.leafNames, nodeKey);
        } else {
          targets.push({
            key: nodeKey,
            data: encoded,
            leaf: entry.leaf,
            vars: deriveVars(vars, entry.leaf.nameNames, node.leafNames),
          });
        }
      }
    };

    for (const entry of this.#entries) {
      if (entry.kind === "node") {
        await walk(entry.node, data, rootVars, this.#rootParentNames, key);
      } else {
        targets.push({
          key,
          data,
          leaf: entry.leaf,
          vars: deriveVars(rootVars, entry.leaf.nameNames, this.#rootParentNames),
        });
      }
    }

    // 登録順に整列し、並列書き込みの開始順を安定させます。
    targets.sort((a, b) => a.leaf.index - b.leaf.index);

    return targets;
  }

  /**
   * 書き戻し対象の葉へ、共有節を 1 回だけ実行しながら再エンコードして書き込みます。
   *
   * 葉への書き込みは並列に開始し、対象単位の拒否は記録だけして他の対象の開始を止めません。
   * 走査中に確定した拒否は即座に投げます。書き込み中に判明した拒否も、応答のない他の書き込みを待たずに確定させます。
   * 拒否がなければ全タスクの終了を待ちます。
   *
   * @param rootVars 書き戻し用の vars です。
   * @param key 根のキーです。
   * @param signal 中断シグナルです。
   * @param targets 書き戻し対象の葉です。登録順に渡します。
   * @param throwOnRepairDenied 書き戻し拒否をエラーとして投げるかどうかです。
   * @param data デコード済みの原データです。
   */
  public async repair(
    rootVars: Variables,
    key: string,
    signal: AbortSignal,
    targets: readonly PipelineLeaf[],
    throwOnRepairDenied: boolean,
    data: unknown,
  ): Promise<void> {
    if (targets.length === 0) {
      return;
    }

    const targetSet = new Set(targets);
    const isTarget = (leaf: PipelineLeaf): boolean => targetSet.has(leaf);
    const writeTasks: Promise<void>[] = [];
    // 拒否は 2 経路です。走査中の拒否は即時に確定するため、書き込みの待機で get を止めません。
    let traversalDenial: RepairNotAllowedError | null = null;
    // 書き込み中の拒否は 1 件目のシグナルで確定し、応答のない他タスクを待ちません。
    const writeDenials: RepairNotAllowedError[] = [];
    const writeDenialSignal = Promise.withResolvers<void>();

    // 葉書き込みは待機せず開始し、各タスクが自身の失敗を処理して allSettled で確定します。
    const writeLeaf = (
      leaf: PipelineLeaf,
      input: unknown,
      writeKey: string,
      vars: Variables,
    ): void => {
      writeTasks.push(
        (async () => {
          try {
            await leaf.storage.write(vars, signal, writeKey, input);
          } catch (ex) {
            // 意図的な中断時はエラーではありません。
            if (signal.aborted) {
              return;
            }
            if (ex instanceof RepairNotAllowedError) {
              repairLogger.warn`Failed to repair a storage: ${ex}`;

              if (throwOnRepairDenied) {
                writeDenials.push(new RepairNotAllowedError({ names: [leaf.name], cause: ex }));
                // 他の書き込みの完了を待たずに拒否を確定させます。resolve は冪等です。
                writeDenialSignal.resolve();
              }

              return;
            }

            logger.error`Failed to repair a storage: ${ex}`;
          }
        })(),
      );
    };

    const recordTraversalDenial = (denied: RepairNotAllowedError): void => {
      traversalDenial ??= denied;
    };

    const skipDenied = (leaf: PipelineLeaf): void => {
      // 意図的な中断時はエラーではありません。
      if (signal.aborted) {
        return;
      }

      repairLogger.warn`Skipped repair for a storage without AllowRepair: ${leaf.name}`;

      if (throwOnRepairDenied) {
        recordTraversalDenial(new RepairNotAllowedError({ names: [leaf.name] }));
      }
    };

    const walk = async (
      node: PipelineNode,
      input: unknown,
      parentVars: Variables,
      parentNames: readonly string[] | undefined,
      parentKey: string,
    ): Promise<void> => {
      const activeLeaves = activeLeavesOf(node, isTarget);
      if (activeLeaves.length === 0) {
        return;
      }

      // 名簿は対象葉だけの部分集合です。全葉が対象なら節の凍結名簿をそのまま使います。
      const names =
        activeLeaves === node.allLeaves ? node.leafNames : activeLeafNames(activeLeaves);
      const vars = deriveVars(parentVars, names, parentNames);
      let output = input;
      let nodeKey = parentKey;
      const shared = activeLeaves.length >= 2;

      // 単一対象の節でも許可があれば再エンコードを行います。
      // 許可がなければ書き込みに到達しないため、副作用のないスキップに正規化しています。
      if (shared || activeLeaves[0]!.canRepair) {
        try {
          signal.throwIfAborted();

          output = await node.transformer.encode(vars, signal, input);
          nodeKey = await node.transformer.mapKey(vars, signal, parentKey);
        } catch (ex) {
          // 意図的な中断時は中断理由で失敗します。
          if (signal.aborted) {
            if (shared) {
              throw ex;
            }

            return;
          }
          if (ex instanceof RepairNotAllowedError) {
            repairLogger.warn`Failed to repair a storage: ${ex}`;

            if (throwOnRepairDenied) {
              const denied = new RepairNotAllowedError({
                names: activeLeaves.map((leaf) => leaf.name),
                cause: ex,
              });
              // 複数対象が共有する節の拒否は、旧実装同様に書き込み開始前に確定させます。
              if (shared) {
                throw denied;
              }

              recordTraversalDenial(denied);
            }

            return;
          }

          logger.error`Failed to repair a storage: ${ex}`;

          return;
        }
      }

      for (const entry of node.entries) {
        if (entry.kind === "node") {
          await walk(entry.node, output, vars, names, nodeKey);
        } else {
          if (!isTarget(entry.leaf)) {
            continue;
          }
          if (!entry.leaf.canRepair) {
            skipDenied(entry.leaf);
            continue;
          }

          writeLeaf(entry.leaf, output, nodeKey, deriveVars(vars, entry.leaf.nameNames, names));
        }
      }
    };

    for (const entry of this.#entries) {
      if (entry.kind === "node") {
        await walk(entry.node, data, rootVars, this.#rootParentNames, key);
      } else {
        if (!isTarget(entry.leaf)) {
          continue;
        }
        if (!entry.leaf.canRepair) {
          skipDenied(entry.leaf);
          continue;
        }

        writeLeaf(
          entry.leaf,
          data,
          key,
          deriveVars(rootVars, entry.leaf.nameNames, this.#rootParentNames),
        );
      }
    }

    // 走査中の拒否は開始済みの書き込みを待たずに投げます。タスクは自身で例外を処理します。
    if (traversalDenial !== null) {
      throw traversalDenial;
    }

    // 書き込み中の拒否はシグナルで確定し、拒否がなければ全タスクの終了を待ちます。
    await Promise.race([Promise.allSettled(writeTasks), writeDenialSignal.promise]);

    if (writeDenials.length > 0) {
      throw writeDenials[0]!;
    }
  }

  /**
   * 共有節を 1 回だけ取得しながらストリームエンコード木を構築します。
   *
   * 計画段階 (`getEncodable` / `mapKey`) の失敗は何も構築せずに伝播するため、呼び出し側が `streams` のソースをキャンセルします。
   * tee とパイプの構築後の失敗は、`streams` に収集したストリーム (分割した読み取り側を含む) を内部でキャンセルしてから伝播します。
   * 呼び出し側はどちらの失敗でも `streams` をキャンセルできます。
   *
   * @param source 入力ストリームです。
   * @param rootVars 根の vars です。
   * @param key 根のキーです。
   * @param signal 中断シグナルです。
   * @param streams 構築したストリームを収集する集合です。呼び出し側がソースを事前に追加します。
   * @param options 構築オプションです。
   * @returns 構築結果を返します。
   */
  public async buildEncodeTree(
    source: IReadableStream,
    rootVars: Variables,
    key: string,
    signal: AbortSignal,
    streams: Set<IReadableStream>,
    options: BuildEncodeTreeOptions = {},
  ): Promise<StreamEncodeTree> {
    // 段階 1 は計画です。encodable とキーだけを確定し、ストリームはまだ作りません。
    const { isActive, onNodeError } = options;
    const childPlans = new Map<PipelineNode, PlannedNode>();
    const leafPlans = new Map<PipelineLeaf, PlannedLeaf>();

    for (const entry of this.#entries) {
      if (entry.kind === "leaf") {
        if (isActive !== undefined && !isActive(entry.leaf)) {
          continue;
        }

        leafPlans.set(entry.leaf, {
          key,
          leaf: entry.leaf,
          vars: deriveVars(rootVars, entry.leaf.nameNames, this.#rootParentNames),
        });
      } else {
        const planned = await planNode(
          entry.node,
          rootVars,
          this.#rootParentNames,
          key,
          isActive,
          signal,
          onNodeError,
        );
        if (planned !== null) {
          childPlans.set(entry.node, planned);
        }
      }
    }

    const entries: GraphEntry[] = [];
    for (const entry of this.#entries) {
      if (entry.kind === "leaf") {
        const planned = leafPlans.get(entry.leaf);
        if (planned !== undefined) {
          entries.push({
            kind: "leaf",
            leaf: planned,
          });
        }
      } else {
        const planned = childPlans.get(entry.node);
        if (planned !== undefined) {
          entries.push({
            kind: "node",
            node: planned,
          });
        }
      }
    }

    const targets: StreamEncodeTarget[] = [];
    let readStream = source;

    // 段階 2 は tee と pipe の構築です。対象がなければ tee も作りません。
    if (entries.length > 0) {
      let rootInput = source;
      try {
        // 読み取り側は不変に保ち、書き戻し側だけを木へ通します。
        if (options.splitRead) {
          const [repairInput, read] = source.tee();
          streams.add(repairInput);
          streams.add(read);
          rootInput = repairInput;
          readStream = read;
        }

        buildGraph(entries, rootInput, targets, streams);
      } catch (ex) {
        // 構築途中で失敗した場合は、tee の両分岐を含む構築済みストリームを解放してから伝播します。
        await cancelStreams(streams, ex);
        throw ex;
      }
    }

    targets.sort((a, b) => a.leaf.index - b.leaf.index);

    return {
      targets,
      readStream,
    };
  }
}
