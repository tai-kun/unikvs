/**
 * 複数の AbortSignal を 1 つに結合します。
 *
 * @param signals 結合対象となる AbortSignal、または null / undefined の配列です。
 * @returns 結合された新しい AbortSignal です。
 */
let combineSignals: (signals: readonly (AbortSignal | null | undefined)[]) => AbortSignal;

if ("any" in AbortSignal && typeof AbortSignal.any === "function") {
  // AbortSignal.any がネイティブでサポートされている場合はそれを使用します。

  const AbortSignalAny = AbortSignal.any.bind(AbortSignal);
  combineSignals = function combineSignals(inputSignals) {
    const signals = inputSignals.filter((signal) => signal instanceof AbortSignal);
    return AbortSignalAny(signals);
  };
} else {
  // AbortSignal.any が未実装の環境向けのポリフィル実装です。

  combineSignals = function combineSignals(inputSignals) {
    const ac = new AbortController();
    const signals: AbortSignal[] = [];
    for (const signal of inputSignals) {
      if (signal?.aborted) {
        // すでに中断されている場合は、その理由（reason）を使用して即座に中断処理を行います。
        ac.abort(signal.reason);
        return ac.signal;
      }

      if (signal instanceof AbortSignal) {
        signals.push(signal);
      }
    }

    /**
     * すべての監視対象信号からイベントリスナーを削除するクリーンアップ関数です。
     *
     * メモリーリークを防ぐために、いずれかの信号が中断された際に実行されます。
     */
    function cleanup(): void {
      for (const signal of signals) {
        signal.removeEventListener("abort", handleAbort);
      }
    }

    /**
     * いずれかの信号が abort イベントを発火させた際に呼び出されるハンドラーです。
     *
     * @this AbortSignal 中断を検知した AbortSignal インスタンス自身を指します。
     */
    function handleAbort(this: AbortSignal): void {
      // 親のコントローラーに対して、検知した信号の理由を添えて中断を指示します。
      ac.abort(this.reason);
      // 一つの信号が中断されれば他の監視は不要になるため、クリーンアップを呼び出します。
      cleanup();
    }

    // すべての有効な信号に対して、中断イベントを監視するリスナーを登録します。
    for (const signal of signals) {
      signal.addEventListener("abort", handleAbort, { once: true });
    }

    return ac.signal;
  };
}

export default combineSignals;
