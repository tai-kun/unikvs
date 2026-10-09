# @unikvs/localstorage

[Documentation](https://tai-kun.github.io/unikvs/packages/localstorage)

String-only storage plugin backed by the browser `localStorage`.

- Values are stored as-is with `keyPrefix` prepended to keys. No encoding or markers.
- To store objects, stringify on the caller side: `write({ key, data: JSON.stringify(value) })`.
- Non-`string` values passed at runtime follow `Storage.setItem` coercion (`String(data)`).
- Values written in an older `s:` / `b:` / `j:` marker format are returned as-is (no migration).
- `clear` with an empty `keyPrefix` is refused unless `allowClearWithoutPrefix: true` is set.
- `KeyNotFoundError` is the same object as `core.KeyNotFoundError` (`instanceof` works across packages).
- `clear` with `allowClearWithoutPrefix: true` deletes keys outside `keyPrefix` as well. Use with care.
- In non-browser environments, inject a `Storage` via `options.storage`.
