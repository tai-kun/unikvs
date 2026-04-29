import type { Context, IDecodable, ITransformer, IEncodable } from "@unikvs/core";

import * as v from "./_valibot.js";
import {
  DecodableStreamNotSupportedError,
  EncodableStreamNotSupportedError,
  TransformerIsNotOpenError,
} from "./errors.js";

export default class UniKvsTransformer {
  private readonly tf: ITransformer;

  public constructor(tf: ITransformer) {
    this.tf = tf;
  }

  public async open(context: Context, signal: AbortSignal): Promise<void> {
    if (typeof this.tf.open !== "function") {
      return;
    }

    if (!this.tf.isOpen) {
      await this.tf.open({ signal, context });
    }
  }

  public async close(context: Context, signal: AbortSignal): Promise<void> {
    if (typeof this.tf.close !== "function") {
      return;
    }

    if (this.tf.isOpen) {
      await this.tf.close({ signal, context });
    }
  }

  public async encode(context: Context, signal: AbortSignal, data: any): Promise<unknown> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    const output = await this.tf.encode({ data, signal, context });

    return output;
  }

  public async decode(context: Context, signal: AbortSignal, data: any): Promise<unknown> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    const output = await this.tf.decode({ data, signal, context });

    return output;
  }

  public async getEncodable(context: Context, signal: AbortSignal): Promise<IEncodable> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    if (typeof this.tf.getEncodable !== "function") {
      throw new EncodableStreamNotSupportedError({ name: this.tf.name });
    }

    const output = await this.tf.getEncodable({ signal, context });
    const parsed = v.parseOutput(v.instance(TransformStream), output);

    return parsed;
  }

  public async getDecodable(context: Context, signal: AbortSignal): Promise<IDecodable> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    if (typeof this.tf.getDecodable !== "function") {
      throw new DecodableStreamNotSupportedError({ name: this.tf.name });
    }

    const output = await this.tf.getDecodable({ signal, context });
    const parsed = v.parseOutput(v.instance(TransformStream), output);

    return parsed;
  }
}
