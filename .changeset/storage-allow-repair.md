---
"@unikvs/core": minor
"@unikvs/memory": minor
"@unikvs/fs.node": minor
"@unikvs/fs.bun": minor
"@unikvs/redis.bun": minor
"@unikvs/s3.node": minor
"@unikvs/s3.bun": minor
"@unikvs/opfs": minor
"@unikvs/indexeddb": minor
---

ストレージに `allowRepair` オプションを追加しました。既定値は `false` で、`allowRepair: true` を指定したストレージにだけ読み取り時の書き戻しを書き込みます。拒否時は `@unikvs/core` に追加した `RepairNotAllowedError` を投げますが、読み取り自体は成功し、ログに記録されます。
