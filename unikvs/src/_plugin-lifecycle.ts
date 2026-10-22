import type { MaybePromise } from "maypromise";

/**
 * 参照カウントで管理するプラグインの操作対象です。
 *
 * @template TOpenContext オープンコンテキストの型です。
 * @template TCloseContext クローズコンテキストの型です。
 */
interface IPlugin<TOpenContext, TCloseContext> {
  /**
   * プラグインが開かれているかどうかです。
   */
  get isOpen(): boolean;

  /**
   * プラグインを開く関数です。未定義のときは `open` を持たないものとして扱います。
   */
  open?(c: TOpenContext): MaybePromise<void>;

  /**
   * プラグインを閉じる関数です。未定義のときは `close` を持たないものとして扱います。
   */
  close?(c: TCloseContext): MaybePromise<void>;
}

/**
 * 共有プラグインの参照カウントと実 `close` の再試行を管理します。
 *
 * 同じプラグインを共有する利用者のうち、最初の `open` だけが実際に開き、最後の `close` だけが実際に閉じます。
 * 実 `close` に失敗したときは所有権を残し、次の `close` で再試行できるようにします。
 *
 * @template TOpenContext オープンコンテキストの型です。
 * @template TCloseContext クローズコンテキストの型です。
 */
export class PluginLifecycle<TOpenContext, TCloseContext> {
  /**
   * 参照カウントの対象です。
   */
  readonly #plugin: IPlugin<TOpenContext, TCloseContext>;

  /**
   * `open` した利用者の数です。最初の `open` だけが実際に開き、最後の `close` だけが実際に閉じます。
   * `close` を持たないプラグインは閉じられないため数えません。
   */
  #references: number;

  /**
   * 実 `close` に失敗したまま利用者の数が 0 になったかどうかです。
   *
   * このフラグが立っている間は、外部で開かれたプラグインではなく、閉じきれていない所有権が残っています。
   * 次の `open` が所有権を引き継ぎ、次の `close` が実 `close` を再試行します。
   */
  #closeFailed: boolean;

  public constructor(plugin: IPlugin<TOpenContext, TCloseContext>) {
    this.#plugin = plugin;
    this.#references = 0;
    this.#closeFailed = false;
  }

  /**
   * プラグインを開きます。
   *
   * 同じプラグインを共有する利用者のうち、最初の 1 回だけ実際の `open` を呼びます。
   * この管理対象外で既に開かれているプラグインは open/close の対象外にします。
   * 参照が残っていても実体が閉じられているときは、既存の参照を失わずに実 open へフォールバックします。
   * `close` を持たないプラグインは閉じられないため、参照を数えません。
   *
   * @param c オープンコンテキストです。
   */
  public async open(c: TOpenContext): Promise<void> {
    if (this.#plugin.open === undefined) {
      return;
    }

    // `close` を持たないプラグインは開いたままにしかできないため、参照を数えず、未 open のときだけ実 open します。
    if (this.#plugin.close === undefined) {
      if (this.#plugin.isOpen) {
        return;
      }

      await this.#plugin.open(c);
      return;
    }

    // この管理対象外の外部 open は対象外です。
    // 直前の close に失敗した所有権 (#closeFailed) がある間は、外部 open とみなしません。
    if (this.#plugin.isOpen && this.#references === 0 && !this.#closeFailed) {
      return;
    }

    if (this.#references > 0 || this.#closeFailed) {
      if (this.#plugin.isOpen) {
        // 既存の参照を失わずに加算します。close 失敗分の所有権もここで引き継ぎます。
        this.#references += 1;
        this.#closeFailed = false;
        return;
      }

      // 参照があるのに実体が閉じられているときは、実 open にフォールバックし、既存の参照を失わずに加算します。
      await this.#plugin.open(c);
      this.#references += 1;
      this.#closeFailed = false;
      return;
    }

    await this.#plugin.open(c);
    this.#references += 1;
  }

  /**
   * プラグインを閉じます。
   *
   * 同じプラグインを共有する利用者のうち、最後の 1 回だけ実際の `close` を呼びます。
   * 各呼び出しで参照を 1 つ減らし、実 `close` は全参照が解放されたときにだけ呼びます。
   * 実 `close` に失敗したときは所有権を残し、次の `close` で再試行できるようにします。
   * `close` を持たないプラグインは open で参照を数えないため、ここでは何もしません。
   * 実 `close` へ渡すコンテキストは最後に閉じる利用者のものであり、最初に開いた利用者の vars/signal は保持しません。
   *
   * @param c クローズコンテキストです。
   */
  public async close(c: TCloseContext): Promise<void> {
    if (this.#plugin.close === undefined) {
      return;
    }

    if (this.#references === 0 && !this.#closeFailed) {
      // この管理対象外のプラグインは閉じません。
      return;
    }

    if (this.#references > 0) {
      this.#references -= 1;
    }

    if (this.#references > 0) {
      // まだ利用者が残っているため、実体は閉じません。
      return;
    }

    if (!this.#plugin.isOpen) {
      // 既に外部で閉じられているため、未解放の所有権を解消します。
      this.#closeFailed = false;
      return;
    }

    await this.#closeReal(c);
  }

  /**
   * 失敗した実 `close` だけを再試行します。
   *
   * 通常の `close` と違い参照を減らしません。close 失敗後に新しい `open` が所有権を引き継いでいる場合は何もしません。
   * 実体が既に閉じられているときは失敗状態だけを解消します。
   *
   * @param c クローズコンテキストです。
   */
  public async retryClose(c: TCloseContext): Promise<void> {
    if (this.#plugin.close === undefined) {
      return;
    }

    // 新しい open が所有権を引き継いでいる場合は、その参照を解放しないよう何もしません。
    if (!this.#closeFailed || this.#references > 0) {
      return;
    }

    if (!this.#plugin.isOpen) {
      // 既に外部で閉じられているため、未解放の所有権を解消します。
      this.#closeFailed = false;
      return;
    }

    await this.#closeReal(c);
  }

  /**
   * 実 `close` を実行し、失敗したかどうかを記録します。
   *
   * @param c クローズコンテキストです。
   */
  async #closeReal(c: TCloseContext): Promise<void> {
    if (this.#plugin.close === undefined) {
      return;
    }

    try {
      await this.#plugin.close(c);
      this.#closeFailed = false;
    } catch (ex) {
      // 閉じるのに失敗したときは未解放として記録し、次の close で再試行できるようにします。
      this.#closeFailed = true;
      throw ex;
    }
  }
}
