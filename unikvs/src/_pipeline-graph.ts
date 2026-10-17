import {
  type IMiddleware,
  type IReadableStream,
  ITransformContext,
  RepairNotAllowedError,
} from "@unikvs/core";

import {
  type VariablesStore,
  DecodeContext,
  EncodeContext,
  MapKeyContext,
  DecodeStreamContext,
  EncodeStreamContext,
} from "./_contexts.js";
import { logger, repairLogger } from "./_logger.js";
import type UniKvsMiddleware from "./_middleware.js";
import type UniKvsStorage from "./_storage.js";
import { cancelStreams, isReadableStream } from "./_streams.js";
import * as v from "./_valibot.js";
import {
  MiddlewareDestinationFrozenError,
  MiddlewareDestinationMissingError,
  MiddlewareNextNotCalledError,
  MiddlewareNextNotAwaitedError,
  MiddlewareNextCalledMultipleTimesError,
} from "./errors.js";

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
 * パイプラインの節となるミドルウェアです。
 */
type PipelineNode = {
  /**
   * 節を構成するミドルウェアです。
   */
  readonly middleware: UniKvsMiddleware;

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
   * 適用順のミドルウェア列です。末尾未使用分は含みません。
   */
  readonly middlewares: readonly UniKvsMiddleware[];
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
 * 節の `encodeStream` または `mapKey` が失敗したときの処理を行う関数です。
 */
interface IEncodeNodeErrorHandler {
  /**
   * 節のセットアップ失敗時の処理です。
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

/**
 * 操作共通の実行時情報です。
 *
 * `store` は操作内の全コンテキストで共有され、下流の `set` が上流の `get` に見えます。
 */
type OperationScope = {
  /**
   * 操作対象の論理キーです。
   */
  readonly key: string;

  /**
   * 中断シグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 操作内で共有される変数ストアです。
   */
  readonly store: VariablesStore;
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
   * 節を構成するミドルウェアです。
   */
  readonly middleware: UniKvsMiddleware;

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
 * 変換後のデータが設定されていることを検証し、変換後のデータを返します。
 *
 * ミドルウェアが `destination` を設定しなかったときに投げます。
 *
 * @param middleware 対象のミドルウェアです。
 * @param ctx 検証するコンテキストです。
 * @param operation エラーに付与する操作名です。
 * @returns 変換後のデータを返します。
 */
function requireDestination(
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
 * `ReadableStream` のインターフェースを満たすかを検証するためのスキーマです。
 */
const ReadableStreamSchema = v.custom<IReadableStream>(
  isReadableStream,
  "Expected a ReadableStream",
);

/**
 * 変換後のストリームが設定されていることを検証し、型を検証したストリームを返します。
 *
 * ミドルウェアが `destination` を設定しなかったときに投げます。
 * ストリームの場合は存在確認に加えて `ReadableStream` の型も検証します。
 *
 * @param middleware 対象のミドルウェアです。
 * @param ctx 検証するコンテキストです。
 * @param operation エラーに付与する操作名です。
 * @returns 変換後のストリームを返します。
 */
function requireStreamDestination(
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
function freezeDestination(ctx: ITransformContext): void {
  const { destination } = ctx;
  Object.defineProperty(ctx, "destination", {
    configurable: true,
    enumerable: true,
    get() {
      return destination;
    },
    set() {
      throw new MiddlewareDestinationFrozenError({
        key: ctx.key,
        action: ctx.action,
      });
    },
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
 * @returns 写像後のキーを返します。
 */
function applyMapKey(middleware: UniKvsMiddleware, key: string, scope: OperationScope): string {
  const c = new MapKeyContext({ key, store: scope.store });
  return middleware.mapKey(c);
}

/**
 * 単一ミドルウェアの `encode` を実行し、変換後のデータを返します。
 *
 * `next` に下流の実行を渡すことで、オニオン実行となり、下流の `set` が上流の `await next()` 後の `get` に見えます。
 * 共有ストアのため、変数は全コンテキストで同一参照です。
 *
 * @param middleware 対象のミドルウェアです。
 * @param scope 操作共通の実行時情報です。
 * @param source 変換前のデータです。
 * @param next 下流の実行です。省略時はダミーです。
 * @returns 変換後のデータを返します。
 */
async function applyEncode(
  middleware: UniKvsMiddleware,
  scope: OperationScope,
  source: unknown,
  next: IMiddleware.INext = async () => {},
): Promise<unknown> {
  scope.signal.throwIfAborted();
  const c = new EncodeContext({
    signal: scope.signal,
    key: scope.key,
    source,
    store: scope.store,
  });
  await middleware.encode(c, next);
  scope.signal.throwIfAborted();

  return requireDestination(middleware, c, "encode");
}

/**
 * 単一ミドルウェアの `encodeStream` を実行し、変換後のストリームを返します。
 *
 * @param middleware 対象のミドルウェアです。
 * @param scope 操作共通の実行時情報です。
 * @param source 変換前のストリームです。
 * @param next 下流の実行です。省略時はダミーです。
 * @returns 変換後のストリームを返します。
 */
async function applyEncodeStream(
  middleware: UniKvsMiddleware,
  scope: OperationScope,
  source: IReadableStream,
  next: IMiddleware.INext = async () => {},
): Promise<IReadableStream> {
  scope.signal.throwIfAborted();
  const c = new EncodeStreamContext({
    signal: scope.signal,
    key: scope.key,
    source,
    store: scope.store,
  });
  await middleware.encodeStream(c, next);
  scope.signal.throwIfAborted();

  return requireStreamDestination(middleware, c, "encode");
}

// -------------------------------------------------------------------------------------------------
//
// LeafResolver
//
// -------------------------------------------------------------------------------------------------

/**
 * 単一操作のスコープで葉の写像キーを解決します。
 *
 * 新 `mapKey` は同期的であり、中断シグナルも受け付けないため、共有節の写像は操作内で 1 回だけ実行され、結果を使い回します。
 * 並行解決でも `Map` キャッシュにより重複しません (`resolve` 自体が同期的であるため、競合しません)。
 */
class LeafResolver {
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

// -------------------------------------------------------------------------------------------------
//
// PipelineGraph
//
// -------------------------------------------------------------------------------------------------

/**
 * コンパイル済みのパイプライン・グラフです。
 *
 * 宛先の変換チェーンをミドルウェアのインスタンス同一性で共有する根付き木として保持し、操作ごとの走査・エンコード・書き戻し・ストリーム構築を提供します。
 *
 * 不変条件:
 * - 葉（`leaves`）と各節の項目（`entries`）は宛先の登録順です。
 * - 名簿（`leafNames` / `nameNames`）は凍結された配列で、直通区間では参照を共有します。
 * - 共有節は 1 操作内で 1 回だけ `encode`/`encodeStream`/`mapKey` を実行します。分岐点ではプレーン値のエンコード結果を共有し、ストリームは tee で分岐します。
 * - 書き戻しの拒否は、走査中と書き込み中の 2 経路で分類します。いずれも即時に確定します。
 */
export class PipelineGraph {
  /**
   * 宛先定義の列を trie にコンパイルします。
   *
   * ミドルウェアはインスタンス同一性で共有します。同一インスタンスが複数の節に現れても、`open`/`close`/`use` の対象には初出の 1 件だけを保持します。
   *
   * @param destinations コンパイルする宛先定義です。
   * @returns コンパイル済みのパイプライン・グラフを返します。
   */
  public static compile(destinations: readonly PipelineDestination[]): PipelineGraph {
    const rootLeaves: PipelineLeaf[] = [];
    const rootChildren: MutableNode[] = [];
    const allLeaves: PipelineLeaf[] = [];
    const middlewares: UniKvsMiddleware[] = [];
    const seenMiddlewares = new Set<UniKvsMiddleware>();

    for (const dest of destinations) {
      // 葉の index は登録順のもとです。名簿・書き込み順・エラー識別の基準になります。
      const index = allLeaves.length;
      const name = dest.storage.name;
      const path: PipelineNode[] = [];
      let parent: MutableNode | null = null;
      let canRepair = false;

      let siblings = rootChildren;
      for (const middleware of dest.middlewares) {
        // 共有はインスタンス同一性だけで判定し、同構造でも別インスタンスは共有しません。
        let node = siblings.find((candidate) => candidate.middleware === middleware);
        if (node === undefined) {
          node = {
            leaves: [],
            entries: [],
            children: [],
            allLeaves: [],
            leafNames: [],
            middleware,
          };
          siblings.push(node);

          // open/close/use の重複実行を避けるため、初出のインスタンスだけを保持します。
          if (!seenMiddlewares.has(middleware)) {
            seenMiddlewares.add(middleware);
            middlewares.push(middleware);
          }
        }
        // canRepair は経路上の AllowRepair の有無の論理和で、葉ごとに確定します。
        if (middleware.name === "AllowRepair") {
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
      // 直通の節は子の葉名簿と全葉を共有します。
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
    if (rootLeaves.length === 0 && rootChildren.length === 1) {
      const child = rootChildren[0]!;
      rootEntries = [
        {
          kind: "node",
          node: child,
        },
      ];
      rootAllLeaves = child.allLeaves;
    } else {
      const collected = [...rootLeaves];
      for (const child of rootChildren) {
        collected.push(...child.allLeaves);
      }

      rootEntries = createEntries(rootLeaves, rootChildren);
      rootAllLeaves = collected.toSorted((a, b) => a.index - b.index);
    }

    return new PipelineGraph(rootAllLeaves, rootEntries, middlewares);
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
   * `open`/`close`/`use` の対象となるミドルウェアです。初出順に保持します。
   */
  readonly #middlewares: readonly UniKvsMiddleware[];

  /**
   * 全葉数が 1 件かどうかです。
   */
  readonly #isSingleLeaf: boolean;

  private constructor(
    leaves: readonly PipelineLeaf[],
    entries: readonly PipelineEntry[],
    middlewares: readonly UniKvsMiddleware[],
  ) {
    this.#leaves = leaves;
    this.#entries = entries;
    this.#middlewares = middlewares;
    this.#isSingleLeaf = leaves.length === 1;
  }

  /**
   * 全葉です。登録順に保持します。
   */
  public get leaves(): readonly PipelineLeaf[] {
    return this.#leaves;
  }

  /**
   * `open`/`close`/`use` の対象となるミドルウェアです。
   * 初出順・重複なしです。
   */
  public get middlewares(): readonly UniKvsMiddleware[] {
    return this.#middlewares;
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
   * 単一操作のスコープでキー写像をメモ化するリゾルバーを生成します。
   *
   * 新 `mapKey` は同期的であるため、リゾルバーも同期的です。共有節の写像は操作内で 1 回だけ実行されます。
   *
   * @param key 根のキー (論理キー) です。
   * @param vars 根の実行時変数です。
   * @returns 葉リゾルバーを返します。
   */
  public createResolver(scope: OperationScope): LeafResolver {
    return new LeafResolver(scope);
  }

  /**
   * 葉の経路のミドルウェアを逆順に適用してデータをデコードします。
   *
   * 各段の前後で中断を確認します。
   *
   * @param leaf デコード元の葉です。
   * @param scope 操作共通の実行時情報です。`key` は論理キーです。
   * @param data デコードするデータです。
   * @returns デコード済みのデータを返します。
   */
  public async decode(leaf: PipelineLeaf, scope: OperationScope, data: unknown): Promise<unknown> {
    // 経路を逆順 (葉→根) にネスト実行し、下流 (根側) の `set` が上流 (葉側) の `await next()` 後に見えるようにします。
    // データは外側から内側へ鎖状に渡し、最終結果を外側へ伝播させます。
    const reversed = leaf.path.toReversed();
    async function run(index: number, input: unknown): Promise<unknown> {
      if (index >= reversed.length) {
        return input;
      }

      const node = reversed[index]!;
      const ctx = new DecodeContext({
        key: scope.key,
        store: scope.store,
        signal: scope.signal,
        source: input,
      });
      let downstreamResult: unknown;
      let hasDownstream = false;
      let nextCalled = false;
      let nextSettled = false;
      const next: IMiddleware.INext = function next() {
        if (nextCalled) {
          return Promise.reject(
            new MiddlewareNextCalledMultipleTimesError({
              name: node.middleware.name,
              operation: "decode",
            }),
          );
        }
        nextCalled = true;

        // next() の実行後、即座に destination の確認と凍結を行います。
        let decoded: unknown;
        try {
          decoded = requireDestination(node.middleware, ctx, "decode");
          freezeDestination(ctx);
        } catch (ex) {
          return Promise.reject(ex);
        }

        return Promise.try(async () => {
          try {
            downstreamResult = await run(index + 1, decoded);
            hasDownstream = true;
          } finally {
            nextSettled = true;
          }
        });
      };

      await node.middleware.decode(ctx, next);
      scope.signal.throwIfAborted();
      if (!nextCalled) {
        throw new MiddlewareNextNotCalledError({
          name: node.middleware.name,
          operation: "decode",
        });
      }
      if (!nextSettled) {
        throw new MiddlewareNextNotAwaitedError({
          name: node.middleware.name,
          operation: "decode",
        });
      }
      const destination = requireDestination(node.middleware, ctx, "decode");

      // 下流が実行されたときはその最終結果を返し、そうでなければ自らの出力を返す。
      // (下流の失敗を握り潰したミドルウェアでは自らの出力が最終となる。)
      if (hasDownstream) {
        return downstreamResult;
      }

      return destination;
    }

    return run(0, data);
  }

  /**
   * 葉の経路のミドルウェアを逆順に `pipeThrough` してストリームをデコードします。
   *
   * @param leaf デコード元の葉です。
   * @param scope 操作共通の実行時情報です。`key` は論理キーです。
   * @param source 入力ストリームです。
   * @returns デコード済みのストリームを返します。
   */
  public async decodeStream(
    leaf: PipelineLeaf,
    scope: OperationScope,
    source: IReadableStream,
  ): Promise<IReadableStream> {
    // 途中で失敗したときは構築済みのパイプを解放し、ソースストリームがロックされたまま残らないようにします。
    const pipes: IReadableStream[] = [];
    try {
      const reversed = leaf.path.toReversed();
      async function run(index: number, input: IReadableStream): Promise<IReadableStream> {
        if (index >= reversed.length) {
          return input;
        }

        const node = reversed[index]!;
        const ctx = new DecodeStreamContext({
          key: scope.key,
          store: scope.store,
          signal: scope.signal,
          source: input,
        });
        let downstreamResult: IReadableStream | undefined;
        let hasDownstream = false;
        let nextCalled = false;
        let nextSettled = false;
        const next: IMiddleware.INext = function next() {
          if (nextCalled) {
            return Promise.reject(
              new MiddlewareNextCalledMultipleTimesError({
                name: node.middleware.name,
                operation: "decode",
              }),
            );
          }
          nextCalled = true;

          // next() の実行後、即座に destination の確認と凍結を行います。
          let decoded: IReadableStream;
          try {
            decoded = requireStreamDestination(node.middleware, ctx, "decode");
            freezeDestination(ctx);
          } catch (ex) {
            return Promise.reject(ex);
          }

          return Promise.try(async () => {
            try {
              downstreamResult = await run(index + 1, decoded);
              hasDownstream = true;
            } finally {
              nextSettled = true;
            }
          });
        };

        await node.middleware.decodeStream(ctx, next);
        scope.signal.throwIfAborted();
        if (!nextCalled) {
          throw new MiddlewareNextNotCalledError({
            name: node.middleware.name,
            operation: "decode",
          });
        }
        if (!nextSettled) {
          throw new MiddlewareNextNotAwaitedError({
            name: node.middleware.name,
            operation: "decode",
          });
        }
        const output = requireStreamDestination(node.middleware, ctx, "decode");
        pipes.push(output);

        if (hasDownstream) {
          return downstreamResult!;
        }

        return output;
      }

      return await run(0, source);
    } catch (ex) {
      await cancelStreams(pipes, ex);
      throw ex;
    }
  }

  /**
   * 共有節を 1 回だけ実行しながら、全葉向けのプレーン値をエンコードします。
   *
   * エンコード中の失敗は生の例外として投げます。
   *
   * @param scope 操作共通の実行時情報です。`key` は論理キーです。
   * @param data エンコードするデータです。
   * @returns 登録順のエンコード結果を返します。
   */
  public async encode(scope: OperationScope, data: unknown): Promise<EncodeTarget[]> {
    // 共有節は 1 回だけ encode し、得られた値は全分岐で参照を共有します（複製しません）。
    // オニオン実行により、下流の `set` が上流の `await next()` 後の `get` に見えます (共有ストアのため)。
    const targets: EncodeTarget[] = [];

    async function walk(node: PipelineNode, input: unknown, parentKey: string): Promise<void> {
      scope.signal.throwIfAborted();

      // 親コンテキストを共有ストアで作成し、`next` 内で子の入力として `destination` を参照します。
      // ミドルウェアは `destination` を設定してから `next` を呼ぶため、`next` 実行時点では親出力が確定しています。
      const ctx = new EncodeContext({
        key: scope.key,
        store: scope.store,
        signal: scope.signal,
        source: input,
      });
      let nodeKey = parentKey;
      let nextCalled = false;
      let nextSettled = false;
      const next: IMiddleware.INext = function next() {
        if (nextCalled) {
          return Promise.reject(
            new MiddlewareNextCalledMultipleTimesError({
              name: node.middleware.name,
              operation: "encode",
            }),
          );
        }
        nextCalled = true;

        // next() の実行後、即座に destination の確認と凍結を行います。
        let encoded: unknown;
        try {
          encoded = requireDestination(node.middleware, ctx, "encode");
          freezeDestination(ctx);
        } catch (ex) {
          return Promise.reject(ex);
        }

        return Promise.try(async () => {
          try {
            // `mapKey` は親出力確定後に、共有ストアで適用します。
            nodeKey = applyMapKey(node.middleware, parentKey, scope);
            for (const entry of node.entries) {
              if (entry.kind === "node") {
                await walk(entry.node, encoded, nodeKey);
              } else {
                targets.push({
                  key: nodeKey,
                  data: encoded,
                  leaf: entry.leaf,
                });
              }
            }
          } finally {
            nextSettled = true;
          }
        });
      };

      await node.middleware.encode(ctx, next);
      scope.signal.throwIfAborted();
      if (!nextCalled) {
        throw new MiddlewareNextNotCalledError({
          name: node.middleware.name,
          operation: "encode",
        });
      }
      if (!nextSettled) {
        throw new MiddlewareNextNotAwaitedError({
          name: node.middleware.name,
          operation: "encode",
        });
      }
    }

    for (const entry of this.#entries) {
      if (entry.kind === "node") {
        await walk(entry.node, data, scope.key);
      } else {
        targets.push({
          key: scope.key,
          data,
          leaf: entry.leaf,
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
   * @param scope 操作共通の実行時情報です。`key` は論理キーです。
   * @param targets 書き戻し対象の葉です。登録順に渡します。
   * @param throwOnRepairDenied 書き戻し拒否をエラーとして投げるかどうかです。
   * @param data デコード済みの原データです。
   * @param write 葉への書き込み処理です。
   */
  public async repair(
    scope: OperationScope,
    targets: readonly PipelineLeaf[],
    throwOnRepairDenied: boolean,
    data: unknown,
    write: (leaf: PipelineLeaf, key: string, data: unknown) => Promise<void>,
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
    const writeLeaf = (leaf: PipelineLeaf, input: unknown, writeKey: string): void => {
      writeTasks.push(
        (async () => {
          try {
            await write(leaf, writeKey, input);
          } catch (ex) {
            // 意図的な中断時はエラーではありません。
            if (scope.signal.aborted) {
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
      if (scope.signal.aborted) {
        return;
      }

      repairLogger.warn`Skipped repair for a storage without AllowRepair: ${leaf.name}`;

      if (throwOnRepairDenied) {
        recordTraversalDenial(new RepairNotAllowedError({ names: [leaf.name] }));
      }
    };

    const walk = async (node: PipelineNode, input: unknown, parentKey: string): Promise<void> => {
      const activeLeaves = activeLeavesOf(node, isTarget);
      if (activeLeaves.length === 0) {
        return;
      }

      let output = input;
      let nodeKey = parentKey;
      const shared = activeLeaves.length >= 2;

      // 単一対象の節でも許可があれば再エンコードを行います。
      // 許可がなければ書き込みに到達しないため、副作用のないスキップに正規化しています。
      if (shared || activeLeaves[0]!.canRepair) {
        try {
          scope.signal.throwIfAborted();

          output = await applyEncode(node.middleware, scope, input);
          nodeKey = applyMapKey(node.middleware, parentKey, scope);
        } catch (ex) {
          // 意図的な中断時は中断理由で失敗します。
          if (scope.signal.aborted) {
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
          await walk(entry.node, output, nodeKey);
        } else {
          if (!isTarget(entry.leaf)) {
            continue;
          }
          if (!entry.leaf.canRepair) {
            skipDenied(entry.leaf);
            continue;
          }

          writeLeaf(entry.leaf, output, nodeKey);
        }
      }
    };

    for (const entry of this.#entries) {
      if (entry.kind === "node") {
        await walk(entry.node, data, scope.key);
      } else {
        if (!isTarget(entry.leaf)) {
          continue;
        }
        if (!entry.leaf.canRepair) {
          skipDenied(entry.leaf);
          continue;
        }

        writeLeaf(entry.leaf, data, scope.key);
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
   * 共有節を 1 回だけ実行しながらストリームエンコード木を構築します。
   *
   * 新 Middleware の `encodeStream` は `c.source.pipeThrough(...)` で変換し `c.destination` に設定します。
   * 共有節の実行は 1 回だけであり、分岐点では tee で入力を分けます。
   * 計画段階の失敗は何も構築せずに伝播するため、呼び出し側が `streams` のソースをキャンセルします。
   * tee とパイプの構築後の失敗は、`streams` に収集したストリーム (分割した読み取り側を含む) を内部でキャンセルしてから伝播します。
   * 呼び出し側はどちらの失敗でも `streams` をキャンセルできます。
   *
   * @param scope 操作共通の実行時情報です。`key` は論理キーです。
   * @param source 入力ストリームです。
   * @param streams 構築したストリームを収集する集合です。呼び出し側がソースを事前に追加します。
   * @param options 構築オプションです。
   * @returns 構築結果を返します。
   */
  public async buildEncodeTree(
    scope: OperationScope,
    source: IReadableStream,
    streams: Set<IReadableStream>,
    options: BuildEncodeTreeOptions = {},
  ): Promise<StreamEncodeTree> {
    const { isActive, onNodeError } = options;
    const targets: StreamEncodeTarget[] = [];
    let readStream = source;

    // 段階 1 は共有節の単一実行と tee 分岐です。対象外の部分木は作りません。
    // 旧 `planNode` + `buildGraph` の 2 段階を、新 `encodeStream` の直接実行に統合しています。
    const walk = async (
      node: PipelineNode,
      input: IReadableStream,
      parentKey: string,
    ): Promise<{ readonly key: string; readonly output: IReadableStream } | null> => {
      const activeLeaves = isActive === undefined ? node.allLeaves : activeLeavesOf(node, isActive);
      if (activeLeaves.length === 0) {
        return null;
      }

      scope.signal.throwIfAborted();

      let output: IReadableStream;
      let nodeKey: string;
      try {
        output = await applyEncodeStream(node.middleware, scope, input);
        streams.add(output);
        nodeKey = applyMapKey(node.middleware, parentKey, scope);
      } catch (ex) {
        if (onNodeError?.(ex, activeLeaves)) {
          return null;
        }

        throw ex;
      }

      // 直下の分岐を登録順に tee で割り当てます。最後の分岐は tee せず残りを使います。
      const branchEntries = node.entries.filter((entry) => {
        if (entry.kind === "leaf") {
          return isActive === undefined || isActive(entry.leaf);
        }

        const leaves = entry.node.allLeaves;
        return isActive === undefined || leaves.some(isActive);
      });
      if (branchEntries.length === 0) {
        return null;
      }

      const assigned: IReadableStream[] = [];
      let current = output;
      for (let i = 0; i < branchEntries.length; i++) {
        if (i < branchEntries.length - 1) {
          const [branch, rest] = current.tee();
          streams.add(branch);
          streams.add(rest);
          assigned.push(branch);
          current = rest;
        } else {
          assigned.push(current);
        }
      }

      for (let i = 0; i < branchEntries.length; i++) {
        const entry = branchEntries[i]!;
        const stream = assigned[i]!;
        if (entry.kind === "leaf") {
          targets.push({ leaf: entry.leaf, key: nodeKey, stream });
        } else {
          const child = await walk(entry.node, stream, nodeKey);
          if (child === null) {
            // スキップされた部分木の分岐は解放します。
            try {
              await stream.cancel(new Error("Skipped branch"));
            } catch {}
          }
        }
      }

      return { key: nodeKey, output };
    };

    try {
      // 読み取り側は不変に保ち、書き戻し側だけを木へ通します。
      let rootInput = source;
      if (options.splitRead) {
        const [repairInput, read] = source.tee();
        streams.add(repairInput);
        streams.add(read);
        rootInput = repairInput;
        readStream = read;
      }

      // 根直下の分岐を登録順に tee で割り当てます。
      const rootActives = this.#leaves.filter((leaf) => isActive === undefined || isActive(leaf));
      if (rootActives.length === 0 && this.#entries.length === 0) {
        return { targets, readStream };
      }

      const rootBranchEntries = this.#entries.filter((entry) => {
        if (entry.kind === "leaf") {
          return isActive === undefined || isActive(entry.leaf);
        }

        return isActive === undefined || entry.node.allLeaves.some(isActive);
      });

      if (rootBranchEntries.length > 0) {
        const assigned: IReadableStream[] = [];
        let current = rootInput;
        for (let i = 0; i < rootBranchEntries.length; i++) {
          if (i < rootBranchEntries.length - 1) {
            const [branch, rest] = current.tee();
            streams.add(branch);
            streams.add(rest);
            assigned.push(branch);
            current = rest;
          } else {
            assigned.push(current);
          }
        }

        for (let i = 0; i < rootBranchEntries.length; i++) {
          const entry = rootBranchEntries[i]!;
          const stream = assigned[i]!;
          if (entry.kind === "leaf") {
            if (isActive === undefined || isActive(entry.leaf)) {
              targets.push({ leaf: entry.leaf, key: scope.key, stream });
            }
          } else {
            try {
              const child = await walk(entry.node, stream, scope.key);
              if (child === null) {
                try {
                  await stream.cancel(new Error("Skipped branch"));
                } catch {}
              }
            } catch (ex) {
              if (onNodeError) {
                const leaves = entry.node.allLeaves.filter(
                  (leaf) => isActive === undefined || isActive(leaf),
                );
                if (onNodeError(ex, leaves)) {
                  try {
                    await stream.cancel(ex);
                  } catch {}
                  continue;
                }
              }

              throw ex;
            }
          }
        }
      }
    } catch (ex) {
      // 構築途中で失敗した場合は、tee の両分岐を含む構築済みストリームを解放してから伝播します。
      await cancelStreams(streams, ex);
      throw ex;
    }

    targets.sort((a, b) => a.leaf.index - b.leaf.index);

    return {
      targets,
      readStream,
    };
  }
}
