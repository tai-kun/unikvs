/**
 * 圧縮レベルの違いが出力に現れる構造化データを作成します。
 *
 * zstd の圧縮率は隣接レベル間で単調ではないため、レベル 1 と 19 の出力差を観測するテストで共有します。
 */
export function createLevelSensitiveInput(): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify(
      Array.from({ length: 1000 }, (_, index) => ({
        id: index,
        name: `user-${index}`,
        tags: ["alpha", "beta", "gamma"],
        score: (index * 37) % 100,
        active: index % 3 === 0,
      })),
    ),
  );
}
