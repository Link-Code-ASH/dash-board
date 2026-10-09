import { accountClient } from "../accountSync.js";
import { appBase } from "./routing.js";

const RETURN_KEY = "hub-auth-return-v1";
export function prepareAuthReturn() {
  const base = appBase();
  sessionStorage.setItem(
    RETURN_KEY,
    JSON.stringify({
      path: `${window.location.pathname}${window.location.hash}`,
      expires: Date.now() + 15 * 60 * 1000,
    }),
  );
  return `${window.location.origin}${base}`;
}

export async function restoreAuthReturn() {
  if (!new URLSearchParams(window.location.search).has("code")) return;
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(RETURN_KEY));
  } catch {
    return;
  }
  if (!saved || saved.expires < Date.now()) {
    sessionStorage.removeItem(RETURN_KEY);
    return;
  }
  const { data, error } = await accountClient.auth.getSession();
  if (error || !data.session) return;
  sessionStorage.removeItem(RETURN_KEY);
  const target = new URL(saved.path, window.location.origin);
  const base = appBase();
  const suffix = target.pathname.slice(base.length);
  if (
    target.origin !== window.location.origin ||
    !target.pathname.startsWith(base) ||
    !/^(?:(?:hub|flow|routine|edu|lingo|mindfold)\/(?:index\.html)?|index\.html)?$/.test(
      suffix,
    )
  )
    return;
  window.location.replace(`${target.pathname}${target.hash}`);
}
