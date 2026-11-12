/** Client fetch that sends users to login on 401. */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401 && typeof window !== "undefined") {
    const next = `${window.location.pathname}${window.location.search}`;
    // Full navigation so every in-flight client state is dropped on auth expiry.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- auth hard redirect
    window.location.assign(`/login?next=${encodeURIComponent(next || "/")}`);
  }
  return response;
}
