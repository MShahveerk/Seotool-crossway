function graphMessage(err) {
  if (err == null) return "";
  if (typeof err === "string") return err;
  return err?.response?.data?.error?.message || err?.error?.message || err?.message || "";
}

const INVALID_TOKEN_RE =
  /session has been invalidated|Error validating access token|password.*(changed|reset)|OAuthException|invalid oauth|Session has expired|code['":\s]+190/i;

/** Facebook error code 190 / password-change session kill. */
export function isInvalidatedMetaTokenError(err) {
  if (err == null || err === "") return false;
  if (typeof err === "object") {
    const code = err?.response?.data?.error?.code ?? err?.error?.code ?? err?.code;
    if (Number(code) === 190) return true;
    return INVALID_TOKEN_RE.test(graphMessage(err));
  }
  return INVALID_TOKEN_RE.test(String(err));
}

/**
 * Operator copy when Graph cannot list pages. Fetch is not a re-auth button —
 * the env token on Render (or .env.local) has to be replaced first.
 */
export function formatMetaTokenReconnectHint(raw) {
  const msg = String(raw || "").trim();
  if (/META_PAGE_ACCESS_TOKEN is replaced|paste it into Render/.test(msg)) return msg;
  const invalidated = isInvalidatedMetaTokenError(msg);
  const lead = invalidated
    ? "Facebook invalidated the access token after a password change or a security reset. Fetch cannot list pages until META_PAGE_ACCESS_TOKEN is replaced."
    : msg || "Meta Graph did not return any pages for the configured token.";
  return `${lead} Generate a new long-lived User token with pages_show_list (or a System User token in Meta Business settings), paste it into Render → Environment → META_PAGE_ACCESS_TOKEN (or .env.local), restart the web service, then Fetch Meta pages. A Page token only sees that one page; a User token lists every Page the account manages.`;
}

/** Live Graph returned nothing we can persist — cached DB rows are not a fetch. */
export function metaLiveFetchFailed(loaded) {
  return Number(loaded?.stats?.graph || 0) === 0;
}
