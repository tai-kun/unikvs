/**
 * 投げた非同期エラーを拒否理由として返します。
 * 実際に投げられたエラーの種類とメタ情報を検証するために使用します。
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
 * 投げた同期エラーを例外として返します。
 * 実際に投げられたエラーの種類とメタ情報を検証するために使用します。
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
 * 常に中断済みのシグナルを返します。
 * 入口の中断検証の検証に使用します。
 */
export function abortedSignal(reason?: unknown): AbortSignal {
  const controller = new AbortController();
  controller.abort(reason);

  return controller.signal;
}
