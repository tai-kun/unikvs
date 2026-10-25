import type { IReadableStream } from "@unikvs/core";
import { test, describe } from "vite-plus/test";

import { createVariablesStore } from "../src/_contexts.js";
import UniKvsMiddleware from "../src/_middleware.js";
import { PipelineGraph } from "../src/_pipeline-graph.js";
import UniKvsStorage from "../src/_storage.js";
import { MiddlewareNextNotCalledError } from "../src/errors.js";
import {
  collect,
  streamOf,
  FakeStorage,
  withTimeout,
  FakeMiddleware,
  FakeStreamMiddleware,
} from "./_helpers.js";

/**
 * 値が undefined でないことを表明して取り出します。
 */
function unwrap<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("想定外の undefined です。");
  }

  return value;
}

/**
 * 生のモックをグラフ用のラッパーで包みます。
 * グラフの構造契約だけを検証するために使用します。
 */
function wrapStorage(name: string): UniKvsStorage {
  return UniKvsStorage.from(new FakeStorage(name));
}

/**
 * 生のモックをグラフ用のラッパーで包みます。
 * グラフの構造契約だけを検証するために使用します。
 */
function wrapMiddleware(name: string): UniKvsMiddleware {
  return UniKvsMiddleware.from(new FakeMiddleware(name));
}

describe("PipelineGraph - 構造の不変条件", () => {
  test("葉は登録順に列挙され、ミドルウェアは初出順・重複なしになる", ({ expect }) => {
    // 準備：
    const ta = wrapMiddleware("A");
    const tb = wrapMiddleware("B");
    const tc = wrapMiddleware("C");
    const graph = PipelineGraph.compile([
      {
        storage: wrapStorage("a"),
        middlewares: [ta],
      },
      {
        storage: wrapStorage("b"),
        middlewares: [ta, tb],
      },
      {
        storage: wrapStorage("c"),
        middlewares: [ta, tb, tc],
      },
    ]);

    // 検証：
    expect(graph.size).toBe(3);
    expect(graph.isSingleLeaf).toBe(false);
    expect([...graph].map((leaf) => leaf.name)).toStrictEqual(["a", "b", "c"]);
    expect(graph.leaves.map((leaf) => leaf.name)).toStrictEqual(["a", "b", "c"]);
    expect(graph.middlewares.map((middleware) => middleware.name)).toStrictEqual(["A", "B", "C"]);
    expect([...graph.nodes()].map((node) => node.middleware.name)).toStrictEqual(["A", "B", "C"]);
  });

  test("同一インスタンスが複数の節に現れても一覧は初出の 1 件で、節は位置ごとに存在する", ({
    expect,
  }) => {
    // 準備：
    const middleware = wrapMiddleware("dup");
    const graph = PipelineGraph.compile([
      {
        storage: wrapStorage("s1"),
        middlewares: [middleware, middleware],
      },
      {
        storage: wrapStorage("s2"),
        middlewares: [middleware],
      },
    ]);

    // 検証 : ライフサイクル対象は 1 件、節は 2 件で経路も位置ごとに共有される。
    expect(graph.middlewares).toStrictEqual([middleware]);

    const nodes = [...graph.nodes()];
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.middleware).toBe(middleware);
    expect(nodes[1]?.middleware).toBe(middleware);

    const [leafS1, leafS2] = graph.leaves;
    expect(leafS1?.path[0]).toBe(nodes[0]);
    expect(leafS1?.path[1]).toBe(nodes[1]);
    expect(leafS2?.path[0]).toBe(nodes[0]);
  });

  test("名前簿は凍結され、直通区間では参照を共有する", ({ expect }) => {
    // 準備：
    const ta = wrapMiddleware("A");
    const tb = wrapMiddleware("B");
    const graph = PipelineGraph.compile([
      {
        storage: wrapStorage("s"),
        middlewares: [ta, tb],
      },
      {
        storage: wrapStorage("t"),
        middlewares: [ta, tb],
      },
    ]);

    // 検証：
    const [nodeA, nodeB] = [...graph.nodes()];
    expect(nodeA?.leafNames).toBe(nodeB?.leafNames);
    expect(Object.isFrozen(nodeA?.leafNames)).toBe(true);
    expect(nodeA?.leafNames).toStrictEqual(["s", "t"]);
    expect(Object.isFrozen(graph.leaves[0]?.nameNames)).toBe(true);
  });

  test("単一葉のグラフでは単一葉として認識される", ({ expect }) => {
    // 準備：
    const graph = PipelineGraph.compile([
      {
        storage: wrapStorage("only"),
        middlewares: [],
      },
    ]);

    // 検証：
    expect(graph.isSingleLeaf).toBe(true);
    expect(graph.size).toBe(1);
    expect(graph.leaves[0]?.name).toBe("only");
  });
});

describe("PipelineGraph - ストリーム木の構築", () => {
  // バグ回帰 : 根直下の節の失敗を onNodeError が引き受けたとき、tee 分岐の cancel を await すると、まだ消費されていない兄弟分岐の解放まで buildEncodeTree が停止する (根直下の catch 付近)。
  test("根直下の失敗を引き受けると、その分岐を解放して後続の根直下の分岐を構築する", async ({
    expect,
  }) => {
    // 準備 : 根直下に next() を呼ばない節と、素通しする節を並べる。
    class NoNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(): Promise<void> {}
    }

    const deny = new NoNextStreamMiddleware("deny");
    const pass = new FakeStreamMiddleware<Uint8Array>("pass");
    // グラフ単体では open を行わないため、ミドルウェアを開いた状態にします。
    deny.isOpen = true;
    pass.isOpen = true;

    const graph = PipelineGraph.compile([
      {
        storage: wrapStorage("s1"),
        middlewares: [UniKvsMiddleware.from(deny)],
      },
      {
        storage: wrapStorage("s2"),
        middlewares: [UniKvsMiddleware.from(pass)],
      },
    ]);
    const source = streamOf([new Uint8Array([1])]);
    const streams = new Set<IReadableStream>([source]);
    const failures: {
      readonly error: unknown;
      readonly names: readonly string[];
    }[] = [];

    // 実行 : 失敗した節のスキップを引き受ける。
    const tree = await withTimeout(
      graph.buildEncodeTree(
        {
          key: "logs",
          store: createVariablesStore(),
          signal: new AbortController().signal,
        },
        source,
        streams,
        {
          onNodeError: (ex, activeLeaves) => {
            failures.push({
              error: ex,
              names: activeLeaves.map((leaf) => leaf.name),
            });

            return true;
          },
        },
      ),
      1500,
      "build",
    );

    // 検証 : 失敗は対象名付きで引き受けられ、後続の根直下の分岐は構築される。
    expect(failures).toHaveLength(1);
    expect(failures[0]?.error).toBeInstanceOf(MiddlewareNextNotCalledError);
    expect(failures[0]?.names).toStrictEqual(["s1"]);
    expect(tree.targets.map((target) => target.leaf.name)).toStrictEqual(["s2"]);

    // 検証 : 後続分岐のストリームは読み取れる (skip した分岐の解放も停滞しない)。
    const [target] = tree.targets;
    const resolved = unwrap(target);
    await expect(withTimeout(collect(resolved.stream), 1500, "target")).resolves.toStrictEqual([
      new Uint8Array([1]),
    ]);
  });
});
