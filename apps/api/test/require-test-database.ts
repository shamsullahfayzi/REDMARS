// Existing E2E fixtures intentionally delete their own rows. Refuse a hospital
// database even when somebody accidentally exports its production DATABASE_URL.
const connection = process.env.DATABASE_URL;
if (!connection || !/(^test$|_test$|^test_)/i.test(new URL(connection).pathname.slice(1))) {
  throw new Error(
    'E2E tests require an explicit DATABASE_URL whose database name starts with test_ or ends with _test. Never use hospital data.',
  );
}
