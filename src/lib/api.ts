export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401 && typeof window !== "undefined") {
    const next = `${window.location.pathname}${window.location.search}`;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- auth hard redirect
    window.location.assign(`/login?next=${encodeURIComponent(next || "/")}`);
  }
  return response;
}
