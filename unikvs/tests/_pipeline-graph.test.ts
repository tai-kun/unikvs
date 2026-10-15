import { describe, test } from "vitest";

import UniKvsMiddleware from "../src/_middleware.js";
import { PipelineGraph } from "../src/_pipeline-graph.js";
import UniKvsStorage from "../src/_storage.js";
import { FakeStorage, FakeTransformer } from "./_helpers.js";

/**
 * 生のモックをグラフ用のラッパーで包みます。
 * グラフの構造契約だけを検証するために使用します。
 */
function wrapStorage(name: string): UniKvsStorage {
  return new UniKvsStorage(new FakeStorage(name));
}

/**
 * 生のモックをグラフ用のラッパーで包みます。
 * グラフの構造契約だけを検証するために使用します。
 */
function wrapMiddleware(name: string): UniKvsMiddleware {
  return new UniKvsMiddleware(new FakeTransformer(name));
}

describe("PipelineGraph - 構造の不変条件", () => {
  test("葉は登録順に列挙され、ミドルウェアは初出順・重複なしになる", ({ expect }) => {
    // 準備
    const ta = wrapMiddleware("A");
    const tb = wrapMiddleware("B");
    const tc = wrapMiddleware("C");
    const graph = PipelineGraph.compile([
      { storage: wrapStorage("a"), middlewares: [ta] },
      { storage: wrapStorage("b"), middlewares: [ta, tb] },
      { storage: wrapStorage("c"), middlewares: [ta, tb, tc] },
    ]);

    // 検証
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
    // 準備
    const middleware = wrapMiddleware("dup");
    const graph = PipelineGraph.compile([
      { storage: wrapStorage("s1"), middlewares: [middleware, middleware] },
      { storage: wrapStorage("s2"), middlewares: [middleware] },
    ]);

    // 検証: ライフサイクル対象は 1 件、節は 2 件で経路も位置ごとに共有される
    expect(graph.middlewares).toStrictEqual([middleware]);
    const nodes = [...graph.nodes()];
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.middleware).toBe(middleware);
    expect(nodes[1]!.middleware).toBe(middleware);

    const [leafS1, leafS2] = graph.leaves;
    expect(leafS1!.path[0]).toBe(nodes[0]);
    expect(leafS1!.path[1]).toBe(nodes[1]);
    expect(leafS2!.path[0]).toBe(nodes[0]);
  });

  test("名前簿は凍結され、直通区間では参照を共有する", ({ expect }) => {
    // 準備
    const ta = wrapMiddleware("A");
    const tb = wrapMiddleware("B");
    const graph = PipelineGraph.compile([
      { storage: wrapStorage("s"), middlewares: [ta, tb] },
      { storage: wrapStorage("t"), middlewares: [ta, tb] },
    ]);

    // 検証
    const [nodeA, nodeB] = [...graph.nodes()];
    expect(nodeA!.leafNames).toBe(nodeB!.leafNames);
    expect(Object.isFrozen(nodeA!.leafNames)).toBe(true);
    expect(nodeA!.leafNames).toStrictEqual(["s", "t"]);
    expect(Object.isFrozen(graph.leaves[0]!.nameNames)).toBe(true);
  });

  test("単一葉のグラフでは単一葉として認識される", ({ expect }) => {
    // 準備
    const graph = PipelineGraph.compile([{ storage: wrapStorage("only"), middlewares: [] }]);

    // 検証
    expect(graph.isSingleLeaf).toBe(true);
    expect(graph.size).toBe(1);
    expect(graph.leaves[0]!.name).toBe("only");
  });
});
