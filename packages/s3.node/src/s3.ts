import {
  type S3ClientConfig,
  type ListObjectsV2CommandOutput,
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { IStorage } from "@unikvs/core";

/**
 * AWS S3（または互換オブジェクトストレージ）を永続化先として使用するストレージクラスです。
 *
 * 指定されたバケットに対してオブジェクトの読み書き、存在確認、削除、一括消去の操作を提供します。また、ストリームを用いたアップロードおよびダウンロードにも対応しています。
 *
 * コンテキストに `@unikvs/s3.node:partSize` または `@unikvs/s3:partSize` を指定することで、パートサイズ（バイト単位）を変更できます。
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
   *
   * すべての操作でこのバケットが使用されます。
   */
  private readonly bucket: string;

  /**
   * S3Client の初期化に使用する設定オブジェクトです。
   */
  private readonly config: S3ClientConfig;

  /**
   * ストレージの名前です。デバッグメッセージなどに使用されます。
   */
  public readonly name: string;

  /**
   * S3 インスタンスを初期化します。
   *
   * @param bucket データを保存する対象のバケット名です。
   * @param config リージョンや認証情報など、S3Client に渡す設定です。デフォルトは空オブジェクトです。
   */
  public constructor(bucket: string, config: S3ClientConfig = {}) {
    this.name = "S3";
    this.client = null;
    this.bucket = bucket;
    this.config = config;
  }

  /**
   * ストレージが現在利用可能な状態であるかを示します。
   */
  public get isOpen(): boolean {
    return !!this.client;
  }

  /**
   * ストレージをオープンし、読み書きが可能な状態に準備します。
   */
  public open(): void {
    this.client = new S3Client(this.config);
  }

  /**
   * ストレージを安全にクローズします。
   */
  public close(): void {
    this.client!.destroy();
    this.client = null;
  }

  /**
   * 指定されたデータを、対応するキーでストレージに保存します。
   *
   * @param args.key 保存先のキーです。
   * @param args.data 保存するバイト配列です。
   * @param args.signal 中断シグナルです。
   */
  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal">,
  ): Promise<void> {
    const { key, data, signal: abortSignal } = args;

    const command = new PutObjectCommand({
      Key: key,
      Body: data,
      Bucket: this.bucket,
    });
    await this.client!.send(command, { abortSignal });
  }

  /**
   * 指定されたキーに対応するデータをストレージから取得します。
   *
   * @param args.key 取得元のキーです。
   * @param args.signal 中断シグナルです。
   * @returns キーに対応するバイト配列です。
   */
  public async read(
    args: Pick<IStorage.ReadArgs, "key" | "signal">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { key, signal: abortSignal } = args;

    const command = new GetObjectCommand({
      Key: key,
      Bucket: this.bucket,
    });
    const response = await this.client!.send(command, { abortSignal });
    const byteArray = await response.Body!.transformToByteArray();

    return byteArray satisfies Uint8Array as Uint8Array<ArrayBuffer>;
  }

  /**
   * 指定されたキーに対応するデータがストレージ内に存在するかを確認します。
   *
   * @param args.key 確認するキーです。
   * @param args.signal 中断シグナルです。
   * @returns キーに対応するデータが存在する場合は true、それ以外は false です。
   */
  public async exists(args: Pick<IStorage.ExistsArgs, "key" | "signal">): Promise<boolean> {
    const { key, signal: abortSignal } = args;

    try {
      const command = new HeadObjectCommand({
        Key: key,
        Bucket: this.bucket,
      });
      await this.client!.send(command, { abortSignal });

      return true;
    } catch (ex: any) {
      if (ex.name === "NotFound" || ex.$metadata?.httpStatusCode === 404) {
        return false;
      }

      throw ex;
    }
  }

  /**
   * 指定されたキーに対応するデータをストレージから削除します。
   *
   * @param args.key 削除するキーです。
   * @param args.signal 中断シグナルです。
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key" | "signal">): Promise<void> {
    const { key, signal: abortSignal } = args;

    const command = new DeleteObjectCommand({
      Key: key,
      Bucket: this.bucket,
    });
    await this.client!.send(command, { abortSignal });
  }

  /**
   * ストレージ内のすべてのデータを完全に消去します。
   *
   * バケット内のオブジェクトをページネーションで取得し、全て削除します。
   *
   * @param args.signal 中断シグナルです。
   */
  public async clear(args: Pick<IStorage.ClearArgs, "signal">): Promise<void> {
    const { signal: abortSignal } = args;

    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        ContinuationToken: continuationToken,
      });
      const response: ListObjectsV2CommandOutput = await this.client!.send(command, {
        abortSignal,
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
        const command = new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: objectsToDelete,
          },
        });
        await this.client!.send(command, { abortSignal });
      }

      isTruncated = response.IsTruncated ?? false;
      continuationToken = response.NextContinuationToken;
    }
  }

  /**
   * 指定されたキーに対応する書き込み可能なストリームを取得します。
   *
   * @param args.key 書き込み先のキーです。
   * @param args.context パートサイズなどのオプションを含むコンテキストオブジェクトです。
   * @returns 書き込み可能なストリームです。
   */
  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "context" | "key">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    const { key, context } = args;
    const partSize = context["@unikvs/s3.node:partSize"] ?? context["@unikvs/s3:partSize"];

    const { writable, readable } = new TransformStream<
      Uint8Array<ArrayBuffer>,
      Uint8Array<ArrayBuffer>
    >();
    const upload = new Upload({
      client: this.client!,
      params: {
        Key: key,
        Body: readable,
        Bucket: this.bucket,
      },
      partSize: partSize as number,
    });

    const writer = writable.getWriter();
    const uploadPromise = upload.done();
    void uploadPromise.catch(async (reason: unknown) => {
      try {
        await writer.abort(reason);
      } catch {}
    });

    return new WritableStream({
      async write(chunk) {
        await writer.write(chunk);
      },
      async close() {
        await writer.close();
        await uploadPromise;
      },
      async abort(reason) {
        await writer.abort(reason);
        await upload.abort().catch(() => {});
      },
    });
  }

  /**
   * 指定されたキーに対応する読み取り可能なストリームを取得します。
   *
   * @param args.key 読み取り元のキーです。
   * @param args.signal 中断シグナルです。
   * @returns 読み取り可能なストリームです。
   */
  public async getReadable(
    args: Pick<IStorage.GetReadableArgs, "key" | "signal">,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    const { key, signal: abortSignal } = args;

    const command = new GetObjectCommand({
      Key: key,
      Bucket: this.bucket,
    });
    const response = await this.client!.send(command, { abortSignal });
    const readableStream = response.Body!.transformToWebStream();

    return readableStream;
  }
}
