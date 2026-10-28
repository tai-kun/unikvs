/**
 * 指定ミリ秒だけ待ちます。
 * 保持期限の遅延失効の検証に使用します。
 *
 * @param ms 待機するミリ秒です。
 */
export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
