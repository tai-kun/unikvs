import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type ListObjectsV2CommandOutput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { IStorage } from "@unikvs/core";

/**
 * AWS S3（または互換オブジェクトストレージ）を永続化先として使用するストレージクラスです。
 */
export default class S3 implements IStorage {
  /**
   * S3 クライアントのインスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  private client: S3Client | null;

  /**
   * データを保存する S3 のバケット名です。
   */
  private readonly bucket: string;

  /**
   * S3Client の初期化に使用する設定オブジェクトです。
   */
  private readonly config: S3ClientConfig;

  public readonly name: string;

  /**
   * S3 インスタンスを初期化します。
   *
   * @param bucket データを保存する対象のバケット名です。
   * @param config リージョンや認証情報など、S3Client に渡す設定です。
   */
  public constructor(bucket: string, config: S3ClientConfig = {}) {
    this.name = "S3";
    this.client = null;
    this.bucket = bucket;
    this.config = config;
  }

  public get isOpen(): boolean {
    return !!this.client;
  }

  public open(): void {
    this.client = new S3Client(this.config);
  }

  public close(): void {
    this.client!.destroy();
    this.client = null;
  }

  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal">,
  ): Promise<void> {
    const { key, data, signal } = args;

    await this.client!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
      }),
      { abortSignal: signal },
    );
  }

  public async read(
    args: Pick<IStorage.ReadArgs, "key" | "signal">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { key, signal } = args;

    const response = await this.client!.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { abortSignal: signal },
    );

    if (!response.Body) {
      throw new Error(`[S3 Storage] Body is empty for key: ${key}`);
    }

    const byteArray = await response.Body.transformToByteArray();

    return byteArray satisfies Uint8Array as Uint8Array<ArrayBuffer>;
  }

  public async exists(args: Pick<IStorage.ExistsArgs, "key" | "signal">): Promise<boolean> {
    const { key, signal } = args;

    try {
      await this.client!.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
        { abortSignal: signal },
      );
      return true;
    } catch (ex: any) {
      // S3 の HeadObject はオブジェクトが存在しない場合に 404 NotFound エラーを投げます。
      if (ex.name === "NotFound" || ex.$metadata?.httpStatusCode === 404) {
        return false;
      }

      throw ex;
    }
  }

  public async delete(args: Pick<IStorage.DeleteArgs, "key" | "signal">): Promise<void> {
    const { key, signal } = args;

    await this.client!.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { abortSignal: signal },
    );
  }

  public async clear(args: Pick<IStorage.ClearArgs, "signal">): Promise<void> {
    const { signal } = args;

    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    // バケット内のオブジェクトをページネーションで取得し、全て削除します。
    while (isTruncated) {
      const response: ListObjectsV2CommandOutput = await this.client!.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ContinuationToken: continuationToken,
        }),
        { abortSignal: signal },
      );

      const contents = response.Contents;
      if (!contents || contents.length === 0) {
        break;
      }

      // 削除対象のオブジェクトリストを生成
      const objectsToDelete = contents
        .filter((item) => item.Key !== undefined)
        .map((item) => ({ Key: item.Key as string }));

      if (objectsToDelete.length > 0) {
        await this.client!.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: objectsToDelete,
            },
          }),
          { abortSignal: signal },
        );
      }

      isTruncated = response.IsTruncated ?? false;
      continuationToken = response.NextContinuationToken;
    }
  }

  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "context" | "key">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    const { key, context } = args;

    const { writable, readable } = new TransformStream<
      Uint8Array<ArrayBuffer>,
      Uint8Array<ArrayBuffer>
    >();
    const upload = new Upload({
      client: this.client!,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: readable,
      },
      partSize: context["unikvs:s3:part_size"] as number,
    });

    // Upload 処理をバックグラウンドで開始します。
    const uploadPromise = upload.done();
    const writableProxy = new WritableStream({
      async write(chunk) {
        const writer = writable.getWriter();
        await writer.write(chunk);
        writer.releaseLock();
      },
      async close() {
        const writer = writable.getWriter();
        await writer.close();
        writer.releaseLock();

        await uploadPromise;
      },
      async abort(reason) {
        const writer = writable.getWriter();
        await writer.abort(reason);
        writer.releaseLock();

        await upload.abort();
      },
    });

    return writableProxy;
  }

  public async getReadable(
    args: Pick<IStorage.GetReadableArgs, "key" | "signal">,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    const { key, signal } = args;

    const response = await this.client!.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { abortSignal: signal },
    );

    if (!response.Body) {
      throw new Error(`[S3 Storage] Body is empty for key: ${key}`);
    }

    return response.Body.transformToWebStream();
  }
}
