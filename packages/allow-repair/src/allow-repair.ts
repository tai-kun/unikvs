import { type IMiddleware, RepairNotAllowedError } from "@unikvs/core";
import { PassThrough } from "@unikvs/passthrough";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
 */
export default class AllowRepair extends PassThrough implements IMiddleware {
  public override readonly name: string = "AllowRepair";

  /**
   * 書き戻し許可状態の内部保持です。
   */
  #isEnabled: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public constructor() {
    super();

    this.#isEnabled = true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public get enabled(): boolean {
    return this.#isEnabled;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public enable(): void {
    this.#isEnabled = true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public disable(): void {
    this.#isEnabled = false;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/allow-repair#usage)
   */
  public toggle(): boolean {
    this.#isEnabled = !this.#isEnabled;

    return this.#isEnabled;
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    if (c.action === "get" || c.action === "stream") {
      if (c.repair.enabled && !this.#isEnabled) {
        throw new RepairNotAllowedError({ names: c.repair.targets });
      }
    }

    await next();
  }
}
