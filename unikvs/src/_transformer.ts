import type { Variables, IDecodable, ITransformer, IEncodable } from "@unikvs/core";

import {
  DecodableStreamNotSupportedError,
  EncodableStreamNotSupportedError,
  TransformerIsNotOpenError,
} from "./errors.js";

export default class UniKvsTransformer {
  private readonly tf: ITransformer;

  private managed: boolean;

  public constructor(tf: ITransformer) {
    this.tf = tf;
    this.managed = false;
  }

  public async open(vars: Variables, signal: AbortSignal): Promise<void> {
    if (typeof this.tf.open !== "function") {
      return;
    }

    if (!this.tf.isOpen) {
      this.managed = true;
      await this.tf.open({ vars, signal });
    }
  }

  public async close(vars: Variables, signal: AbortSignal): Promise<void> {
    if (typeof this.tf.close !== "function") {
      return;
    }

    if (this.tf.isOpen && this.managed) {
      await this.tf.close({ vars, signal });
    }
  }

  public async encode(vars: Variables, signal: AbortSignal, data: any): Promise<unknown> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    const output = await this.tf.encode({ data, vars, signal });

    return output;
  }

  public async decode(vars: Variables, signal: AbortSignal, data: any): Promise<unknown> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    const output = await this.tf.decode({ data, vars, signal });

    return output;
  }

  public async getEncodable(vars: Variables, signal: AbortSignal): Promise<IEncodable> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    if (typeof this.tf.getEncodable !== "function") {
      throw new EncodableStreamNotSupportedError({ name: this.tf.name });
    }

    const output = await this.tf.getEncodable({ vars, signal });
    const parsed = output; // TODO(tai-kun): 要検証

    return parsed;
  }

  public async getDecodable(vars: Variables, signal: AbortSignal): Promise<IDecodable> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    if (typeof this.tf.getDecodable !== "function") {
      throw new DecodableStreamNotSupportedError({ name: this.tf.name });
    }

    const output = await this.tf.getDecodable({ vars, signal });
    const parsed = output; // TODO(tai-kun): 要検証

    return parsed;
  }
}
