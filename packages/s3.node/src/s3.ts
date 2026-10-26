import {
  type S3ClientConfig,
  type ListObjectsV2CommandOutput,
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { type IStorage, StorageAbortedError, InvalidPartSizeError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#s3storageoptions)
 */
export type S3StorageOptions = {};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#s3)
 */
export default class S3 implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#s3)
   */
  public readonly name: string;

  /**
   * S3 クライアントのインスタンスを保持します。
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
   * S3Client の初期化に使用する設定オブジェクトです。
   */
  readonly #config: S3ClientConfig;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#s3)
   */
  public constructor(bucket: string, config: S3ClientConfig = {}, _options: S3StorageOptions = {}) {
    this.name = "S3";
    this.#client = null;
    this.#bucket = bucket;
    this.#config = config;
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
   * AWS SDK の S3 クライアントを初期化します。
   *
   * @param _c オープンコンテキストです。
   */
  public open(_c: IStorage.OpenContext): void {
    this.#client?.destroy();
    this.#client = new S3Client(this.#config);
  }

  /**
   * ストレージをクローズします。
   *
   * クライアントを破棄して参照を外します。
   *
   * @param _c クローズコンテキストです。
   */
  public close(_c: IStorage.CloseContext): void {
    const client = this.#getClient();
    client.destroy();

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
    const command = new PutObjectCommand({
      Key: c.key,
      Body: data,
      Bucket: this.#bucket,
    });
    await this.#getClient().send(command, { abortSignal: c.signal });
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
    const command = new GetObjectCommand({
      Key: c.key,
      Bucket: this.#bucket,
    });
    const response = await this.#getClient().send(command, { abortSignal: c.signal });
    const body = response.Body;

    if (body === undefined) {
      throw new TypeError("S3: Missing response body.");
    }

    const byteArray = await body.transformToByteArray();

    return byteArray satisfies Uint8Array as Uint8Array<ArrayBuffer>;
  }

  /**
   * キーの存在を確認します。
   *
   * 存在しないときは偽を返します。
   *
   * @param c 存在確認コンテキストです。
   *
   * @returns 存在すれば真です。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Key: c.key,
        Bucket: this.#bucket,
      });
      await this.#getClient().send(command, { abortSignal: c.signal });

      return true;
    } catch (ex) {
      const s3Error = ex as {
        name?: unknown;
        $metadata?: { httpStatusCode?: unknown };
      };

      if (s3Error.name === "NotFound" || s3Error.$metadata?.httpStatusCode === 404) {
        return false;
      }

      throw ex;
    }
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
    const command = new DeleteObjectCommand({
      Key: c.key,
      Bucket: this.#bucket,
    });
    await this.#getClient().send(command, { abortSignal: c.signal });
  }

  /**
   * バケット内のオブジェクトをすべて削除します。
   *
   * 一覧を頁送りで取得し、まとめて削除します。
   *
   * @param c クリアコンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.#bucket,
        ContinuationToken: continuationToken,
      });
      const response: ListObjectsV2CommandOutput = await this.#getClient().send(listCommand, {
        abortSignal: c.signal,
      });
      const contents = response.Contents;

      if (!contents || contents.length === 0) {
        break;
      }

      const objectsToDelete = contents
        .map((item) => item.Key)
        .filter((key) => key !== undefined)
        .map((key) => ({ Key: key }));

      if (objectsToDelete.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.#bucket,
          Delete: {
            Objects: objectsToDelete,
          },
        });
        await this.#getClient().send(deleteCommand, { abortSignal: c.signal });
      }

      isTruncated = response.IsTruncated ?? false;
      continuationToken = response.NextContinuationToken;
    }
  }

  /**
   * 書き込み用ストリームを取得します。
   *
   * コンテキストのパートサイズ設定でマルチパートアップロードを行います。
   *
   * @param c 書き込みストリーム取得コンテキストです。
   *
   * @returns 書き込み用ストリームです。
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    if (c.signal.aborted) {
      throw new StorageAbortedError({ key: c.key });
    }

    let partSize: number | undefined = undefined;
    const rawPartSize =
      c.get("@unikvs/s3.node:partSize") !== undefined
        ? c.get("@unikvs/s3.node:partSize")
        : c.get("@unikvs/s3:partSize");

    if (rawPartSize !== undefined) {
      if (typeof rawPartSize !== "number" || !Number.isInteger(rawPartSize) || rawPartSize <= 0) {
        throw new InvalidPartSizeError({ actual: rawPartSize });
      }

      partSize = rawPartSize;
    }

    const { readable, writable } = new TransformStream<
      Uint8Array<ArrayBuffer>,
      Uint8Array<ArrayBuffer>
    >();
    const abortController = new AbortController();
    const onAbort = (): void => {
      abortController.abort(c.signal.reason);
    };
    c.signal.addEventListener("abort", onAbort, { once: true });

    const upload = new Upload({
      client: this.#getClient(),
      params: {
        Key: c.key,
        Body: readable,
        Bucket: this.#bucket,
      },
      abortController,
      ...(partSize !== undefined && { partSize }),
    });

    const writer = writable.getWriter();
    const uploadPromise = upload.done();
    const removeAbortListener = (): void => {
      c.signal.removeEventListener("abort", onAbort);
    };
    void (async (): Promise<void> => {
      try {
        await uploadPromise;
      } catch (reason: unknown) {
        try {
          await writer.abort(reason);
        } catch {
          // 後始末の失敗は無視します。
        }
      } finally {
        removeAbortListener();
      }
    })();

    return new WritableStream({
      async abort(reason) {
        await writer.abort(reason);

        try {
          await upload.abort();
        } catch {
          // 中断時の失敗は無視します。
        }

        removeAbortListener();
      },
      async close() {
        await writer.close();
        await uploadPromise;
        removeAbortListener();
      },
      async write(chunk) {
        await writer.write(chunk);
      },
    });
  }

  /**
   * 読み取り用ストリームを取得します。
   *
   * S3 オブジェクトの内容をストリームで送出します。
   *
   * @param c 読み取りストリーム取得コンテキストです。
   *
   * @returns 読み取り用ストリームを解決します。
   */
  public async getReadable(
    c: IStorage.GetReadableContext,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    const command = new GetObjectCommand({
      Key: c.key,
      Bucket: this.#bucket,
    });
    const response = await this.#getClient().send(command, { abortSignal: c.signal });
    const body = response.Body;

    if (body === undefined) {
      throw new TypeError("S3: Missing response body.");
    }

    return body.transformToWebStream();
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
      throw new TypeError("S3: AWS client is not open. Call open() first.");
    }

    return client;
  }
}
