import { isReadableStream } from "./_streams.js";
import * as v from "./_valibot.js";
import type { ValueSchemaInfo } from "./_value-schemas.js";

/**
 * プレーン値専用のスキーマに ReadableStream が渡されたことを報告するためのスキーマです。
 */
const PlainValueInputSchema = v.pipe(
  v.unknown(),
  v.check(
    (input) => !isReadableStream(input),
    "Expected a plain value, but received a ReadableStream",
  ),
);

/**
 * ストリーム専用のスキーマにプレーン値が渡されたことを報告するためのスキーマです。
 */
const StreamValueInputSchema = v.pipe(
  v.unknown(),
  v.check(isReadableStream, "Expected a ReadableStream, but received a plain value"),
);

/**
 * スキーマ情報に基づいて `set` の入力値を検証します。
 *
 * プレーン値はその場で検証し、ストリームはチャンクごとに検証するストリームに変換します。
 *
 * @param info キーに対応するスキーマ情報です。
 * @param value 検証する入力値です。
 *
 * @returns 検証済みの入力値を返します。
 */
export function parseSetValue(info: ValueSchemaInfo, value: unknown): unknown {
  if (isReadableStream(value)) {
    if (info.kind === "plain") {
      // 必ず検証に失敗するため、InvalidInputError が投げられます。
      v.parseInput(PlainValueInputSchema, value);
    }

    // 入力チャンクを検証し、変換後の値を後続のパイプラインへ流します。
    return value.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(v.parseInput(info.schema, chunk));
        },
      }),
    );
  }

  if (info.kind === "stream") {
    // 必ず検証に失敗するため、InvalidInputError が投げられます。
    v.parseInput(StreamValueInputSchema, value);
  }

  return v.parseInput(info.schema, value);
}
