import { RepairNotAllowedError, type ITransformer, type Variables } from "@unikvs/core";

// vars から書き戻し先の表示名一覧を解決します。
// 配列でないときや空のときは代替名を1件返します。
function resolveRepairNames(vars: Variables, fallback: string): readonly string[] {
  const list = vars["unikvs:storageNames"];
  if (!Array.isArray(list)) {
    return [fallback];
  }

  const names = list.filter((name): name is string => typeof name === "string" && name !== "");
  if (names.length > 0) {
    return names;
  }

  return [fallback];
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
 */
export default class AllowRepair implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public readonly name: string;

  /**
   * 書き戻し許可状態の内部保持です。
   */
  private isEnabled: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public constructor() {
    this.name = "AllowRepair";
    this.isEnabled = true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public get enabled(): boolean {
    return this.isEnabled;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public enable(): void {
    this.isEnabled = true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public disable(): void {
    this.isEnabled = false;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public toggle(): boolean {
    this.isEnabled = !this.isEnabled;
    return this.isEnabled;
  }

  /**
   * 書き戻しによる書き込みが許可されているかを検証します。
   *
   * @param args 書き込みの引数です。実行時変数に書き戻しの目印がある場合に判定します。
   */
  private assertRepairAllowed(args: { vars: Variables }): void {
    if (args.vars["unikvs:repair"] === true && !this.isEnabled) {
      throw new RepairNotAllowedError({ names: resolveRepairNames(args.vars, this.name) });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public encode<TData>(args: Pick<ITransformer.EncodeArgs<TData>, "vars" | "data">): TData {
    this.assertRepairAllowed(args);
    return args.data;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public decode<TData>(args: Pick<ITransformer.DecodeArgs<TData>, "data">): TData {
    return args.data;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#streams)
   */
  public getEncodable(
    args: Pick<ITransformer.GetEncodableArgs, "vars">,
  ): TransformStream<any, any> {
    this.assertRepairAllowed(args);
    return new TransformStream();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#streams)
   */
  public getDecodable(): TransformStream<any, any> {
    return new TransformStream();
  }
}
