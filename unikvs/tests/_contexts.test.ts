import { ReadonlyVariableError, type IPipelineContext } from "@unikvs/core";
import { describe, test } from "vitest";

import {
  ActionContext,
  ClearContext,
  cloneActionContext,
  cloneClearContext,
  cloneCloseContext,
  cloneDecodeContext,
  cloneDecodeStreamContext,
  cloneDeleteContext,
  cloneEncodeContext,
  cloneEncodeStreamContext,
  cloneGetContext,
  cloneHasContext,
  cloneKeyedActionContext,
  cloneLifecycleContext,
  cloneMapKeyContext,
  cloneOpenContext,
  clonePipelineContext,
  cloneSetContext,
  cloneStreamContext,
  cloneTransformContext,
  cloneTransformDataContext,
  cloneTransformStreamContext,
  CloseContext,
  createVarsStore,
  DecodeContext,
  DecodeStreamContext,
  DeleteContext,
  deriveActionContext,
  deriveClearContext,
  deriveCloseContext,
  deriveDecodeContext,
  deriveDecodeStreamContext,
  deriveDeleteContext,
  deriveEncodeContext,
  deriveEncodeStreamContext,
  deriveGetContext,
  deriveHasContext,
  deriveKeyedActionContext,
  deriveLifecycleContext,
  deriveMapKeyContext,
  deriveOpenContext,
  derivePipelineContext,
  deriveSetContext,
  deriveStreamContext,
  deriveTransformContext,
  deriveTransformDataContext,
  deriveTransformStreamContext,
  EncodeContext,
  EncodeStreamContext,
  GetContext,
  getVarsEntries,
  getVarsStore,
  HasContext,
  KeyedActionContext,
  LifecycleContext,
  MapKeyContext,
  OpenContext,
  PipelineContext,
  SetContext,
  StreamContext,
  TransformContext,
  TransformDataContext,
  TransformStreamContext,
} from "../src/_contexts.js";

/**
 * 空の読み取り専用ストリームです。
 * ストリーム系コンテキストの作成式で使用します。
 */
function stream(): ReadableStream {
  return new ReadableStream();
}

/**
 * 全種別の作成式です。
 * インターフェイス外の公開有無という単一の契約を階層全体で確認するために使用します。
 */
const creations: readonly (readonly [label: string, create: () => IPipelineContext])[] = [
  ["PipelineContext", () => new PipelineContext()],
  ["MapKeyContext", () => new MapKeyContext({ key: "k" })],
  ["ActionContext", () => new ActionContext()],
  ["LifecycleContext", () => new LifecycleContext()],
  ["OpenContext", () => new OpenContext()],
  ["CloseContext", () => new CloseContext()],
  ["KeyedActionContext", () => new KeyedActionContext({ key: "k" })],
  ["SetContext", () => new SetContext({ key: "k" })],
  ["GetContext", () => new GetContext({ key: "k" })],
  ["StreamContext", () => new StreamContext({ key: "k" })],
  ["HasContext", () => new HasContext({ key: "k" })],
  ["DeleteContext", () => new DeleteContext({ key: "k" })],
  ["ClearContext", () => new ClearContext({ key: "k" })],
  ["TransformContext", () => new TransformContext({ key: "k", source: 1 })],
  ["TransformDataContext", () => new TransformDataContext({ key: "k", source: 1 })],
  ["EncodeContext", () => new EncodeContext({ key: "k", source: 1 })],
  ["DecodeContext", () => new DecodeContext({ key: "k", source: 1 })],
  ["TransformStreamContext", () => new TransformStreamContext({ key: "k", source: stream() })],
  ["EncodeStreamContext", () => new EncodeStreamContext({ key: "k", source: stream() })],
  ["DecodeStreamContext", () => new DecodeStreamContext({ key: "k", source: stream() })],
];

/**
 * 全種別の派生・複製です。
 * 派生の共有と複製の分離という単一の契約を階層全体で確認するために使用します。
 */
const sharings: readonly {
  readonly label: string;
  readonly run: () => {
    readonly original: IPipelineContext;
    readonly derived: IPipelineContext;
    readonly cloned: IPipelineContext;
  };
}[] = [
  {
    label: "PipelineContext",
    run: () => {
      const original = new PipelineContext({ vars: { v: 1 } });
      return {
        original,
        derived: derivePipelineContext(original),
        cloned: clonePipelineContext(original),
      };
    },
  },
  {
    label: "MapKeyContext",
    run: () => {
      const original = new MapKeyContext({ key: "k", vars: { v: 1 } });
      return {
        original,
        derived: deriveMapKeyContext(original, { key: "k2" }),
        cloned: cloneMapKeyContext(original),
      };
    },
  },
  {
    label: "ActionContext",
    run: () => {
      const original = new ActionContext({ vars: { v: 1 } });
      return {
        original,
        derived: deriveActionContext(original),
        cloned: cloneActionContext(original),
      };
    },
  },
  {
    label: "LifecycleContext",
    run: () => {
      const original = new LifecycleContext({ vars: { v: 1 } });
      return {
        original,
        derived: deriveLifecycleContext(original),
        cloned: cloneLifecycleContext(original),
      };
    },
  },
  {
    label: "OpenContext",
    run: () => {
      const original = new OpenContext({ vars: { v: 1 } });
      return {
        original,
        derived: deriveOpenContext(original),
        cloned: cloneOpenContext(original),
      };
    },
  },
  {
    label: "CloseContext",
    run: () => {
      const original = new CloseContext({ vars: { v: 1 } });
      return {
        original,
        derived: deriveCloseContext(original),
        cloned: cloneCloseContext(original),
      };
    },
  },
  {
    label: "KeyedActionContext",
    run: () => {
      const original = new KeyedActionContext({ key: "k", vars: { v: 1 } });
      return {
        original,
        derived: deriveKeyedActionContext(original, { key: "k2" }),
        cloned: cloneKeyedActionContext(original),
      };
    },
  },
  {
    label: "SetContext",
    run: () => {
      const original = new SetContext({ key: "k", vars: { v: 1 } });
      return {
        original,
        derived: deriveSetContext(original, { key: "k2" }),
        cloned: cloneSetContext(original),
      };
    },
  },
  {
    label: "GetContext",
    run: () => {
      const original = new GetContext({ key: "k", vars: { v: 1 } });
      return {
        original,
        derived: deriveGetContext(original, { key: "k2" }),
        cloned: cloneGetContext(original),
      };
    },
  },
  {
    label: "StreamContext",
    run: () => {
      const original = new StreamContext({ key: "k", vars: { v: 1 } });
      return {
        original,
        derived: deriveStreamContext(original, { key: "k2" }),
        cloned: cloneStreamContext(original),
      };
    },
  },
  {
    label: "HasContext",
    run: () => {
      const original = new HasContext({ key: "k", vars: { v: 1 } });
      return {
        original,
        derived: deriveHasContext(original, { key: "k2" }),
        cloned: cloneHasContext(original),
      };
    },
  },
  {
    label: "DeleteContext",
    run: () => {
      const original = new DeleteContext({ key: "k", vars: { v: 1 } });
      return {
        original,
        derived: deriveDeleteContext(original, { key: "k2" }),
        cloned: cloneDeleteContext(original),
      };
    },
  },
  {
    label: "ClearContext",
    run: () => {
      const original = new ClearContext({ key: "k", vars: { v: 1 } });
      return {
        original,
        derived: deriveClearContext(original, { key: "k2" }),
        cloned: cloneClearContext(original),
      };
    },
  },
  {
    label: "TransformContext",
    run: () => {
      const original = new TransformContext({ key: "k", source: 1, vars: { v: 1 } });
      return {
        original,
        derived: deriveTransformContext(original, { key: "k2" }),
        cloned: cloneTransformContext(original),
      };
    },
  },
  {
    label: "TransformDataContext",
    run: () => {
      const original = new TransformDataContext({ key: "k", source: 1, vars: { v: 1 } });
      return {
        original,
        derived: deriveTransformDataContext(original, { key: "k2" }),
        cloned: cloneTransformDataContext(original),
      };
    },
  },
  {
    label: "EncodeContext",
    run: () => {
      const original = new EncodeContext({ key: "k", source: 1, vars: { v: 1 } });
      return {
        original,
        derived: deriveEncodeContext(original, { key: "k2" }),
        cloned: cloneEncodeContext(original),
      };
    },
  },
  {
    label: "DecodeContext",
    run: () => {
      const original = new DecodeContext({ key: "k", source: 1, vars: { v: 1 } });
      return {
        original,
        derived: deriveDecodeContext(original, { key: "k2" }),
        cloned: cloneDecodeContext(original),
      };
    },
  },
  {
    label: "TransformStreamContext",
    run: () => {
      const original = new TransformStreamContext({ key: "k", source: stream(), vars: { v: 1 } });
      return {
        original,
        derived: deriveTransformStreamContext(original, { key: "k2" }),
        cloned: cloneTransformStreamContext(original),
      };
    },
  },
  {
    label: "EncodeStreamContext",
    run: () => {
      const original = new EncodeStreamContext({ key: "k", source: stream(), vars: { v: 1 } });
      return {
        original,
        derived: deriveEncodeStreamContext(original, { key: "k2" }),
        cloned: cloneEncodeStreamContext(original),
      };
    },
  },
  {
    label: "DecodeStreamContext",
    run: () => {
      const original = new DecodeStreamContext({ key: "k", source: stream(), vars: { v: 1 } });
      return {
        original,
        derived: deriveDecodeStreamContext(original, { key: "k2" }),
        cloned: cloneDecodeStreamContext(original),
      };
    },
  },
];

describe("公開範囲", () => {
  for (const [label, create] of creations) {
    test(`${label}は変数ヘルパーを公開しない`, ({ expect }) => {
      // 実行
      const context = create() as unknown as Record<string, unknown>;

      // 検証: インターフェイスの get/set/setReadonly と固有プロパティー以外を持たない
      expect("derive" in context).toBe(false);
      expect("clone" in context).toBe(false);
      expect("entries" in context).toBe(false);
      expect("getStore" in context).toBe(false);
    });
  }
});

describe("全種別の共有契約", () => {
  for (const { label, run } of sharings) {
    test(`${label}のderiveは共有しcloneは分離する`, ({ expect }) => {
      // 準備と実行
      const { original, derived, cloned } = run();
      derived.set("shared", "downstream");

      // 検証: 派生の変更は元に見え、複製は独立している
      expect(original.get("shared")).toBe("downstream");
      expect(original.get("v")).toBe(1);
      expect(cloned.get("v")).toBe(1);
      expect(cloned.get("shared")).toBeUndefined();
    });
  }
});

describe("VarsStore の共有", () => {
  test("同一ストアのコンテキスト間でsetが相互に見える", ({ expect }) => {
    // 準備
    const store = createVarsStore({ a: 1 });
    const a = new SetContext({ key: "k", store });
    const b = new GetContext({ key: "k", store });

    // 実行
    b.set("b-var", 2);

    // 検証: 異種クラス間でも同一参照を見ている
    expect(a.get("b-var")).toBe(2);
    expect(a.get("a")).toBe(1);
  });

  test("ストアを指定しないときは独立している", ({ expect }) => {
    // 準備
    const a = new PipelineContext({ vars: { x: 1 } });
    const b = new PipelineContext({ vars: { x: 1 } });

    // 実行
    a.set("x", 2);

    // 検証
    expect(b.get("x")).toBe(1);
  });

  test("storeとvarsを併用したときはvarsが共有ストアに上書きされる", ({ expect }) => {
    // 準備
    const store = createVarsStore({ x: 1 });

    // 実行
    const c = new PipelineContext({ vars: { x: 2, y: 3 }, store });

    // 検証
    expect(c.get("x")).toBe(2);
    expect(store.data.get("x")).toBe(2);
    expect(store.data.get("y")).toBe(3);
  });
});

describe("derive とオニオン実行", () => {
  test("deriveでkeyを上書きしてもストアは共有される", ({ expect }) => {
    // 準備
    const base = new SetContext({ key: "k1", vars: { tag: "t" } });

    // 実行
    const derived = deriveSetContext(base, { key: "k2" });
    derived.set("tag", "changed");

    // 検証
    expect(derived.key).toBe("k2");
    expect(base.get("tag")).toBe("changed");
  });

  test("deriveのvarsは共有ストアに追記される", ({ expect }) => {
    // 準備
    const base = new PipelineContext({ vars: { a: 1 } });

    // 実行
    const derived = derivePipelineContext(base, { vars: { b: 2 } });

    // 検証
    expect(base.get("b")).toBe(2);
    expect(derived.get("a")).toBe(1);
  });

  test("下流のsetは上流のawait next()後のgetに見える", async ({ expect }) => {
    // 準備
    const store = createVarsStore();
    const upstream = new EncodeContext({ key: "k", source: "in", store });
    upstream.set("shared", 0);
    const next = async (): Promise<void> => {
      deriveEncodeContext(upstream, { source: "down" }).set("shared", 42);
    };

    // 実行
    await next();

    // 検証
    expect(upstream.get("shared")).toBe(42);
  });

  test("GetContextのderiveはrepairを引き継ぐ", ({ expect }) => {
    // 準備
    const base = new GetContext({
      key: "k",
      repair: { enabled: true, targets: ["s1"] },
    });

    // 実行
    const derived = deriveGetContext(base, { key: "mapped" });

    // 検証
    expect(derived.key).toBe("mapped");
    expect(derived.repair).toStrictEqual({ enabled: true, targets: ["s1"] });
    expect(derived.action).toBe("get");
  });
});

describe("clone と entries", () => {
  test("cloneは独立し、上書きは読み取り専用を迂回する", ({ expect }) => {
    // 準備
    const original = new SetContext({ key: "k", vars: { a: 1 } });
    original.setReadonly("ro", "locked");

    // 実行
    const cloned = cloneSetContext(original, { ro: "overridden", b: 2 });
    cloned.set("a", 10);

    // 検証
    expect(cloned.get("ro")).toBe("overridden");
    expect(original.get("ro")).toBe("locked");
    expect(original.get("a")).toBe(1);
    expect(() => cloned.set("ro", "x")).toThrow(ReadonlyVariableError);
  });

  test("entriesは保持する変数を列挙する", ({ expect }) => {
    // 準備
    const c = new PipelineContext({ vars: { a: 1, b: 2 } });

    // 実行と検証
    expect([...getVarsEntries(c)]).toStrictEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  test("getStoreは共有参照を返す", ({ expect }) => {
    // 準備
    const c = new PipelineContext({ vars: { a: 1 } });

    // 実行
    const store = getVarsStore(c);
    const other = new DecodeContext({ key: "k", source: "s", store });
    other.set("a", 9);

    // 検証
    expect(c.get("a")).toBe(9);
  });
});

describe("読み取り専用と destination の有無", () => {
  test("読み取り専用の変数への再設定は変数名入りのエラーを投げる", ({ expect }) => {
    // 準備
    const c = new SetContext({ key: "k" });
    c.setReadonly("x", 1);

    // 実行
    let caught: unknown;
    try {
      c.set("x", 2);
    } catch (ex) {
      caught = ex;
    }

    // 検証
    expect(caught).toBeInstanceOf(ReadonlyVariableError);
    expect((caught as ReadonlyVariableError).meta).toStrictEqual({ name: "x" });
    expect(() => c.setReadonly("x", 3)).toThrow(ReadonlyVariableError);
  });

  test("destinationの有無はderiveとcloneで保たれる", ({ expect }) => {
    // 準備
    const c = new EncodeContext({ key: "k", source: "s" });

    // 実行と検証: 未設定時は存在しない
    expect("destination" in c).toBe(false);
    expect("destination" in deriveEncodeContext(c, { key: "k2" })).toBe(false);
    expect("destination" in cloneEncodeContext(c)).toBe(false);

    // 実行と検証: 設定時は引き継がれる
    const withDest = new EncodeContext({ key: "k", source: "s", destination: "d" });
    expect(deriveEncodeContext(withDest).destination).toBe("d");
    expect(cloneEncodeContext(withDest).destination).toBe("d");
  });
});
