import type { IMiddleware } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/passthrough#usage)
 */
export default class PassThrough implements IMiddleware {
  public readonly name: string = "PassThrough";

  public get isOpen(): boolean {
    return true;
  }

  public async encode<TData>(
    c: IMiddleware.EncodeContext<TData>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    await next();
  }

  public async decode<TData>(
    c: IMiddleware.DecodeContext<TData>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    await next();
  }

  public async encodeStream<TChunk>(
    c: IMiddleware.EncodeStreamContext<TChunk>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    await next();
  }

  public async decodeStream<TChunk>(
    c: IMiddleware.DecodeStreamContext<TChunk>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    await next();
  }
}
