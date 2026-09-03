import type { MaybePromise } from "maypromise";

import type { ErrorBase } from "./errors.js";
import type { Variables } from "./variables.types.js";

/**
 * ストレージに関連する引数の型定義を格納する名前空間です。
 *
 * @example
 * `Pick` を使用して必要なプロパティーのみを受け取る実装パターンです。
 *
 * ```ts
 * import type { IStorage } from "@unikvs/core";
 *
 * class Memory implements IStorage {
 *   public write(args: Pick<IStorage.WriteArgs<any>, "key" | "data">): void {
 *     this.map.set(args.key, args.data);
 *   }
 *
 *   public read(args: Pick<IStorage.ReadArgs, "key">): any {
 *     return this.map.get(args.key);
 *   }
 * }
 * ```
 */
export namespace IStorage {
  /**
   * ストレージ操作で使用されるキーの型定義です。
   */
  export type Key = string;

  /**
   * 書き込み可能なストリームを取得する際の引数定義です。
   *
   * @example
   * ```ts
   * import type { IStorage } from "@unikvs/core";
   *
   * class MyStorage implements IStorage {
   *   public getWritable(
   *     args: Pick<IStorage.GetWritableArgs, "key">,
   *   ): WritableStream<Uint8Array<ArrayBuffer>> {
   *     return new WritableStream({
   *       write: (chunk) => { chunks.push(chunk); },
   *     });
   *   }
   * }
   * ```
   */
  export type GetWritableArgs = {
    /**
     * 実行時の変数です。
     */
    vars: Variables;

    /**
     * 操作対象を識別するためのキーです。
     */
    key: Key;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * 読み取り可能なストリームを取得する際の引数定義です。
   *
   * @example
   * ```ts
   * import type { IStorage } from "@unikvs/core";
   *
   * class MyStorage implements IStorage {
   *   public getReadable(
   *     args: Pick<IStorage.GetReadableArgs, "key">,
   *   ): ReadableStream<Uint8Array<ArrayBuffer>> {
   *     const data = this.map.get(args.key);
   *     return new ReadableStream({
   *       pull: (controller) => {
   *         controller.enqueue(data);
   *         controller.close();
   *       },
   *     });
   *   }
   * }
   * ```
   */
  export type GetReadableArgs = {
    /**
     * 実行時の変数です。
     */
    vars: Variables;

    /**
     * 操作対象を識別するためのキーです。
     */
    key: Key;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * ストレージをオープンする際の引数定義です。
   *
   * @example
   * ```ts
   * import type { IStorage } from "@unikvs/core";
   *
   * class Indexeddb implements IStorage {
   *   private db: IDBPDatabase | null = null;
   *
   *   public get isOpen(): boolean {
   *     return this.db !== null;
   *   }
   *
   *   public async open(args: IStorage.OpenArgs): Promise<void> {
   *     this.db = await openDB("my-db", 1);
   *   }
   * }
   * ```
   */
  export type OpenArgs = {
    /**
     * 実行時の変数です。
     */
    vars: Variables;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * ストレージをクローズする際の引数定義です。
   *
   * @example
   * ```ts
   * import type { IStorage } from "@unikvs/core";
   *
   * class Indexeddb implements IStorage {
   *   public close(args: IStorage.CloseArgs): void {
   *     this.db!.close();
   *     this.db = null;
   *   }
   * }
   * ```
   */
  export type CloseArgs = {
    /**
     * 実行時の変数です。
     */
    vars: Variables;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * エラーハンドリングに必要な引数定義です。
   *
   * @example
   * 複数ストレージへの書き込み中に他のストレージがエラーを投げた場合の後処理です。
   *
   * ```ts
   * import type { IStorage } from "@unikvs/core";
   *
   * class MyStorage implements IStorage {
   *   public onOtherWriteError?(
   *     args: IStorage.OnOtherWriteErrorArgs,
   *   ): void {
   *     // 他のストレージが失敗したので、自身の書き込みをロールバックします。
   *     this.map.delete(args.key);
   *   }
   * }
   * ```
   */
  export type OnOtherWriteErrorArgs = {
    /**
     * 実行時の変数です。
     */
    vars: Variables;

    /**
     * 操作対象を識別するためのキーです。
     */
    key: Key;

    /**
     * 自身以外のストレージが投げたエラーの集約です。
     */
    error: ErrorBase<{
      readonly plugin: "storage";
      readonly action: "write";
      readonly errors: readonly {
        readonly plugin: "storage";
        readonly reason: unknown;
      }[];
    }>;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * データを書き込む際の引数定義です。
   *
   * @template TData 書き込むデータの型です。
   *
   * @example
   * ```ts
   * import type { IStorage } from "@unikvs/core";
   *
   * class MyStorage implements IStorage {
   *   public write(args: Pick<IStorage.WriteArgs<Uint8Array>, "key" | "data">): void {
   *     this.map.set(args.key, args.data);
   *   }
   * }
   * ```
   */
  export type WriteArgs<TData = any> = {
    /**
     * 実行時の変数です。
     */
    vars: Variables;

    /**
     * 操作対象を識別するためのキーです。
     */
    key: Key;

    /**
     * 書き込む対象のデータ本体です。
     */
    data: TData;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * データを読み取る際の引数定義です。
   *
   * @example
   * ```ts
   * import type { IStorage } from "@unikvs/core";
   *
   * class MyStorage implements IStorage {
   *   public read(args: Pick<IStorage.ReadArgs, "key">): any {
   *     const value = this.map.get(args.key);
   *     if (value === undefined) {
   *       throw new KeyNotFoundError({ key: args.key });
   *     }
   *
   *     return value;
   *   }
   * }
   * ```
   */
  export type ReadArgs = {
    /**
     * 実行時の変数です。
     */
    vars: Variables;

    /**
     * 操作対象を識別するためのキーです。
     */
    key: Key;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * データの存在確認を行う際の引数定義です。
   *
   * @example
   * ```ts
   * import type { IStorage } from "@unikvs/core";
   *
   * class MyStorage implements IStorage {
   *   public exists(args: Pick<IStorage.ExistsArgs, "key">): boolean {
   *     return this.map.has(args.key);
   *   }
   * }
   * ```
   */
  export type ExistsArgs = {
    /**
     * 実行時の変数です。
     */
    vars: Variables;

    /**
     * 操作対象を識別するためのキーです。
     */
    key: Key;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * データを削除する際の引数定義です。
   *
   * @example
   * ```ts
   * import type { IStorage } from "@unikvs/core";
   *
   * class MyStorage implements IStorage {
   *   public delete(args: Pick<IStorage.DeleteArgs, "key">): void {
   *     if (!this.map.has(args.key)) {
   *       throw new KeyNotFoundError({ key: args.key });
   *     }
   *
   *     this.map.delete(args.key);
   *   }
   * }
   * ```
   */
  export type DeleteArgs = {
    /**
     * 実行時の変数です。
     */
    vars: Variables;

    /**
     * 操作対象を識別するためのキーです。
     */
    key: Key;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * ストレージ内の全データを消去する際の引数定義です。
   *
   * @example
   * ```ts
   * import type { IStorage } from "@unikvs/core";
   *
   * class MyStorage implements IStorage {
   *   public clear(): void {
   *     this.map.clear();
   *   }
   * }
   * ```
   */
  export type ClearArgs = {
    /**
     * 実行時の変数です。
     */
    vars: Variables;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };
}

/**
 * 書き込み処理を行うストリームのインターフェースです。
 *
 * `WritableStream` を継承し、非同期的なデータの流し込みをサポートします。
 *
 * @template TData ストリームに書き込むデータの型です。
 *
 * @example
 * ```ts
 * import type { IStorage, IWritableStream } from "@unikvs/core";
 *
 * class MyStorage implements IStorage {
 *   public getWritable(
 *     args: Pick<IStorage.GetWritableArgs, "key">,
 *   ): IWritableStream<Uint8Array<ArrayBuffer>> {
 *     const chunks: Uint8Array[] = [];
 *     return new WritableStream({
 *       write: (chunk) => { chunks.push(chunk); },
 *       close: () => { this.map.set(args.key, chunks); },
 *     });
 *   }
 * }
 * ```
 */
export interface IWritableStream<TData = any> extends WritableStream<TData> {}

/**
 * 書き込み可能なストリームを提供するストレージ機能のインターフェースです。
 *
 * @template TData ストリームで扱うデータの型です。
 *
 * @example
 * ```ts
 * import type { IStorage, IWritableStreamStorage } from "@unikvs/core";
 *
 * class MyStorage implements IWritableStreamStorage<Uint8Array<ArrayBuffer>> {
 *   getWritable(
 *     args: Pick<IStorage.GetWritableArgs, "key">,
 *   ): WritableStream<Uint8Array<ArrayBuffer>> {
 *     // ...
 *   }
 * }
 * ```
 */
export interface IWritableStreamStorage<TData = any> {
  /**
   * 指定されたキーに対して書き込みを行うための `IWritableStream` インスタンスを返します。
   *
   * @param args ストリーム取得に必要な引数オブジェクトです。
   * @returns 書き込み可能なストリーム、またはそれを解決する Promise です。
   */
  getWritable(args: IStorage.GetWritableArgs): MaybePromise<IWritableStream<TData>>;
}

/**
 * 読み取り処理を行うストリームのインターフェースです。
 *
 * `ReadableStream` を継承し、蓄積されたデータのストリーミング読み出しをサポートします。
 *
 * @template TData ストリームから読み取られるデータの型です。
 *
 * @example
 * ```ts
 * import type { IStorage, IReadableStream } from "@unikvs/core";
 *
 * class MyStorage implements IStorage {
 *   public getReadable(
 *     args: Pick<IStorage.GetReadableArgs, "key">,
 *   ): IReadableStream<Uint8Array<ArrayBuffer>> {
 *     const value = this.map.get(args.key);
 *     return new ReadableStream({
 *       pull: (controller) => {
 *         controller.enqueue(value);
 *         controller.close();
 *       },
 *     });
 *   }
 * }
 * ```
 */
export interface IReadableStream<TData = any> extends ReadableStream<TData> {}

/**
 * 読み取り可能なストリームを提供するストレージ機能のインターフェースです。
 *
 * @template TData ストリームで扱うデータの型です。
 *
 * @example
 * ```ts
 * import type { IStorage, IReadableStreamStorage } from "@unikvs/core";
 *
 * class MyStorage implements IReadableStreamStorage<Uint8Array<ArrayBuffer>> {
 *   getReadable(
 *     args: Pick<IStorage.GetReadableArgs, "key">,
 *   ): ReadableStream<Uint8Array<ArrayBuffer>> {
 *     // ...
 *   }
 * }
 * ```
 */
export interface IReadableStreamStorage<TData = any> {
  /**
   * 指定されたキーから読み取りを行うための `IReadableStream` インスタンスを返します。
   *
   * @param args ストリーム取得に必要な引数オブジェクトです。
   * @returns 読み取り可能なストリーム、またはそれを解決する Promise です。
   */
  getReadable(args: IStorage.GetReadableArgs): MaybePromise<IReadableStream<TData>>;
}

/**
 * データの永続化と取得を管理する総合ストレージインターフェースです。
 *
 * 単発の読み書き（アトミックな操作）に加え、ストリームベースの大規模データ処理をサポートします。
 *
 * @template TWriteDataInput 書き込み時の入力データ型です。
 * @template TReadDataOutput 読み取り時の出力データ型です。初期値は `TWriteDataInput` です。
 * @template TWriteChunkInput ストリーム書き込み時の入力チャンク型です。バイナリーデータの場合はその型を、それ以外は `any` をデフォルトとします。
 * @template TReadChunkOutput ストリーム読み取り時の出力チャンク型です。初期値は `TWriteChunkInput` です。
 *
 * @example
 * メモリーストレージのシンプルな実装です。
 *
 * ```ts
 * import type { IStorage } from "@unikvs/core";
 *
 * class Memory implements IStorage {
 *   private readonly map = new Map<string, any>();
 *
 *   public readonly name = "Memory";
 *   public readonly isOpen = true;
 *
 *   public write(args: Pick<IStorage.WriteArgs<any>, "key" | "data">): void {
 *     this.map.set(args.key, args.data);
 *   }
 *
 *   public read(args: Pick<IStorage.ReadArgs, "key">): any {
 *     return this.map.get(args.key);
 *   }
 *
 *   public exists(args: Pick<IStorage.ExistsArgs, "key">): boolean {
 *     return this.map.has(args.key);
 *   }
 *
 *   public delete(args: Pick<IStorage.DeleteArgs, "key">): void {
 *     this.map.delete(args.key);
 *   }
 *
 *   public clear(): void {
 *     this.map.clear();
 *   }
 * }
 * ```
 *
 * @example
 * インメモリーストレージでストリーム読み書きを提供します。
 *
 * ```ts
 * import type { IStorage } from "@unikvs/core";
 *
 * class MemoryStream implements IStorage {
 *   private readonly map = new Map<string, Uint8Array>();
 *
 *   public readonly name = "MemoryStream";
 *   public readonly isOpen = true;
 *
 *   public getWritable(
 *     args: Pick<IStorage.GetWritableArgs, "key">,
 *   ): WritableStream<Uint8Array<ArrayBuffer>> {
 *     const chunks: Uint8Array[] = [];
 *     return new WritableStream({
 *       write: (chunk) => { chunks.push(chunk); },
 *       close: () => {
 *         const merged = new Uint8Array(
 *           chunks.reduce((sum, c) => sum + c.byteLength, 0),
 *         );
 *         let offset = 0;
 *         for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
 *         this.map.set(args.key, merged);
 *       },
 *     });
 *   }
 *
 *   public getReadable(
 *     args: Pick<IStorage.GetReadableArgs, "key">,
 *   ): ReadableStream<Uint8Array<ArrayBuffer>> {
 *     const value = this.map.get(args.key);
 *     return new ReadableStream({
 *       pull: (controller) => {
 *         controller.enqueue(value);
 *         controller.close();
 *       },
 *     });
 *   }
 *
 *   // write / read / exists / delete / clear の実装は省略
 *   public write(args: Pick<IStorage.WriteArgs<any>, "key" | "data">): void { }
 *   public read(args: Pick<IStorage.ReadArgs, "key">): any { return undefined; }
 *   public exists(args: Pick<IStorage.ExistsArgs, "key">): boolean { return false; }
 *   public delete(args: Pick<IStorage.DeleteArgs, "key">): void { }
 *   public clear(): void { }
 * }
 * ```
 *
 * @example
 * 非同期ストレージ（IndexedDB）の実装パターンです。
 *
 * ```ts
 * import type { IStorage } from "@unikvs/core";
 *
 * class Indexeddb implements IStorage {
 *   private db: IDBPDatabase | null = null;
 *
 *   public readonly name = "Indexeddb";
 *
 *   public get isOpen(): boolean {
 *     return this.db !== null;
 *   }
 *
 *   public async open(args: IStorage.OpenArgs): Promise<void> {
 *     this.db = await openDB("my-db", 1);
 *   }
 *
 *   public close(args: IStorage.CloseArgs): void {
 *     this.db!.close();
 *     this.db = null;
 *   }
 *
 *   public async write(
 *     args: Pick<IStorage.WriteArgs<any>, "key" | "data">,
 *   ): Promise<void> {
 *     await this.db!.put("store", args.data, args.key);
 *   }
 *
 *   public async read(
 *     args: Pick<IStorage.ReadArgs, "key">,
 *   ): Promise<any> {
 *     return await this.db!.get("store", args.key);
 *   }
 * }
 * ```
 */
export interface IStorage<
  TWriteDataInput = any,
  TReadDataOutput = TWriteDataInput,
  TWriteChunkInput = TWriteDataInput extends ArrayBufferLike | ArrayBufferView
    ? TWriteDataInput
    : any,
  TReadChunkOutput = TWriteChunkInput,
>
  extends
    Partial<IWritableStreamStorage<TWriteChunkInput>>,
    Partial<IReadableStreamStorage<TReadChunkOutput>> {
  /**
   * ストレージの名前です。デバッグメッセージなどに使用されます。
   */
  readonly name: string;

  /**
   * ストレージが現在利用可能な状態であるかを示します。
   */
  readonly isOpen: boolean;

  /**
   * ストレージをオープンし、読み書きが可能な状態に準備します。
   *
   * データベースの接続確立やファイルシステムの初期化などをここで行います。
   *
   * @param args オープンに必要な引数オブジェクトです。
   * @returns 処理の完了を示す Promise、または void です。
   */
  open?(args: IStorage.OpenArgs): MaybePromise<void>;

  /**
   * ストレージを安全にクローズします。
   *
   * 未書き込みデータのフラッシュや、コネクションの切断処理をここで行います。
   *
   * @param args クローズに必要な引数オブジェクトです。
   * @returns 処理の完了を示す Promise、または void です。
   */
  close?(args: IStorage.CloseArgs): MaybePromise<void>;

  /**
   * 自身以外のストレージがエラーを投げた場合のハンドリングを行います。
   *
   * 必要に応じてデータを削除することができます。
   *
   * @param args エラーハンドリングに必要な引数オブジェクトです。
   * @returns 処理の完了を示す Promise、または void です。
   */
  onOtherWriteError?(args: IStorage.OnOtherWriteErrorArgs): MaybePromise<void>;

  /**
   * 指定されたデータを、対応するキーでストレージに保存します。
   *
   * @param args 書き込み対象のデータ、キー、変数を含む引数オブジェクトです。
   * @returns 処理の完了を示す Promise、または void です。
   */
  write(args: IStorage.WriteArgs<TWriteDataInput>): MaybePromise<void>;

  /**
   * 指定されたキーに対応するデータをストレージから取得します。
   *
   * @param args 読み取り対象のキーと変数を含む引数オブジェクトです。
   * @returns 取得されたデータ、またはそれを解決する Promise です。
   */
  read(args: IStorage.ReadArgs): MaybePromise<TReadDataOutput>;

  /**
   * 指定されたキーに対応するデータがストレージ内に存在するかを確認します。
   *
   * @param args 確認対象のキーと変数を含む引数オブジェクトです。
   * @returns データが存在する場合は true、存在しない場合は false、またはそれらを解決する Promise です。
   */
  exists(args: IStorage.ExistsArgs): MaybePromise<boolean>;

  /**
   * 指定されたキーに対応するデータをストレージから削除します。
   *
   * @param args 削除対象のキーと変数を含む引数オブジェクトです。
   * @returns 処理の完了を示す Promise、または void です。
   */
  delete(args: IStorage.DeleteArgs): MaybePromise<void>;

  /**
   * ストレージ内のすべてのデータを完全に消去します。
   *
   * @param args 消去操作に必要な変数を含む引数オブジェクトです。
   * @returns 処理の完了を示す Promise、または void です。
   */
  clear(args: IStorage.ClearArgs): MaybePromise<void>;
}
