/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#capture-rejection)
 */
export async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (ex) {
    return ex;
  }

  throw new Error("Promise が拒否されませんでした");
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#capture-thrown)
 */
export function captureThrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (ex) {
    return ex;
  }

  throw new Error("例外が投げられませんでした");
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#aborted-signal)
 */
export function abortedSignal(reason?: unknown): AbortSignal {
  const controller = new AbortController();
  controller.abort(reason);

  return controller.signal;
}
