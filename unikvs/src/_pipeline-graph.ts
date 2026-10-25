import { type IReadableStream, RepairNotAllowedError } from "@unikvs/core";

import {
  DecodeContext,
  EncodeContext,
  DecodeStreamContext,
  EncodeStreamContext,
} from "./_contexts.js";
import { logger, repairLogger } from "./_logger.js";
import type UniKvsMiddleware from "./_middleware.js";
import {
  applyMapKey,
  createEntries,
  activeLeavesOf,
  freezeDestination,
  requireDestination,
  requireStreamDestination,
} from "./_pipeline-graph.helpers.js";
import type {
  MutableNode,
  EncodeTarget,
  PipelineLeaf,
  PipelineNode,
  PipelineEntry,
  OperationScope,
  StreamEncodeTree,
  StreamEncodeTarget,
  PipelineDestination,
  BuildEncodeTreeOptions,
} from "./_pipeline-graph.types.js";
import { LeafResolver } from "./_pipeline-leaf-resolver.js";
import { cancelStreams } from "./_streams.js";
import {
  MiddlewareNextNotCalledError,
  MiddlewareNextNotAwaitedError,
  MiddlewareDestinationFrozenError,
  MiddlewareDestinationMissingError,
  MiddlewareNextCalledMultipleTimesError,
} from "./errors.js";

/**
 * 節を前順で列挙するための再帰ヘルパーです。
 *
 * @param node 列挙を開始する節です。
 *
 * @yields 前順の節です。
 */
function* visit(node: PipelineNode): IterableIterator<PipelineNode> {
  yield node;
  for (const entry of node.entries) {
    if (entry.kind === "node") {
      yield* visit(entry.node);
    }
  }
}

/**
 * 直通区間をまとめて葉名簿と全葉を確定します。
 *
 * @param node 確定する節です。
 */
function finalize(node: MutableNode): void {
  // 直通の節は子の葉名簿と全葉を共有します。
  if (node.leaves.length === 0 && node.children.length === 1) {
    const [child] = node.children;

    if (child === undefined) {
      throw new Error("直通区間の子節が存在しません。");
    }

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

    const [singleLeaf] = leaves;

    node.entries = createEntries(node.leaves, node.children);
    node.allLeaves = leaves;
    if (leaves.length === 1 && singleLeaf !== undefined) {
      node.leafNames = singleLeaf.nameNames;
    } else {
      node.leafNames = Object.freeze(leaves.map((leaf) => leaf.name));
    }
  }
}

/**
 * コンパイル済みのパイプライン・グラフです。
 *
 * 宛先の変換チェーンをミドルウェアのインスタンス同一性で共有する根付き木として保持し、操作ごとの走査・エンコード・書き戻し・ストリーム構築を提供します。
 *
 * 不変条件 :
 * - 葉（`leaves`）と各節の項目（`entries`）は宛先の登録順です。
 * - 名簿（`leafNames` / `nameNames`）は凍結された配列で、直通区間では参照を共有します。
 * - 共有節は 1 操作内で 1 回だけ `encode`/`encodeStream`/`mapKey` を実行します。分岐点ではプレーン値のエンコード結果を共有し、ストリームは tee で分岐します。
 * - 書き戻しの拒否は、走査中と書き込み中の 2 経路で分類します。いずれも即時に確定します。
 */

export class PipelineGraph {
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
   * 宛先定義の列を trie にコンパイルします。
   *
   * ミドルウェアはインスタンス同一性で共有します。同一インスタンスが複数の節に現れても、`open`/`close`/`use` の対象には初出の 1 件だけを保持します。
   *
   * @param destinations コンパイルする宛先定義です。
   *
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

    for (const child of rootChildren) {
      finalize(child);
    }

    let rootEntries: readonly PipelineEntry[];
    let rootAllLeaves: readonly PipelineLeaf[];

    if (rootLeaves.length === 0 && rootChildren.length === 1) {
      const [child] = rootChildren;

      if (child === undefined) {
        throw new Error("根直下の子節が存在しません。");
      }

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
   *
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
   *
   * @returns デコード済みのデータを返します。
   */
  public async decode(leaf: PipelineLeaf, scope: OperationScope, data: unknown): Promise<unknown> {
    // 経路を逆順 (葉→根) にネスト実行し、下流 (根側) の `set` が上流 (葉側) の `await next()` 後に見えるようにします。
    // データは外側から内側へ鎖状に渡し、最終結果を外側へ伝播させます。
    const reversed = leaf.path.toReversed();

    async function run(index: number, input: unknown): Promise<unknown> {
      const maybeNode = reversed[index];

      if (maybeNode === undefined) {
        return input;
      }

      const node: PipelineNode = maybeNode;

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

      function next(): Promise<void> {
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
      }

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
      // (下流の失敗を握り潰したミドルウェアでは自らの出力が最終となる。)。
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
   *
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
        const maybeNode = reversed[index];

        if (maybeNode === undefined) {
          return input;
        }

        const node: PipelineNode = maybeNode;

        const ctx = new DecodeStreamContext({
          key: scope.key,
          store: scope.store,
          signal: scope.signal,
          source: input,
        });
        let downstreamResult: IReadableStream | undefined;
        let nextCalled = false;
        let nextSettled = false;

        function next(): Promise<void> {
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
            } finally {
              nextSettled = true;
            }
          });
        }

        try {
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

          if (downstreamResult !== undefined) {
            return downstreamResult;
          }

          return output;
        } catch (ex) {
          // ミドルウェアが設定した destination は `pipes` に未登録のことがあるため、投げる前に解放対象へ加えます。
          // `source.pipeThrough(...)` で入力をロックした出力は、ここで収集しないと呼び出し側から解放できません。
          // abort 判定より前に加えることで、next() 完了後の abort でもロックした出力を解放できます。
          if (ctx.destination !== undefined) {
            pipes.push(ctx.destination);
          }

          throw ex;
        }
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
   *
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

      function next(): Promise<void> {
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
      }

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
        (async (): Promise<void> => {
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
                writeDenials.push(
                  new RepairNotAllowedError({
                    cause: ex,
                    names: [leaf.name],
                  }),
                );
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

      const [firstLeaf] = activeLeaves;

      if (firstLeaf === undefined) {
        return;
      }

      const shared = activeLeaves.length >= 2;

      // 単一対象の節でも許可があれば再エンコードを行います。
      // 許可がなければ書き込みに到達しないため、副作用のないスキップに正規化しています。
      // ミドルウェアを実行せず、下流へそのまま伝播します。
      if (!(shared || firstLeaf.canRepair)) {
        scope.signal.throwIfAborted();

        for (const entry of node.entries) {
          if (entry.kind === "node") {
            await walk(entry.node, input, parentKey);
          } else {
            if (!isTarget(entry.leaf)) {
              continue;
            }

            if (!entry.leaf.canRepair) {
              skipDenied(entry.leaf);
              continue;
            }

            writeLeaf(entry.leaf, input, parentKey);
          }
        }

        return;
      }

      scope.signal.throwIfAborted();

      // オニオン実行により、下流の `set` が上流の `await next()` 後の `get` に見えます (共有ストアのため)。
      // 子走査は `next()` 内で行い、親ミドルウェアの後段としてネスト実行します。
      const ctx = new EncodeContext({
        key: scope.key,
        store: scope.store,
        signal: scope.signal,
        source: input,
      });
      let nodeKey = parentKey;
      let nextCalled = false;
      let nextSettled = false;
      let downstreamStarted = false;

      function next(): Promise<void> {
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
            // ここでの失敗は節固有のセットアップ失敗であり、下流開始前として扱います。
            nodeKey = applyMapKey(node.middleware, parentKey, scope);
            scope.signal.throwIfAborted();
            downstreamStarted = true;

            for (const entry of node.entries) {
              if (entry.kind === "node") {
                await walk(entry.node, encoded, nodeKey);
              } else {
                if (!isTarget(entry.leaf)) {
                  continue;
                }

                if (!entry.leaf.canRepair) {
                  skipDenied(entry.leaf);
                  continue;
                }

                writeLeaf(entry.leaf, encoded, nodeKey);
              }
            }
          } finally {
            nextSettled = true;
          }
        });
      }

      try {
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
      } catch (ex) {
        // 意図的な中断時は中断理由で失敗します。
        if (scope.signal.aborted) {
          if (shared) {
            throw ex;
          }

          return;
        }
        // 規約違反はプログラミングエラーであり、握り潰さずに投げます。
        if (
          ex instanceof MiddlewareNextNotCalledError ||
          ex instanceof MiddlewareNextNotAwaitedError ||
          ex instanceof MiddlewareNextCalledMultipleTimesError ||
          ex instanceof MiddlewareDestinationMissingError ||
          ex instanceof MiddlewareDestinationFrozenError
        ) {
          throw ex;
        }
        // 下流開始後の失敗は子節で確定済み (単一拒否は記録、共有拒否は投げ) です。
        // repair は補助処理のため、拒否以外の失敗は記録に留め、読み取りは成功させます。
        if (downstreamStarted) {
          if (ex instanceof RepairNotAllowedError) {
            if (throwOnRepairDenied) {
              throw ex;
            }

            // 拒否をエラーにしない指定では、下流開始前と同じく警告に留めて読み取りを成功させます。
            repairLogger.warn`Failed to repair a storage: ${ex}`;

            return;
          }

          logger.error`Failed to repair a storage: ${ex}`;

          return;
        }

        if (ex instanceof RepairNotAllowedError) {
          repairLogger.warn`Failed to repair a storage: ${ex}`;

          if (throwOnRepairDenied) {
            const denied = new RepairNotAllowedError({
              cause: ex,
              names: activeLeaves.map((leaf) => leaf.name),
            });
            // 複数対象が共有する節の拒否は、旧実装同様に書き込み開始前に確定させます。
            if (shared) {
              throw denied;
            }

            recordTraversalDenial(denied);
          }
        } else {
          logger.error`Failed to repair a storage: ${ex}`;
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
      const denial: RepairNotAllowedError = traversalDenial;

      throw denial;
    }

    // 書き込み中の拒否はシグナルで確定し、拒否がなければ全タスクの終了を待ちます。
    await Promise.race([Promise.allSettled(writeTasks), writeDenialSignal.promise]);

    const [firstDenial] = writeDenials;

    if (firstDenial !== undefined) {
      throw firstDenial;
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
   *
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
    // オニオン実行により、下流の `set` が上流の `await next()` 後の `get` に見えます (共有ストアのため)。
    // 子走査と tee 分岐は `next()` 内で行い、親ミドルウェアの後段としてネスト実行します。
    const walk = async (
      node: PipelineNode,
      input: IReadableStream,
      parentKey: string,
    ): Promise<{
      readonly key: string;
      readonly output: IReadableStream;
    } | null> => {
      const activeLeaves = isActive === undefined ? node.allLeaves : activeLeavesOf(node, isActive);

      if (activeLeaves.length === 0) {
        return null;
      }

      scope.signal.throwIfAborted();

      const ctx = new EncodeStreamContext({
        key: scope.key,
        store: scope.store,
        signal: scope.signal,
        source: input,
      });
      let nodeKey: string = parentKey;
      let output: IReadableStream | undefined;
      let nextCalled = false;
      let nextSettled = false;
      let downstreamStarted = false;
      let downstreamError: unknown;
      let hasDownstreamError = false;
      let emptyBranches = false;

      function next(): Promise<void> {
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
        let encoded: IReadableStream;

        try {
          encoded = requireStreamDestination(node.middleware, ctx, "encode");
          freezeDestination(ctx);
        } catch (ex) {
          return Promise.reject(ex);
        }

        return Promise.try(async () => {
          try {
            // pipeThrough で入力をロックした出力は、以降の失敗でも解放できるよう先に収集します。
            output = encoded;
            streams.add(output);

            // `mapKey` は親出力確定後に、共有ストアで適用します。
            // ここでの失敗は節固有のセットアップ失敗であり、下流開始前として扱います。
            nodeKey = applyMapKey(node.middleware, parentKey, scope);
            scope.signal.throwIfAborted();
            downstreamStarted = true;

            // 直下の分岐を登録順に tee で割り当てます。最後の分岐は tee せず残りを使います。
            const branchEntries = node.entries.filter((entry) => {
              if (entry.kind === "leaf") {
                return isActive === undefined || isActive(entry.leaf);
              }

              const leaves = entry.node.allLeaves;

              return isActive === undefined || leaves.some(isActive);
            });

            if (branchEntries.length === 0) {
              emptyBranches = true;

              return;
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
              const entry = branchEntries[i];
              const stream = assigned[i];

              if (entry === undefined || stream === undefined) {
                throw new Error("分岐の項目またはストリームが存在しません。");
              }

              if (entry.kind === "leaf") {
                targets.push({
                  key: nodeKey,
                  leaf: entry.leaf,
                  stream,
                });
              } else {
                const child = await walk(entry.node, stream, nodeKey);

                if (child === null) {
                  // スキップされた部分木の分岐は解放します。tee の cancel は兄弟分岐の cancel/drain まで解決しないため、開始だけして構築を止めません (未処理 rejection も残しません)。
                  // oxlint-disable-next-line promise/prefer-await-to-then
                  Promise.try(() => stream.cancel(new Error("Skipped branch"))).catch(() => {});
                }
              }
            }
          } catch (ex) {
            // 下流のセットアップ失敗を親の後処理失敗と取り違えないよう、由来を記録します。
            downstreamError = ex;
            hasDownstreamError = true;
            throw ex;
          } finally {
            nextSettled = true;
          }
        });
      }

      try {
        await node.middleware.encodeStream(ctx, next);
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
      } catch (ex) {
        // next() を呼ぶ前に設定された destination は `streams` に未登録のため、投げる前に解放対象へ加えます。
        // pipeThrough で入力をロックした出力は、呼び出し側の `streams` のキャンセルでしか解放できません。
        // abort 判定・規約違反判定より前に加えることで、どちらの失敗でもロックした出力を解放できます。
        if (ctx.destination !== undefined) {
          streams.add(ctx.destination);
        }

        // 意図的な中断時は中断理由で失敗します。
        if (scope.signal.aborted) {
          throw ex;
        }
        // 規約違反はプログラミングエラーであり、`onNodeError` を経由せずに投げます。
        if (
          ex instanceof MiddlewareNextNotCalledError ||
          ex instanceof MiddlewareNextNotAwaitedError ||
          ex instanceof MiddlewareNextCalledMultipleTimesError ||
          ex instanceof MiddlewareDestinationMissingError ||
          ex instanceof MiddlewareDestinationFrozenError
        ) {
          throw ex;
        }

        // 下流開始後の失敗は子節で確定済みのため、そのまま伝播し、根直下で `onNodeError` に分類させます。
        if (downstreamStarted) {
          // 子節のセットアップ失敗は、親の後処理失敗ではないため repair でも握り潰しません。
          if (hasDownstreamError && ex === downstreamError) {
            throw ex;
          }

          // repair は補助処理のため、下流開始後の拒否以外の失敗は記録に留め、読み取りは成功させます。
          if (onNodeError !== undefined) {
            if (ex instanceof RepairNotAllowedError) {
              if (onNodeError(ex, activeLeaves)) {
                // 書き戻しの分岐は既に構築済みのため、そのまま読み取りを続けます。
                return output === undefined
                  ? null
                  : {
                      key: nodeKey,
                      output,
                    };
              }
            }

            logger.error`Failed to repair a storage: ${ex}`;

            return output === undefined
              ? null
              : {
                  key: nodeKey,
                  output,
                };
          }

          throw ex;
        }

        if (onNodeError !== undefined && onNodeError(ex, activeLeaves)) {
          // 構築済みの出力は親の入力を pipeThrough でロックしており、親側からの解放は失敗するため、出力側からキャンセルを伝播させます。
          // next() 前の失敗で output が未確定のときは、設定済みの destination を直接キャンセルします。
          // tee の cancel は兄弟分岐の cancel/drain まで解決しないため、開始だけして構築を止めません (未処理 rejection も残しません)。
          const abandoned = output ?? ctx.destination;

          if (abandoned !== undefined) {
            // oxlint-disable-next-line promise/prefer-await-to-then
            Promise.try(() => abandoned.cancel(ex)).catch(() => {});
          }

          return null;
        }

        throw ex;
      }

      if (emptyBranches || output === undefined) {
        return null;
      }

      return {
        key: nodeKey,
        output,
      };
    };

    try {
      // 読み取り側は不変に保ち、書き戻し側だけを木へ通します。
      let rootInput = source;

      if (options.splitRead === true) {
        const [repairInput, read] = source.tee();
        streams.add(repairInput);
        streams.add(read);
        rootInput = repairInput;
        readStream = read;
      }

      // 根直下の分岐を登録順に tee で割り当てます。
      const rootActives = this.#leaves.filter((leaf) => isActive === undefined || isActive(leaf));

      if (rootActives.length === 0 && this.#entries.length === 0) {
        return {
          targets,
          readStream,
        };
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
          const entry = rootBranchEntries[i];
          const stream = assigned[i];

          if (entry === undefined || stream === undefined) {
            throw new Error("分岐の項目またはストリームが存在しません。");
          }

          if (entry.kind === "leaf") {
            if (isActive === undefined || isActive(entry.leaf)) {
              targets.push({
                key: scope.key,
                leaf: entry.leaf,
                stream,
              });
            }
          } else {
            try {
              const child = await walk(entry.node, stream, scope.key);

              if (child === null) {
                // tee の cancel は兄弟分岐の cancel/drain まで解決しないため、開始だけして構築を止めません (未処理 rejection も残しません)。
                // oxlint-disable-next-line promise/prefer-await-to-then
                Promise.try(() => stream.cancel(new Error("Skipped branch"))).catch(() => {});
              }
            } catch (ex) {
              if (onNodeError) {
                const leaves = entry.node.allLeaves.filter(
                  (leaf) => isActive === undefined || isActive(leaf),
                );

                if (onNodeError(ex, leaves)) {
                  // tee の cancel は兄弟分岐の cancel/drain まで解決しないため、開始だけして構築を止めません (未処理 rejection も残しません)。
                  // oxlint-disable-next-line promise/prefer-await-to-then
                  Promise.try(() => stream.cancel(ex)).catch(() => {});
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
