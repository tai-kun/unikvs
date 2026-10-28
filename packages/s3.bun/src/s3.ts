import {
  type IStorage,
  type IPipelineContext,
  KeyNotFoundError,
  StorageAbortedError,
  InvalidPartSizeError,
  UnsupportedRuntimeError,
} from "@unikvs/core";
import type { S3Client, S3Options } from "bun";

import { StorageNotOpenError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#s3storageoptions)
 */
export type S3StorageOptions = Omit<S3Options, "bucket">;

/**
 * Bun の S3 クライアントの失敗がキーの欠番を表すかどうかを判定します。
 *
 * バケット自体が存在しない失敗は、キーの欠番と区別します。
 *
 * @param ex 判定する失敗です。
 *
 * @returns キーが存在しなければ真です。
 */
function isKeyNotFoundError(ex: unknown): boolean {
  if (typeof ex !== "object" || ex === null) {
    return false;
  }

  const error = ex as {
    code?: unknown;
    name?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };

  if (error.name === "NoSuchBucket" || error.code === "NoSuchBucket") {
    return false;
  }

  return (
    error.name === "NoSuchKey" ||
    error.code === "NoSuchKey" ||
    error.name === "NotFound" ||
    error.code === "NotFound" ||
    error.status === 404 ||
    error.statusCode === 404
  );
}

/**
 * `clear()` で同時に削除するオブジェクト数の上限です。
 * 1 ページ分の削除リクエストを過度に並列化しないために使用します。
 */
const DELETE_CONCURRENCY = 25;

/**
 * 書き込みストリームのパートサイズをコンテキストから解決します。
 * パッケージ固有の変数を優先し、なければ共通の変数を参照します。
 *
 * @param c パイプラインコンテキストです。
 *
 * @returns 解決したパートサイズです。未指定のときは undefined です。
 */
function resolvePartSize(c: Pick<IPipelineContext, "get">): number | undefined {
  const rawPartSize =
    c.get("@unikvs/s3.bun:partSize") !== undefined
      ? c.get("@unikvs/s3.bun:partSize")
      : c.get("@unikvs/s3:partSize");
  let partSize: number | undefined = undefined;

  if (rawPartSize !== undefined) {
    if (typeof rawPartSize !== "number" || !Number.isInteger(rawPartSize) || rawPartSize <= 0) {
      throw new InvalidPartSizeError({ actual: rawPartSize });
    }

    partSize = rawPartSize;
  }

  return partSize;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#s3)
 */
export default class S3 implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#s3)
   */
  public readonly name: string;

  /**
   * Bun の S3 クライアントのインスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  #client: S3Client | null;

  /**
   * データを保存する S3 のバケット名です。
   *
   * すべての操作でこのバケットが使用されます。
   */
  readonly #bucket: string;

  /**
   * `S3Client` の初期化に使用する設定オブジェクトです。
   */
  readonly #options: S3StorageOptions;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#s3)
   */
  public constructor(bucket: string, options: S3StorageOptions = {}) {
    this.name = "S3";
    this.#client = null;
    this.#bucket = bucket;
    this.#options = { ...options };
  }

  /**
   * ストレージがオープン済みかどうかです。
   *
   * @returns オープン済みなら真です。
   */
  public get isOpen(): boolean {
    return Boolean(this.#client);
  }

  /**
   * ストレージをオープンします。
   *
   * Bun の S3 クライアントを初期化します。
   *
   * @param _c オープンコンテキストです。
   *
   * @returns オープンが完了したら解決します。
   */
  public async open(_c: IStorage.OpenContext): Promise<void> {
    // Bun 以外のランタイムで誤って使われた場合に、原因の分かるエラーを返します。
    if (typeof Bun === "undefined") {
      throw new UnsupportedRuntimeError({
        name: this.name,
        runtime: "Bun",
      });
    }

    // オープン済みの場合は既存のクライアントを破棄し、開き直しでリークしないようにします。
    if (this.#client) {
      this.close(_c as unknown as IStorage.CloseContext);
    }

    const { S3Client: S3ClientImpl } = await import("bun");
    this.#client = new S3ClientImpl({
      ...this.#options,
      bucket: this.#bucket,
    });
  }

  /**
   * ストレージをクローズします。
   *
   * 参照を外してクライアントを破棄します。
   *
   * @param _c クローズコンテキストです。
   */
  public close(_c: IStorage.CloseContext): void {
    if (!this.#client) {
      throw new StorageNotOpenError();
    }

    // Bun の S3Client には破棄用の API がないため、参照を外して GC に委ねます。
    this.#client = null;
  }

  /**
   * バイト列を書き込みます。
   *
   * 指定したキーでオブジェクトを上書きします。
   *
   * @param c 書き込みコンテキストです。
   * @param data 保存するバイト列です。
   *
   * @returns 書き込みが完了したら解決します。
   */
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    c.signal.throwIfAborted();

    await this.#getClient().write(c.key, data);
  }

  /**
   * バイト列を読み取ります。
   *
   * 指定したキーのオブジェクトを取得します。
   *
   * @param c 読み取りコンテキストです。
   *
   * @returns 読み取ったバイト列です。
   */
  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();

    const buffer = await this.#getClient().file(c.key).arrayBuffer();

    return new Uint8Array(buffer);
  }

  /**
   * キーの存在を確認します。
   *
   * @param c 存在確認コンテキストです。
   *
   * @returns 存在すれば真です。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    c.signal.throwIfAborted();

    return this.#getClient().exists(c.key);
  }

  /**
   * キーを削除します。
   *
   * 存在しないキーも成功扱いにします。
   *
   * @param c 削除コンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    c.signal.throwIfAborted();

    await this.#getClient().delete(c.key);
  }

  /**
   * キーの値を別のキーへ複製します。
   *
   * コピー先に既存のオブジェクトがあるときは上書きします。
   * コピー元が存在しないときは `KeyNotFoundError` を投げます。
   *
   * @param c 複製元と複製先のキーを持つコンテキストです。
   *
   * @returns 複製が完了したら解決します。
   */
  public async copy(c: IStorage.CopyContext): Promise<void> {
    c.signal.throwIfAborted();

    if (c.key === c.destinationKey) {
      await this.#assertKeyExists(c.key, c.signal);

      return;
    }

    await this.#copyKey(c.key, c.destinationKey, c.signal);
  }

  /**
   * キーの値を別のキーへ移動します。
   *
   * 複製先の書き込みが完了してから複製元を削除します。
   * 複製先の書き込みに失敗したときは複製元を残します。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   *
   * @returns 移動が完了したら解決します。
   */
  public async move(c: IStorage.MoveContext): Promise<void> {
    c.signal.throwIfAborted();

    if (c.key === c.destinationKey) {
      await this.#assertKeyExists(c.key, c.signal);

      return;
    }

    await this.#copyKey(c.key, c.destinationKey, c.signal);
    c.signal.throwIfAborted();

    await this.#getClient().delete(c.key);
  }

  /**
   * バケット内のオブジェクトをすべて削除します。
   *
   * 一覧を頁送りで取得し、並列数を抑えて削除します。
   *
   * @param c クリアコンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    const client = this.#getClient();

    c.signal.throwIfAborted();

    let continuationToken: string | undefined = undefined;

    do {
      c.signal.throwIfAborted();

      const response = await client.list(
        continuationToken === undefined ? null : { continuationToken },
      );
      const contents = response.contents ?? [];

      for (let start = 0; start < contents.length; start += DELETE_CONCURRENCY) {
        c.signal.throwIfAborted();

        await Promise.all(
          contents.slice(start, start + DELETE_CONCURRENCY).map((item) => client.delete(item.key)),
        );
      }

      continuationToken =
        (response.isTruncated ?? false) ? response.nextContinuationToken : undefined;
    } while (continuationToken !== undefined);
  }

  /**
   * 書き込み用ストリームを取得します。
   *
   * コンテキストのパートサイズ設定でマルチパート書き込みを行います。
   *
   * @param c 書き込みストリーム取得コンテキストです。
   *
   * @returns 書き込み用ストリームです。
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    if (c.signal.aborted) {
      throw new StorageAbortedError({ key: c.key });
    }

    const partSize = resolvePartSize(c);
    const writer = this.#getClient()
      .file(c.key)
      .writer(partSize === undefined ? {} : { partSize });

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async abort() {
        // Bun の NetworkSink には中断用の API がないため、end を呼ばずに破棄します。
        // 完了していないマルチパートアップロードはオブジェクトとして公開されません。
      },
      async close() {
        c.signal.throwIfAborted();
        await writer.end();
      },
      async write(chunk) {
        c.signal.throwIfAborted();
        await writer.write(chunk);
      },
    });
  }

  /**
   * 読み取り用ストリームを取得します。
   *
   * S3 オブジェクトの内容を順次送出します。
   *
   * @param c 読み取りストリーム取得コンテキストです。
   *
   * @returns 読み取り用ストリームです。
   */
  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();

    const reader = this.#getClient().file(c.key).stream().getReader();

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        c.signal.throwIfAborted();

        const { done, value } = await reader.read();

        if (done) {
          controller.close();

          return;
        }

        controller.enqueue(value);
      },
      async cancel(reason) {
        await reader.cancel(reason);
      },
    });
  }

  /**
   * キーのオブジェクトが存在することを確認します。
   *
   * 同じキーへの複製や移動で、欠番を成功扱いにしないために使用します。
   *
   * @param key 確認するキーです。
   * @param signal 中断を知らせるシグナルです。
   *
   * @returns キーが存在すれば解決します。
   */
  async #assertKeyExists(key: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();

    if (!(await this.#getClient().exists(key))) {
      throw new KeyNotFoundError({ key });
    }
  }

  /**
   * 読み取りと書き込みでオブジェクトを複製します。
   *
   * コピー元の欠番は `KeyNotFoundError` に変換します。
   *
   * @param sourceKey 複製元のキーです。
   * @param destinationKey 複製先のキーです。
   * @param signal 中断を知らせるシグナルです。
   *
   * @returns 複製が完了したら解決します。
   */
  async #copyKey(sourceKey: string, destinationKey: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();

    const client = this.#getClient();
    let data: Uint8Array<ArrayBuffer>;

    try {
      const buffer = await client.file(sourceKey).arrayBuffer();
      data = new Uint8Array(buffer);
    } catch (ex) {
      if (isKeyNotFoundError(ex)) {
        throw new KeyNotFoundError({ key: sourceKey });
      }

      throw ex;
    }

    signal.throwIfAborted();
    await client.write(destinationKey, data);
  }

  /**
   * オープン済みのクライアントを返します。
   *
   * 未オープン時は例外を投げます。
   *
   * @returns オープン済みの S3 クライアントです。
   */
  #getClient(): S3Client {
    const client = this.#client;

    if (client === null) {
      throw new TypeError("S3: Bun S3 client is not open. Call open() first.");
    }

    return client;
  }
}
