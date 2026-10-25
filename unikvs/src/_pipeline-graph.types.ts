import type { IReadableStream } from "@unikvs/core";

import type { VariablesStore } from "./_contexts.js";
import type UniKvsMiddleware from "./_middleware.js";
import type UniKvsStorage from "./_storage.js";

/**
 * パイプラインの葉となる宛先です。
 */
export type PipelineLeaf = {
  /**
   * データの永続化先です。
   */
  readonly storage: UniKvsStorage;

  /**
   * 宛先の登録順 (0 起点) です。
   */
  readonly index: number;

  /**
   * ストレージ名のキャッシュです。
   */
  readonly name: string;

  /**
   * 経路上に `AllowRepair` が存在するかどうかです。
   */
  readonly canRepair: boolean;

  /**
   * 葉 1 件分の凍結された名前空間です。
   */
  readonly nameNames: readonly string[];

  /**
   * 根直下から葉の直前までのノード列です。
   * グラフ自身の走査と内部単体テスト専用です。
   *
   * @internal
   */
  readonly path: readonly PipelineNode[];
};

/**
 * パイプラインの節となるミドルウェアです。
 */
export type PipelineNode = {
  /**
   * 節を構成するミドルウェアです。
   */
  readonly middleware: UniKvsMiddleware;

  /**
   * この節で終端する葉です。
   * 登録順に保持します。
   */
  readonly leaves: readonly PipelineLeaf[];

  /**
   * 子の節です。
   * 登録順に保持します。
   */
  readonly children: readonly PipelineNode[];

  /**
   * 直下の葉と節を登録順に列挙した静的な項目列です。
   */
  readonly entries: readonly PipelineEntry[];

  /**
   * 部分木の全葉です。
   * 登録順に保持します。
   */
  readonly allLeaves: readonly PipelineLeaf[];

  /**
   * 部分木の全葉名です。
   * 凍結されています。
   */
  readonly leafNames: readonly string[];
};

/**
 * 節または葉を登録順に列挙するための項目です。
 */
export type PipelineEntry =
  | {
      /**
       * 葉であることを示します。
       */
      readonly kind: "leaf";

      /**
       * 対象の葉です。
       */
      readonly leaf: PipelineLeaf;
    }
  | {
      /**
       * 節であることを示します。
       */
      readonly kind: "node";

      /**
       * 対象の節です。
       */
      readonly node: PipelineNode;
    };

/**
 * コンパイル前の宛先定義です。
 */
export type PipelineDestination = {
  /**
   * データの永続化先です。
   */
  readonly storage: UniKvsStorage;

  /**
   * 適用順のミドルウェア列です。末尾未使用分は含みません。
   */
  readonly middlewares: readonly UniKvsMiddleware[];
};

/**
 * 葉へ書き込むためのエンコード結果です。
 */
export type EncodeTarget = {
  /**
   * 対象の葉です。
   */
  readonly leaf: PipelineLeaf;

  /**
   * エンコード済みのデータです。
   */
  readonly data: unknown;

  /**
   * 写像済みのキーです。
   */
  readonly key: string;
};

/**
 * 解決済みの葉です。
 */
export type ResolvedLeaf = {
  /**
   * 対象の葉です。
   */
  readonly leaf: PipelineLeaf;

  /**
   * 写像済みのキーです。
   */
  readonly key: string;
};

/**
 * ストリームのエンコード先となる葉です。
 */
export type StreamEncodeTarget = {
  /**
   * 対象の葉です。
   */
  readonly leaf: PipelineLeaf;

  /**
   * 葉へ書き込むストリームです。
   */
  readonly stream: IReadableStream;

  /**
   * 写像済みのキーです。
   */
  readonly key: string;
};

/**
 * 構築済みのストリームエンコード木です。
 */
export type StreamEncodeTree = {
  /**
   * 登録順の書き込み対象です。
   */
  readonly targets: StreamEncodeTarget[];

  /**
   * 読み取り側へ渡すストリームです。`splitRead` を指定したときだけ分岐後の読み取り側になります。
   */
  readonly readStream: IReadableStream;
};

/**
 * 書き込み対象とする葉を判定する関数です。
 */
export interface IActiveLeafChecker {
  /**
   * 書き込み対象とする葉を判定します。
   *
   * @param leaf 対象の葉です。
   *
   * @returns 判定結果です。
   */
  (leaf: PipelineLeaf): boolean;
}

/**
 * 節の `encodeStream` または `mapKey` が失敗したときの処理を行う関数です。
 */
export interface IEncodeNodeErrorHandler {
  /**
   * 節のセットアップ失敗時の処理です。
   *
   * `true` を返すと節の部分木をスキップします。
   * 例外を投げた場合はそのまま伝播します。
   *
   * @param ex 節の取得または写像で発生した例外です。
   * @param activeLeaves 節の配下で対象となる葉です。
   *
   * @returns 部分木をスキップする場合は `true` を返します。
   */
  (ex: unknown, activeLeaves: readonly PipelineLeaf[]): boolean;
}

/**
 * ストリームエンコード木の構築オプションです。
 */
export type BuildEncodeTreeOptions = {
  /**
   * 書き込み対象とする葉を判定します。省略時は全葉が対象です。
   */
  readonly isActive?: IActiveLeafChecker | undefined;

  /**
   * 読み取り側と書き込み側を分岐するかどうかです。書き戻しで使用します。
   */
  readonly splitRead?: boolean | undefined;

  /**
   * 節のセットアップ失敗を分類します。省略時は生の例外として伝播します。
   */
  readonly onNodeError?: IEncodeNodeErrorHandler | undefined;
};

/**
 * 操作共通の実行時情報です。
 *
 * `store` は操作内の全コンテキストで共有され、下流の `set` が上流の `get` に見えます。
 */
export type OperationScope = {
  /**
   * 操作対象の論理キーです。
   */
  readonly key: string;

  /**
   * 中断シグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 操作内で共有される変数ストアです。
   */
  readonly store: VariablesStore;
};

/**
 * コンパイル中の節です。フィールドは finalize で確定します。
 */
export type MutableNode = {
  /**
   * 節を構成するミドルウェアです。
   */
  readonly middleware: UniKvsMiddleware;

  /**
   * この節で終端する葉です。登録順に保持します。
   */
  readonly leaves: PipelineLeaf[];

  /**
   * 子の節です。登録順に保持します。
   */
  readonly children: MutableNode[];

  /**
   * 直下の葉と節を登録順に列挙した項目列です。finalize で確定します。
   */
  entries: readonly PipelineEntry[];

  /**
   * 部分木の全葉です。登録順に保持します。finalize で確定します。
   */
  allLeaves: readonly PipelineLeaf[];

  /**
   * 部分木の全葉名です。finalize で確定します。
   */
  leafNames: readonly string[];
};
