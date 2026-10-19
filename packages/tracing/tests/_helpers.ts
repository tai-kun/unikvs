import type { SpanAttributeValue, SpanLike, SpanStatus, TracerLike } from "../src/tracing.js";

/**
 * 記録したスパンを検証するためのテスト用スパンです。
 * 属性・状態・終了を保持し、検証のために使用します。
 */
export class RecordingSpan implements SpanLike {
  /**
   * 開始時に指定されたスパン名です。
   */
  public readonly name: string;

  /**
   * 設定された属性の一覧です。
   */
  public readonly attributes: Map<string, SpanAttributeValue> = new Map();

  /**
   * 最後に設定された状態です。
   */
  public status: SpanStatus = { code: "unset" };

  /**
   * end が呼ばれたかどうかです。
   */
  public ended = false;

  /**
   * end が呼ばれた回数です。
   */
  public endCount = 0;

  /**
   * 記録用のスパンを作成します。
   *
   * @param name スパン名です。
   */
  public constructor(name: string) {
    this.name = name;
  }

  /**
   * 属性を記録します。
   *
   * @param key 属性名です。
   * @param value 属性値です。
   */
  public setAttribute(key: string, value: SpanAttributeValue): void {
    this.attributes.set(key, value);
  }

  /**
   * 状態を記録します。
   *
   * @param status 設定する状態です。
   */
  public setStatus(status: SpanStatus): void {
    this.status = status;
  }

  /**
   * 終了を記録します。
   */
  public end(): void {
    this.ended = true;
    this.endCount += 1;
  }
}

/**
 * 発行したスパンを記録するテスト用トレーサーです。
 * スパン名・属性・エラー状態の検証のために使用します。
 */
export class RecordingTracer implements TracerLike {
  /**
   * 発行された順に並ぶスパンの一覧です。
   */
  public readonly spans: RecordingSpan[] = [];

  /**
   * 記録用のスパンを発行します。
   *
   * @param name スパン名です。
   * @returns 記録用のスパンを返します。
   */
  public startSpan(name: string): RecordingSpan {
    const span = new RecordingSpan(name);
    this.spans.push(span);

    return span;
  }
}
