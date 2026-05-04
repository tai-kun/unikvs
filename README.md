# unikvs

```typescript
import { Compression } from "@unikvs/compression";
import { FileSystem } from "@unikvs/fs.node";
import { UniKvs, type Value } from "unikvs";

const kvs = UniKvs.config<{
  foo: Value<Uint8Array<ArrayBuffer>>;
}>()
  .appendTransformer(new Compression("gzip"))
  .appendStorage(new FileSystem(".tmp"))
  .create();

await kvs.open();

await kvs.set("foo", Uint8Array.from([0, 1, 2]));

await kvs.close();
```
