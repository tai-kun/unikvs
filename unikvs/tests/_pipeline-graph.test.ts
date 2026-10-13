import { Variables } from "@unikvs/core";
import { describe, test } from "vitest";

import { PipelineGraph } from "../src/_pipeline-graph.js";
import UniKvsStorage from "../src/_storage.js";
import UniKvsTransformer from "../src/_transformer.js";
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
function wrapTransformer(name: string): UniKvsTransformer {
  return new UniKvsTransformer(new FakeTransformer(name));
}

describe("PipelineGraph - 構造の不変条件", () => {
  test("葉は登録順に列挙され、トランスフォーマーは初出順・重複なしになる", ({ expect }) => {
    // 準備
    const ta = wrapTransformer("A");
    const tb = wrapTransformer("B");
    const tc = wrapTransformer("C");
    const graph = PipelineGraph.compile([
      { storage: wrapStorage("a"), transformers: [ta] },
      { storage: wrapStorage("b"), transformers: [ta, tb] },
      { storage: wrapStorage("c"), transformers: [ta, tb, tc] },
    ]);

    // 検証
    expect(graph.size).toBe(3);
    expect(graph.isSingleLeaf).toBe(false);
    expect([...graph].map((leaf) => leaf.name)).toStrictEqual(["a", "b", "c"]);
    expect(graph.leaves.map((leaf) => leaf.name)).toStrictEqual(["a", "b", "c"]);
    expect(graph.transformers.map((transformer) => transformer.name)).toStrictEqual([
      "A",
      "B",
      "C",
    ]);
    expect([...graph.nodes()].map((node) => node.transformer.name)).toStrictEqual(["A", "B", "C"]);
  });

  test("同一インスタンスが複数の節に現れても一覧は初出の 1 件で、節は位置ごとに存在する", ({
    expect,
  }) => {
    // 準備
    const transformer = wrapTransformer("dup");
    const graph = PipelineGraph.compile([
      { storage: wrapStorage("s1"), transformers: [transformer, transformer] },
      { storage: wrapStorage("s2"), transformers: [transformer] },
    ]);

    // 検証: ライフサイクル対象は 1 件、節は 2 件で経路も位置ごとに共有される
    expect(graph.transformers).toStrictEqual([transformer]);
    const nodes = [...graph.nodes()];
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.transformer).toBe(transformer);
    expect(nodes[1]!.transformer).toBe(transformer);

    const [leafS1, leafS2] = graph.leaves;
    expect(leafS1!.path[0]).toBe(nodes[0]);
    expect(leafS1!.path[1]).toBe(nodes[1]);
    expect(leafS2!.path[0]).toBe(nodes[0]);
  });

  test("名前簿は凍結され、直通区間では参照を共有する", ({ expect }) => {
    // 準備
    const ta = wrapTransformer("A");
    const tb = wrapTransformer("B");
    const graph = PipelineGraph.compile([
      { storage: wrapStorage("s"), transformers: [ta, tb] },
      { storage: wrapStorage("t"), transformers: [ta, tb] },
    ]);

    // 検証
    const [nodeA, nodeB] = [...graph.nodes()];
    expect(nodeA!.leafNames).toBe(nodeB!.leafNames);
    expect(Object.isFrozen(nodeA!.leafNames)).toBe(true);
    expect(nodeA!.leafNames).toStrictEqual(["s", "t"]);
    expect(Object.isFrozen(graph.leaves[0]!.nameNames)).toBe(true);
  });

  test("単一葉のグラフでは根の vars に凍結名簿が付与される", ({ expect }) => {
    // 準備
    const graph = PipelineGraph.compile([{ storage: wrapStorage("only"), transformers: [] }]);

    // 実行
    const vars = graph.prepareRootVars(new Variables());

    // 検証
    expect(graph.isSingleLeaf).toBe(true);
    expect(graph.size).toBe(1);
    expect(vars.get("unikvs:storageNames")).toStrictEqual(["only"]);
    expect(Object.isFrozen(vars.get("unikvs:storageNames"))).toBe(true);
    expect(vars.isReadonly("unikvs:storageNames")).toBe(true);
  });
});
