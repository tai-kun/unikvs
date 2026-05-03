import type { MaybePromise } from "maypromise";

import type { Context } from "./context.types.js";
import type { ErrorBase } from "./errors.js";

/**
 * ストレージに関連する引数の型定義を格納する名前空間です。
 */
export namespace IStorage {
  /**
   * ストレージ操作で使用されるキーの型定義です。
   */
  export type Key = string;

  /**
   * 書き込み可能なストリームを取得する際の引数定義です。
   */
  export type GetWritableArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

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
   */
  export type GetReadableArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

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
   */
  export type OpenArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * ストレージをクローズする際の引数定義です。
   */
  export type CloseArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * エラーハンドリングに必要な引数定義です。
   */
  export type OnOtherWriteErrorArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

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
   */
  export type WriteArgs<TData = any> = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

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
   */
  export type ReadArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

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
   */
  export type ExistsArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

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
   */
  export type DeleteArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

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
   */
  export type ClearArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

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
 */
export interface IWritableStream<TData = any> extends WritableStream<TData> {}

/**
 * 書き込み可能なストリームを提供するストレージ機能のインターフェースです。
 *
 * @template TData ストリームで扱うデータの型です。
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
 */
export interface IReadableStream<TData = any> extends ReadableStream<TData> {}

/**
 * 読み取り可能なストリームを提供するストレージ機能のインターフェースです。
 *
 * @template TData ストリームで扱うデータの型です。
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
   * @param args 書き込み対象のデータ、キー、コンテキストを含む引数オブジェクトです。
   * @returns 処理の完了を示す Promise、または void です。
   */
  write(args: IStorage.WriteArgs<TWriteDataInput>): MaybePromise<void>;

  /**
   * 指定されたキーに対応するデータをストレージから取得します。
   *
   * @param args 読み取り対象のキーとコンテキストを含む引数オブジェクトです。
   * @returns 取得されたデータ、またはそれを解決する Promise です。
   */
  read(args: IStorage.ReadArgs): MaybePromise<TReadDataOutput>;

  /**
   * 指定されたキーに対応するデータがストレージ内に存在するかを確認します。
   *
   * @param args 確認対象のキーとコンテキストを含む引数オブジェクトです。
   * @returns データが存在する場合は true、存在しない場合は false、またはそれらを解決する Promise です。
   */
  exists(args: IStorage.ExistsArgs): MaybePromise<boolean>;

  /**
   * 指定されたキーに対応するデータをストレージから削除します。
   *
   * @param args 削除対象のキーとコンテキストを含む引数オブジェクトです。
   * @returns 処理の完了を示す Promise、または void です。
   */
  delete(args: IStorage.DeleteArgs): MaybePromise<void>;

  /**
   * ストレージ内のすべてのデータを完全に消去します。
   *
   * @param args 消去操作に必要なコンテキストを含む引数オブジェクトです。
   * @returns 処理の完了を示す Promise、または void です。
   */
  clear(args: IStorage.ClearArgs): MaybePromise<void>;
}
