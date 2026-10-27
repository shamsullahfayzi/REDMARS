/** Keep a retry of the same submitted command on its original request key. */
const keys = new WeakMap<object, string>()
export function withCommandKey<T extends { idempotencyKey?: string }>(input: T): T {
  let key = input.idempotencyKey ?? keys.get(input)
  if (!key) {
    key = crypto.randomUUID()
    keys.set(input, key)
  }
  return { ...input, idempotencyKey: key }
}
