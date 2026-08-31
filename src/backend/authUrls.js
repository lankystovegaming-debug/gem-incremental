export function accountPageUrlFromLocation(locationHref) {
  const url = new URL(locationHref);

  // A server may expose the same page as either /account or /account/.
  // URL resolution treats the first form like a file, so resolving "./"
  // from it incorrectly points at the site root. Canonicalize the account
  // route explicitly while preserving any deployment prefix.
  url.pathname = url.pathname.replace(
    /\/account(?:\/index\.html)?\/?$/,
    "/account/"
  );
  url.search = "";
  url.hash = "";

  return url.href;
}
