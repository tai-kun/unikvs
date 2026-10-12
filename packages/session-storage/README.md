# @unikvs/session-storage

[Documentation](https://tai-kun.github.io/unikvs/packages/session-storage)

String-only storage plugin backed by the browser `sessionStorage`.

- Values are stored as-is with `keyPrefix` prepended to keys. No encoding or markers.
- To store objects, stringify on the caller side: `write({ key, data: JSON.stringify(value) })`.
- Non-`string` values passed at runtime follow `Storage.setItem` coercion (`String(data)`).
- Values written in an older `s:` / `b:` / `j:` marker format are returned as-is (no migration).
- Data is scoped to the tab and cleared when the tab is closed.
- `clear` with an empty `keyPrefix` is refused unless `allowClearWithoutPrefix: true` is set.
- `KeyNotFoundError` is the same object as `core.KeyNotFoundError` (`instanceof` works across packages).
- `clear` with `allowClearWithoutPrefix: true` deletes keys outside `keyPrefix` as well. Use with care.
- In non-browser environments, inject a `Storage` via `options.storage`.
