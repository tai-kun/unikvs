import type { IMiddleware, IPipelineContext, IStorage } from "@unikvs/core";

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
  | "clear"
  | "getWritable"
  | "getReadable"
  | "onOtherWriteError";

export type StorageCall = {
  readonly method: StorageMethod;
  readonly key: string | undefined;
  readonly data: unknown;
  readonly vars: IPipelineContext | undefined;
  readonly signal: AbortSignal | undefined;
  readonly action: string | undefined;
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

  public constructor(name = "FakeStorage") {
    this.name = name;
  }

  public callsOf(method: StorageMethod): readonly StorageCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  /**
   * onOtherWriteError で受け取ったエラーの記録です。
   */
  public readonly otherWriteErrors: unknown[] = [];

  public async open(c: IStorage.OpenContext): Promise<void> {
    await this.record("open", c, undefined);
    this.isOpen = true;
  }

  public async close(c: IStorage.CloseContext): Promise<void> {
    await this.record("close", c, undefined);
    this.isOpen = false;
  }

  public async write(c: IStorage.WriteContext, data: TData): Promise<void> {
    await this.record("write", c, data);
    this.map.set(c.key, data);
  }

  public async read(c: IStorage.ReadContext): Promise<TData> {
    await this.record("read", c, undefined);
    return this.map.get(c.key) as TData;
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    await this.record("exists", c, undefined);
    return this.map.has(c.key);
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    await this.record("delete", c, undefined);
    this.map.delete(c.key);
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    await this.record("clear", c, undefined);
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
      readonly key?: string;
      readonly signal?: AbortSignal;
      readonly action?: string;
      readonly get?: (name: string) => unknown;
    } & IPipelineContext,
    data: unknown,
  ): Promise<void> {
    const call: StorageCall = {
      method,
      key: c.key,
      data,
      vars: c as IPipelineContext,
      signal: c.signal,
      action: (c as { readonly action?: string }).action,
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
  public constructor(name = "FakeStreamStorage") {
    super(name);
  }

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

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array> {
    this.calls.push({
      method: "getWritable",
      key: c.key,
      data: undefined,
      vars: c as IPipelineContext,
      signal: c.signal,
      action: c.action,
    });
    this.onGetWritable?.(c.key);
    const chunks: Uint8Array[] = [];
    const writeGate = this.writeGate;
    const { signal } = c;
    const key = c.key;

    return new WritableStream<Uint8Array>({
      write: async (chunk) => {
        this.onWriteStart?.(chunk);
        await writeGate?.wait();

        if (this.failWriteOnAbort) {
          signal.throwIfAborted();
        }

        chunks.push(chunk);
      },
      close: () => {
        this.map.set(key, chunks);
      },
    });
  }

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array> {
    this.calls.push({
      method: "getReadable",
      key: c.key,
      data: undefined,
      vars: c as IPipelineContext,
      signal: c.signal,
      action: c.action,
    });
    const chunks = (this.map.get(c.key) as Uint8Array[] | undefined) ?? [];

    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
  }
}

export type MiddlewareCall = {
  readonly method:
    | "open"
    | "close"
    | "encode"
    | "decode"
    | "encodeStream"
    | "decodeStream"
    | "use"
    | "mapKey";
  readonly data: unknown;
  readonly key: string | undefined;
  readonly action: string | undefined;
  readonly vars: IPipelineContext | undefined;
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
    await this.record("open", { data: undefined, c });
    this.isOpen = true;
  }

  public async close(c: IMiddleware.CloseContext): Promise<void> {
    await this.record("close", { data: undefined, c });
    this.isOpen = false;
  }

  public mapKey(c: IMiddleware.MapKeyContext): string {
    // 記録は同期的には行わず、呼び出し回数の検証用に残します (非同期フックは呼びません)。
    this.calls.push({
      method: "mapKey",
      data: undefined,
      key: c.key,
      action: undefined,
      vars: c as IPipelineContext,
      signal: undefined,
    });

    return c.key;
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    await this.record("use", { data: undefined, c });
    await next();
  }

  public async encode(c: IMiddleware.EncodeContext<TData>, next: IMiddleware.INext): Promise<void> {
    await this.record("encode", { data: c.source, c });
    c.destination = c.source;
    await next();
  }

  public async decode(c: IMiddleware.DecodeContext<TData>, next: IMiddleware.INext): Promise<void> {
    await this.record("decode", { data: c.source, c });
    c.destination = c.source;
    await next();
  }

  protected async record(
    method: MiddlewareCall["method"],
    args: {
      readonly data?: unknown;
      readonly c: {
        readonly key?: string;
        readonly signal?: AbortSignal;
        readonly action?: string;
      } & IPipelineContext;
    },
  ): Promise<void> {
    const call: MiddlewareCall = {
      method,
      data: args.data,
      key: args.c.key,
      action: (args.c as { readonly action?: string }).action,
      vars: args.c as IPipelineContext,
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
    await this.record("encodeStream", { data: undefined, c });
    c.destination = c.source;
    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.record("decodeStream", { data: undefined, c });
    c.destination = c.source;
    await next();
  }
}

/**
 * チャンク列を順に流す ReadableStream を作成します。
 */
export function streamOf<T>(chunks: readonly T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
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
  stream: AsyncIterable<Uint8Array<ArrayBufferLike>>,
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
 * 指定時間内に Promise が解決しなければ TIMEOUT エラーで拒否します。
 * デッドロック時にテストが固まるのを防ぐために使用します。
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT(${label})`)), ms)),
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
      queueMicrotask(() => resolve(marker));
    }),
    new Promise<typeof marker>((resolve) => {
      setTimeout(() => resolve(marker), 10);
    }),
  ]);

  return result === marker;
}
