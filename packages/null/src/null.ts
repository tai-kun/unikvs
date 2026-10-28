import { type IStorage, KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
 */
export default class Null implements IStorage {
  /**
   * ストレージ名です。常に `Null` を返します。
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public constructor() {
    this.name = "Null";
  }

  /**
   * ストレージが利用可能かどうかを返します。Null は常に利用可能です。
   *
   * @returns 常に true を返します。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * 書き込みを受け付けますが何も保存しません。
   *
   * @param _c 使用しない書き込み用コンテキストです。
   * @param _data 使用しない保存値です。
   */
  public write(_c: IStorage.WriteContext, _data: any): void {}

  /**
   * 常にキーが見つからないエラーを投げます。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns 値を返さず常にエラーを投げます。
   */
  public read(c: IStorage.ReadContext): never {
    throw new KeyNotFoundError({ key: c.key });
  }

  /**
   * 指定したキーが存在するかどうかを返します。常に存在しません。
   *
   * @param _c 使用しない存在確認用コンテキストです。
   *
   * @returns 常に false を返します。
   */
  public exists(_c: IStorage.ExistsContext): false {
    return false;
  }

  /**
   * 常にキーが見つからないエラーを投げます。
   *
   * @param c 削除するキーを持つコンテキストです。
   *
   * @returns 値を返さず常にエラーを投げます。
   */
  public delete(c: IStorage.DeleteContext): never {
    throw new KeyNotFoundError({ key: c.key });
  }

  /**
   * 常にキーが見つからないエラーを投げます。
   *
   * @param c コピー元とコピー先のキーを持つコンテキストです。
   *
   * @returns 値を返さず常にエラーを投げます。
   */
  public copy(c: IStorage.CopyContext): never {
    return this.read(c);
  }

  /**
   * 常にキーが見つからないエラーを投げます。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   *
   * @returns 値を返さず常にエラーを投げます。
   */
  public move(c: IStorage.MoveContext): never {
    return this.read(c);
  }

  /**
   * クリアを受け付けますが何もしません。
   *
   * @param _c 使用しないクリア用コンテキストです。
   */
  public clear(_c: IStorage.ClearContext): void {}

  /**
   * 書き込みを受け付けるが破棄するストリームを作成します。
   *
   * @param _c 使用しない書き込み用コンテキストです。
   *
   * @returns 書き込まれたデータを破棄するストリームです。
   */
  public getWritable(_c: IStorage.GetWritableContext): WritableStream {
    return new WritableStream({
      write() {},
    });
  }

  /**
   * 常にキーが見つからないエラーを投げます。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns 値を返さず常にエラーを投げます。
   */
  public getReadable(c: IStorage.GetReadableContext): never {
    throw new KeyNotFoundError({ key: c.key });
  }
}
