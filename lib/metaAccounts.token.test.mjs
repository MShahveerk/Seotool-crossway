import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMetaTokenReconnectHint,
  isInvalidatedMetaTokenError,
  metaLiveFetchFailed,
} from "./metaTokenErrors.js";

const INVALIDATED =
  "Error validating access token: The session has been invalidated because the user changed their password or Facebook has changed the session for security reasons.";

test("detects Facebook session-kill errors", () => {
  assert.equal(isInvalidatedMetaTokenError(INVALIDATED), true);
  assert.equal(
    isInvalidatedMetaTokenError({
      response: { data: { error: { code: 190, message: INVALIDATED } } },
    }),
    true
  );
  assert.equal(isInvalidatedMetaTokenError("Meta Graph returned no pages"), false);
  assert.equal(isInvalidatedMetaTokenError(""), false);
});

test("reconnect hint tells the operator to replace the env token", () => {
  const hint = formatMetaTokenReconnectHint(INVALIDATED);
  assert.match(hint, /invalidated the access token/i);
  assert.match(hint, /META_PAGE_ACCESS_TOKEN/);
  assert.match(hint, /pages_show_list/);
  assert.doesNotMatch(hint, /Fetched \d+ page/);
});

test("reconnect hint is idempotent", () => {
  const once = formatMetaTokenReconnectHint(INVALIDATED);
  assert.equal(formatMetaTokenReconnectHint(once), once);
});

test("a cached DB-only list is not a live fetch", () => {
  assert.equal(metaLiveFetchFailed({ stats: { graph: 0, database: 1, tokens: 1 } }), true);
  assert.equal(metaLiveFetchFailed({ stats: { graph: 3, database: 1, tokens: 1 } }), false);
});
