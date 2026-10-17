// Include body download/decoding in timings; never log query bodies or response data.
export async function sourceJson<T>(url: string, options: RequestInit, context: Record<string, string>): Promise<T> {
  const started = Date.now();
  let status: number | undefined;
  let failure: string | undefined;
  try {
    const response = await fetch(url, options);
    status = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Source request failed: ${status}`);
    }
    return await response.json() as T;
  } catch (error) {
    failure = error instanceof Error ? error.name : "Error";
    throw error;
  } finally {
    const durationMs = Date.now() - started;
    if (failure || durationMs >= 1000) console.info("Upstream request", {
      ...context, host: new URL(url).host, method: options.method ?? "GET", status, durationMs, failure,
    });
  }
}
