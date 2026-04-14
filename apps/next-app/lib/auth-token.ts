/**
 * Bridge between Clerk's React hooks and the standalone fetchApi function.
 * The ClerkTokenBridge component (in providers.tsx) registers Clerk's getToken
 * function here so fetchApi can include the Bearer token in API requests.
 */

let getTokenFn: (() => Promise<string | null>) | null = null;

export function setGetTokenFn(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

export async function getAuthToken(): Promise<string | null> {
  return getTokenFn?.() ?? null;
}
