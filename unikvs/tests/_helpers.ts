import type { Variables, IStorage, ITransformer } from "@unikvs/core";

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
  readonly vars: Variables | undefined;
  readonly signal: AbortSignal | undefined;
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

  public async open(args: IStorage.OpenArgs): Promise<void> {
    await this.record("open", args);
    this.isOpen = true;
  }

  public async close(args: IStorage.CloseArgs): Promise<void> {
    await this.record("close", args);
    this.isOpen = false;
  }

  public async write(args: IStorage.WriteArgs<TData>): Promise<void> {
    await this.record("write", args);
    this.map.set(args.key, args.data);
  }

  public async read(args: IStorage.ReadArgs): Promise<TData> {
    await this.record("read", args);
    return this.map.get(args.key) as TData;
  }

  public async exists(args: IStorage.ExistsArgs): Promise<boolean> {
    await this.record("exists", args);
    return this.map.has(args.key);
  }

  public async delete(args: IStorage.DeleteArgs): Promise<void> {
    await this.record("delete", args);
    this.map.delete(args.key);
  }

  public async clear(args: IStorage.ClearArgs): Promise<void> {
    await this.record("clear", args);
    this.map.clear();
  }

  public async onOtherWriteError(args: IStorage.OnOtherWriteErrorArgs): Promise<void> {
    await this.record("onOtherWriteError", {
      key: args.key,
      data: args.error,
      vars: args.vars,
      signal: args.signal,
    });
    this.otherWriteErrors.push(args.error);
  }

  protected async record(
    method: StorageMethod,
    args: { key?: string; data?: unknown; vars?: Variables; signal?: AbortSignal },
  ): Promise<void> {
    const call: StorageCall = {
      method,
      key: args.key,
      data: args.data,
      vars: args.vars,
      signal: args.signal,
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

  public getWritable(args: IStorage.GetWritableArgs): WritableStream<Uint8Array> {
    this.calls.push({
      method: "getWritable",
      key: args.key,
      data: undefined,
      vars: args.vars,
      signal: args.signal,
    });
    this.onGetWritable?.(args.key);
    const chunks: Uint8Array[] = [];
    const writeGate = this.writeGate;
    const { signal } = args;

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
        this.map.set(args.key, chunks);
      },
    });
  }

  public getReadable(args: IStorage.GetReadableArgs): ReadableStream<Uint8Array> {
    this.calls.push({
      method: "getReadable",
      key: args.key,
      data: undefined,
      vars: args.vars,
      signal: args.signal,
    });
    const chunks = (this.map.get(args.key) as Uint8Array[] | undefined) ?? [];

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

export type TransformerCall = {
  readonly method: "open" | "close" | "encode" | "decode" | "getEncodable" | "getDecodable";
  readonly data: unknown;
  readonly vars: Variables | undefined;
  readonly signal: AbortSignal | undefined;
};

/**
 * open/close で isOpen を切り替え、呼び出しと vars を記録するトランスフォーマーモックです。
 * トランスフォーマーのライフサイクルと vars 伝播の検証に使用します。
 */
export class FakeTransformer<TData = any> implements ITransformer<TData, TData, TData, TData> {
  public readonly name: string;
  public isOpen = false;
  public readonly calls: TransformerCall[] = [];
  public readonly errors: Partial<Record<TransformerCall["method"], unknown>> = {};
  public hook: ((call: TransformerCall) => void | Promise<void>) | undefined;

  public constructor(name = "FakeTransformer") {
    this.name = name;
  }

  public callsOf(method: TransformerCall["method"]): readonly TransformerCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  public async open(args: ITransformer.OpenArgs): Promise<void> {
    await this.record("open", args);
    this.isOpen = true;
  }

  public async close(args: ITransformer.CloseArgs): Promise<void> {
    await this.record("close", args);
    this.isOpen = false;
  }

  public async encode(args: ITransformer.EncodeArgs<TData>): Promise<TData> {
    await this.record("encode", args);
    return args.data;
  }

  public async decode(args: ITransformer.DecodeArgs<TData>): Promise<TData> {
    await this.record("decode", args);
    return args.data;
  }

  protected async record(
    method: TransformerCall["method"],
    args: { data?: unknown; vars?: Variables; signal?: AbortSignal },
  ): Promise<void> {
    const call: TransformerCall = {
      method,
      data: args.data,
      vars: args.vars,
      signal: args.signal,
    };
    this.calls.push(call);
    await this.hook?.(call);

    if (Object.hasOwn(this.errors, method)) {
      throw this.errors[method];
    }
  }
}

/**
 * getEncodable/getDecodable をサポートし、通過するチャンクにタグを付与するトランスフォーマーです。
 * ストリームパイプラインの構築順序と共有プレフィックスの検証に使用します。
 */
export class FakeStreamTransformer<TChunk = any> extends FakeTransformer {
  public constructor(name = "FakeStreamTransformer") {
    super(name);
  }

  public async getEncodable(
    args: ITransformer.GetEncodableArgs,
  ): Promise<TransformStream<TChunk, TChunk>> {
    await this.record("getEncodable", args);

    return new TransformStream();
  }

  public async getDecodable(
    args: ITransformer.GetDecodableArgs,
  ): Promise<TransformStream<TChunk, TChunk>> {
    await this.record("getDecodable", args);

    return new TransformStream();
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
