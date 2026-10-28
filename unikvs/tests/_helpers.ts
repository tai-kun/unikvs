// oxlint-disable unicorn/number-literal-case
import type { IStorage, IMiddleware, IPipelineContext } from "@unikvs/core";
import type { Memory } from "@unikvs/memory";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";

import { CloseContext } from "../src/_contexts.js";
import { KeyNotFoundError } from "../src/errors.js";

/**
 * 任意のタイミングでテスト側から解放できるゲートです。
 * プラグインの処理を意図的に保留させ、並列性・直列化・中断の検証に使用します。
 */
export class Gate {
  readonly #promise: Promise<void>;

  #resolve: (() => void) | undefined;

  #isOpen = false;

  public constructor() {
    const { promise, resolve } = Promise.withResolvers<void>();
    this.#promise = promise;
    this.#resolve = resolve;
  }

  public get isOpen(): boolean {
    return this.#isOpen;
  }

  public open(): void {
    if (this.#isOpen) {
      return;
    }

    this.#isOpen = true;
    this.#resolve?.();
    this.#resolve = undefined;
  }

  public wait(): Promise<void> {
    return this.#promise;
  }
}

export type StorageMethod =
  | "open"
  | "close"
  | "write"
  | "read"
  | "exists"
  | "delete"
  | "copy"
  | "move"
  | "clear"
  | "getWritable"
  | "getReadable"
  | "onOtherWriteError";

export type StorageCall = {
  readonly key: string | undefined;
  readonly data: unknown;
  readonly vars: IPipelineContext | undefined;
  readonly action: string | undefined;
  readonly method: StorageMethod;
  readonly signal: AbortSignal | undefined;
  readonly destinationKey: string | undefined;
};

/**
 * 呼び出しを記録し、失敗やゲートを差し込める Map ベースのストレージモックです。
 * 複数ストレージの並列性・エラー集約・vars 伝播・ライフサイクルの検証に使用します。
 */
export class FakeStorage<TData = any> implements IStorage<TData> {
  public readonly name: string;

  public isOpen = false;

  public readonly map = new Map<string, TData>();

  public readonly calls: StorageCall[] = [];

  /**
   * メソッド名ごとに 1 回だけ投げるエラーです。
   */
  public readonly errors: Partial<Record<StorageMethod, unknown>> = {};

  /**
   * 各メソッドの実行前に呼ばれるフックです。ゲートの待機や中断のシミュレートに使用します。
   */
  public hook: ((call: StorageCall) => void | Promise<void>) | undefined;

  /**
   * onOtherWriteError で受け取ったエラーの記録です。
   */
  public readonly otherWriteErrors: unknown[] = [];

  public constructor(name = "FakeStorage") {
    this.name = name;
  }

  public callsOf(method: StorageMethod): readonly StorageCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    await this.record("open", c);
    this.isOpen = true;
  }

  public async close(c: IStorage.CloseContext): Promise<void> {
    await this.record("close", c);
    this.isOpen = false;
  }

  /**
   * `await using` で自動的に閉じるための破棄処理です。開いているときだけ close を呼びます。
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    if (!this.isOpen) {
      return;
    }

    await this.close(new CloseContext({ signal: AbortSignal.timeout(10e3) }));
  }

  public async write(c: IStorage.WriteContext, data: TData): Promise<void> {
    await this.record("write", c, data);
    this.map.set(c.key, data);
  }

  public async read(c: IStorage.ReadContext): Promise<TData> {
    await this.record("read", c);

    return this.map.get(c.key) as TData;
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    await this.record("exists", c);

    return this.map.has(c.key);
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    await this.record("delete", c);
    this.map.delete(c.key);
  }

  public async copy(c: IStorage.CopyContext): Promise<void> {
    await this.record("copy", c);

    if (!this.map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    if (c.key === c.destinationKey) {
      return;
    }

    this.map.set(c.destinationKey, this.map.get(c.key) as TData);
  }

  public async move(c: IStorage.MoveContext): Promise<void> {
    await this.record("move", c);

    if (!this.map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    if (c.key === c.destinationKey) {
      return;
    }

    this.map.set(c.destinationKey, this.map.get(c.key) as TData);
    this.map.delete(c.key);
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    await this.record("clear", c);
    this.map.clear();
  }

  public async onOtherWriteError(
    c: IStorage.OtherWriteErrorHandlerContext,
    errors: readonly IStorage.IOtherWriteError[],
  ): Promise<void> {
    await this.record("onOtherWriteError", c, errors);
    this.otherWriteErrors.push(errors);
  }

  protected async record(
    method: StorageMethod,
    c: {
      readonly get?: (name: string) => unknown;
      readonly key?: string;
      readonly action?: string;
      readonly signal?: AbortSignal;
      readonly destinationKey?: string;
    } & IPipelineContext,
    data?: unknown,
  ): Promise<void> {
    const call: StorageCall = {
      key: c.key,
      data,
      vars: c,
      action: (c as { readonly action?: string }).action,
      method,
      signal: c.signal,
      destinationKey: c.destinationKey,
    };
    this.calls.push(call);
    await this.hook?.(call);

    if (Object.hasOwn(this.errors, method)) {
      throw this.errors[method];
    }
  }
}

/**
 * チャンク列を Map 上に保持するストリーム対応ストレージモックです。
 * ストリームの往復・tee 分岐・書き込みバックプレッシャーの検証に使用します。
 */
export class FakeStreamStorage extends FakeStorage {
  /**
   * チャンク書き込みを保留させるゲートです。開くまで書き込みは進みません。
   */
  public writeGate: Gate | undefined;

  /**
   * true のとき、ゲート解放後に書き込みシグナルの中断を確認して abort 理由を投げます。
   */
  public failWriteOnAbort = false;

  /**
   * getWritable が呼ばれたときに通知します。
   */
  public onGetWritable: ((key: string) => void) | undefined;

  /**
   * チャンク書き込みが始まったときに通知します。writeGate より前に呼ばれます。
   */
  public onWriteStart: ((chunk: Uint8Array) => void) | undefined;

  public constructor(name = "FakeStreamStorage") {
    super(name);
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array> {
    this.calls.push({
      key: c.key,
      data: undefined,
      vars: c,
      action: c.action,
      method: "getWritable",
      signal: c.signal,
      destinationKey: undefined,
    });
    this.onGetWritable?.(c.key);
    const chunks: Uint8Array[] = [];
    const writeGate = this.writeGate;
    const { signal } = c;
    const key = c.key;

    return new WritableStream<Uint8Array>({
      close: () => {
        this.map.set(key, chunks);
      },
      write: async (chunk) => {
        this.onWriteStart?.(chunk);
        await writeGate?.wait();

        if (this.failWriteOnAbort) {
          signal.throwIfAborted();
        }

        chunks.push(chunk);
      },
    });
  }

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array> {
    this.calls.push({
      key: c.key,
      data: undefined,
      vars: c,
      action: c.action,
      method: "getReadable",
      signal: c.signal,
      destinationKey: undefined,
    });
    const chunks = (this.map.get(c.key) as Uint8Array[] | undefined) ?? [];

    return new ReadableStream<Uint8Array>({
      start(controller): void {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }

        controller.close();
      },
    });
  }
}

export type MiddlewareCall = {
  readonly key: string | undefined;
  readonly data: unknown;
  readonly vars: IPipelineContext | undefined;
  readonly action: string | undefined;
  readonly method:
    | "open"
    | "close"
    | "encode"
    | "decode"
    | "encodeStream"
    | "decodeStream"
    | "use"
    | "mapKey";
  readonly signal: AbortSignal | undefined;
};

/**
 * open/close で isOpen を切り替え、呼び出しと vars を記録するミドルウェアモックです。
 * ミドルウェアのライフサイクルと vars 伝播の検証に使用します。
 */
export class FakeMiddleware<TData = any> implements IMiddleware<TData, TData, TData, TData> {
  public readonly name: string;

  public isOpen = false;

  public readonly calls: MiddlewareCall[] = [];

  public readonly errors: Partial<Record<MiddlewareCall["method"], unknown>> = {};

  public hook: ((call: MiddlewareCall) => void | Promise<void>) | undefined;

  public constructor(name = "FakeMiddleware") {
    this.name = name;
  }

  public callsOf(method: MiddlewareCall["method"]): readonly MiddlewareCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  public async open(c: IMiddleware.OpenContext): Promise<void> {
    await this.record("open", {
      c,
      data: undefined,
    });
    this.isOpen = true;
  }

  public async close(c: IMiddleware.CloseContext): Promise<void> {
    await this.record("close", {
      c,
      data: undefined,
    });
    this.isOpen = false;
  }

  /**
   * `await using` で自動的に閉じるための破棄処理です。開いているときだけ close を呼びます。
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    if (!this.isOpen) {
      return;
    }

    await this.close(new CloseContext({ signal: AbortSignal.timeout(10e3) }));
  }

  public mapKey(c: IMiddleware.MapKeyContext): string {
    // 記録は同期的には行わず、呼び出し回数の検証用に残します (非同期フックは呼びません)。
    this.calls.push({
      key: c.key,
      data: undefined,
      vars: c,
      action: undefined,
      method: "mapKey",
      signal: undefined,
    });

    return c.key;
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    await this.record("use", {
      c,
      data: undefined,
    });
    await next();
  }

  public async encode(c: IMiddleware.EncodeContext<TData>, next: IMiddleware.INext): Promise<void> {
    await this.record("encode", {
      c,
      data: c.source,
    });
    c.destination = c.source;
    await next();
  }

  public async decode(c: IMiddleware.DecodeContext<TData>, next: IMiddleware.INext): Promise<void> {
    await this.record("decode", {
      c,
      data: c.source,
    });
    c.destination = c.source;
    await next();
  }

  protected async record(
    method: MiddlewareCall["method"],
    args: {
      readonly c: {
        readonly key?: string;
        readonly action?: string;
        readonly signal?: AbortSignal;
      } & IPipelineContext;
      readonly data?: unknown;
    },
  ): Promise<void> {
    const call: MiddlewareCall = {
      key: args.c.key,
      data: args.data,
      vars: args.c,
      action: (args.c as { readonly action?: string }).action,
      method,
      signal: args.c.signal,
    };
    this.calls.push(call);
    await this.hook?.(call);

    if (Object.hasOwn(this.errors, method)) {
      throw this.errors[method];
    }
  }
}

/**
 * encodeStream/decodeStream をサポートし、通過するチャンクにタグを付与するミドルウェアです。
 * ストリームパイプラインの構築順序と共有プレフィックスの検証に使用します。
 */
export class FakeStreamMiddleware<_TChunk = any> extends FakeMiddleware {
  public constructor(name = "FakeStreamMiddleware") {
    super(name);
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.record("encodeStream", {
      c,
      data: undefined,
    });
    c.destination = c.source;
    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.record("decodeStream", {
      c,
      data: undefined,
    });
    c.destination = c.source;
    await next();
  }
}

/**
 * encode で接尾辞を付与し、decode で除去するミドルウェアです。
 * パイプラインの構成順とオニオン実行の検証に使用します。
 */
export class TagMiddleware extends FakeMiddleware {
  readonly #tag: string;

  public constructor(tag: string) {
    super(`Tag(${tag})`);
    this.#tag = tag;
  }

  public override async encode(...args: Parameters<FakeMiddleware["encode"]>): Promise<void> {
    const [c, next] = args;
    await this.record("encode", {
      c,
      data: c.source,
    });
    c.destination = `${String(c.source)}${this.#tag}`;
    await next();
  }

  public override async decode(...args: Parameters<FakeMiddleware["decode"]>): Promise<void> {
    const [c, next] = args;
    await this.record("decode", {
      c,
      data: c.source,
    });

    const data = String(c.source);
    c.destination = data.endsWith(this.#tag) ? data.slice(0, -this.#tag.length) : data;

    await next();
  }
}

/**
 * チャンク列を順に流す ReadableStream を作成します。
 */
export function streamOf<T>(chunks: readonly T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller): void {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });
}

/**
 * 非同期イテラブルの全チャンクを収集します。
 */
export async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * 非同期イテラブルの全チャンクを 1 つの Uint8Array に連結します。
 */
export async function collectBytes(
  stream: AsyncIterable<Uint8Array>,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks = await collect(stream);
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

/**
 * Memory ストレージの内容をテストから操作するためのアクセサーです。
 * Memory の内部マップは ECMAScript のプライベートフィールド (#map) のため外部から直接参照できません。
 * そのため公開 API (write/read/exists/delete/clear) 経由で Map ライクに読み書きします。
 * どのデータが実際にどのストレージへ書き込まれたかを確認するために使用します。
 */
export function mapOf(storage: Memory): {
  readonly get: (key: string) => unknown;
  readonly has: (key: string) => boolean;
  readonly set: (key: string, value: unknown) => unknown;
  readonly clear: () => void;
  readonly delete: (key: string) => boolean;
} {
  return {
    get: (key: string): unknown => {
      let value: unknown;

      try {
        value = storage.read(createGetContext(key) as unknown as IStorage.ReadContext);
      } catch {
        value = undefined;
      }

      return value;
    },
    has: (key: string): boolean =>
      // storage.exists は MaybePromise<boolean> ですが、Memory の実装は同期的です。
      storage.exists(createHasContext(key) as unknown as IStorage.ExistsContext),
    set: (key: string, value: unknown): unknown => {
      storage.write(createSetContext(key) as unknown as IStorage.WriteContext, value);

      return undefined;
    },
    clear: (): void => {
      storage.clear(createClearContext() as unknown as IStorage.ClearContext);
    },
    delete: (key: string): boolean => {
      try {
        storage.delete(createDeleteContext(key) as unknown as IStorage.DeleteContext);

        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * データの SHA-256 ハッシュを 16 進文字列として計算します。
 * チェックサム検証の期待値を作るために使用します。
 */
export async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);

  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * データが gzip のマジックナンバー (0x1f 0x8b) で始まるかを確認します。
 * 圧縮が実際に適用されたことを検証するために使用します。
 */
export function isGzip(data: Uint8Array): boolean {
  return data[0] === 0x1f && data[1] === 0x8b;
}

/**
 * 指定時間内に Promise が解決しなければ TIMEOUT エラーで拒否します。
 * デッドロック時にテストが固まるのを防ぐために使用します。
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error(`TIMEOUT(${label})`));
      }, ms),
    ),
  ]);
}

/**
 * 指定した非同期関数が保留中であることを、次のマイクロタスク境界まで進めて確認します。
 */
export async function isPending(p: Promise<unknown>): Promise<boolean> {
  const marker = Symbol("pending");
  const result = await Promise.race([
    p.then(
      () => "settled" as const,
      () => "settled" as const,
    ),
    new Promise<typeof marker>((resolve) => {
      queueMicrotask(() => {
        resolve(marker);
      });
    }),
    new Promise<typeof marker>((resolve) => {
      setTimeout(() => {
        resolve(marker);
      }, 10);
    }),
  ]);

  return result === marker;
}
