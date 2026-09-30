import type { IStorage } from "@unikvs/core";

/**
 * 委譲された操作を記録し、マップでデータを保持するストレージです。
 * WriteOnly の書き込み委譲、読み出し禁止、削除の抑止を検証するために使用します。
 * ライフサイクル操作と getWritable を持たないため、それらの不在時の挙動も検証できます。
 */
export class RecordingStorage implements IStorage {
  public readonly name: string = "RecordingStorage";

  public readonly map: Map<string, any> = new Map();

  public isOpenState: boolean = false;

  public writeCount: number = 0;

  public readCount: number = 0;

  public existsCount: number = 0;

  public deleteCount: number = 0;

  public clearCount: number = 0;

  public lastWriteArgs: IStorage.WriteArgs<any> | undefined;

  public lastDeleteArgs: IStorage.DeleteArgs | undefined;

  public lastClearArgs: IStorage.ClearArgs | undefined;

  public writeError: unknown = undefined;

  public deleteError: unknown = undefined;

  public clearError: unknown = undefined;

  public get isOpen(): boolean {
    return this.isOpenState;
  }

  public write(args: IStorage.WriteArgs<any>): void {
    if (this.writeError !== undefined) {
      throw this.writeError;
    }

    this.writeCount += 1;
    this.lastWriteArgs = args;
    this.map.set(args.key, args.data);
  }

  public read(args: Pick<IStorage.ReadArgs, "key">): any {
    this.readCount += 1;

    if (!this.map.has(args.key)) {
      throw new Error(`Key not found: ${args.key}`);
    }

    return this.map.get(args.key);
  }

  public exists(args: Pick<IStorage.ExistsArgs, "key">): boolean {
    this.existsCount += 1;

    return this.map.has(args.key);
  }

  public delete(args: IStorage.DeleteArgs): void {
    if (this.deleteError !== undefined) {
      throw this.deleteError;
    }

    this.deleteCount += 1;
    this.lastDeleteArgs = args;
    this.map.delete(args.key);
  }

  public clear(args: IStorage.ClearArgs): void {
    if (this.clearError !== undefined) {
      throw this.clearError;
    }

    this.clearCount += 1;
    this.lastClearArgs = args;
    this.map.clear();
  }
}

/**
 * ライフサイクル操作を記録し、isOpen を差し替えられるストレージです。
 * open・close・onOtherWriteError の委譲、引数、エラー伝播、isOpen の反映を検証するために使用します。
 */
export class LifecycleStorage extends RecordingStorage {
  public override readonly name: string = "LifecycleStorage";

  public openCount: number = 0;

  public closeCount: number = 0;

  public otherWriteErrorCount: number = 0;

  public lastOpenArgs: IStorage.OpenArgs | undefined;

  public lastCloseArgs: IStorage.CloseArgs | undefined;

  public lastOtherWriteErrorArgs: IStorage.OnOtherWriteErrorArgs | undefined;

  public openError: unknown = undefined;

  public closeError: unknown = undefined;

  public otherWriteError: unknown = undefined;

  public open(args: IStorage.OpenArgs): void {
    if (this.openError !== undefined) {
      throw this.openError;
    }

    this.openCount += 1;
    this.lastOpenArgs = args;
  }

  public close(args: IStorage.CloseArgs): void {
    if (this.closeError !== undefined) {
      throw this.closeError;
    }

    this.closeCount += 1;
    this.lastCloseArgs = args;
  }

  public onOtherWriteError(args: IStorage.OnOtherWriteErrorArgs): void {
    if (this.otherWriteError !== undefined) {
      throw this.otherWriteError;
    }

    this.otherWriteErrorCount += 1;
    this.lastOtherWriteErrorArgs = args;
  }
}

/**
 * 書き込み用と読み出し用のストリームを持つストレージです。
 * getWritable の公開条件・this バインド・引数の委譲と、getReadable への非委譲を検証するために使用します。
 */
export class StreamStorage extends LifecycleStorage {
  public override readonly name: string = "StreamStorage";

  public getWritableCount: number = 0;

  public lastGetWritableThis: unknown = undefined;

  public lastGetWritableArgs: IStorage.GetWritableArgs | undefined;

  public getReadableCount: number = 0;

  public getWritable(args: IStorage.GetWritableArgs): WritableStream<Uint8Array<ArrayBuffer>> {
    this.getWritableCount += 1;
    this.lastGetWritableThis = this;
    this.lastGetWritableArgs = args;

    const chunks: Uint8Array<ArrayBuffer>[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      write: (chunk) => {
        chunks.push(chunk);
      },
      close: () => {
        const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(size);
        let offset = 0;

        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }

        this.map.set(args.key, merged);
      },
    });
  }

  public getReadable(_args: IStorage.GetReadableArgs): ReadableStream<Uint8Array<ArrayBuffer>> {
    this.getReadableCount += 1;

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      start: (controller) => {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
  }
}
