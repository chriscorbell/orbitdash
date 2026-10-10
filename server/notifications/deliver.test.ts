import { describe, expect, it } from "bun:test";
import { deliver, RETRY_DELAYS_MS, sleep, type FetchLike } from "./deliver";

const request = { url: "https://hooks.example/x", headers: { A: "1" }, body: "{}" };

/** A fetch that answers from a list, recording what it was asked. */
function scripted(...answers: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const answer = answers.shift();
    if (!answer) throw new Error("no more answers");
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { calls, fetch };
}

function failingWith(code: string) {
  return Object.assign(new Error("connect failed https://hooks.example/x?token=secret"), { code });
}

function recordSleeps() {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number) => void delays.push(ms) };
}

describe("deliver", () => {
  it("sends once and reports success", async () => {
    const { calls, fetch } = scripted(new Response(null, { status: 204 }));
    expect(await deliver(request, { fetch })).toEqual({
      ok: true,
      attempts: 1,
      statusCode: 204,
      error: null,
      detail: null,
    });
    expect(calls[0].url).toBe(request.url);
    expect(calls[0].init).toMatchObject({
      method: "POST",
      headers: { A: "1" },
      body: "{}",
      redirect: "manual",
    });
  });

  it("retries network errors and 5xx with backoff, then gives up", async () => {
    const { calls, fetch } = scripted(
      failingWith("ECONNREFUSED"),
      new Response("bad gateway", { status: 502 }),
      new Response(JSON.stringify({ message: "still down" }), { status: 503 })
    );
    const { delays, sleep } = recordSleeps();
    expect(await deliver(request, { fetch, sleep })).toEqual({
      ok: false,
      attempts: 3,
      statusCode: 503,
      error: "HTTP 503",
      detail: "still down",
    });
    expect(calls).toHaveLength(3);
    expect(delays).toEqual([...RETRY_DELAYS_MS]);
  });

  it("recovers on a later attempt", async () => {
    const { fetch } = scripted(failingWith("ENOTFOUND"), new Response("ok", { status: 200 }));
    const { sleep } = recordSleeps();
    expect(await deliver(request, { fetch, sleep })).toMatchObject({ ok: true, attempts: 2 });
  });

  it("waits as long as a 429 asks, within reason", async () => {
    const { fetch } = scripted(
      new Response(null, { status: 429, headers: { "Retry-After": "7" } }),
      new Response(null, { status: 429, headers: { "Retry-After": "600" } }),
      new Response(null, { status: 204 })
    );
    const { delays, sleep } = recordSleeps();
    expect(await deliver(request, { fetch, sleep })).toMatchObject({ ok: true, attempts: 3 });
    expect(delays).toEqual([7_000, 15_000]);
  });

  it("doesn't retry other answers, and reads the receiver's explanation", async () => {
    const { calls, fetch } = scripted(
      new Response(JSON.stringify({ code: 50027, message: "Invalid Webhook\nToken" }), {
        status: 401,
      })
    );
    expect(await deliver(request, { fetch })).toEqual({
      ok: false,
      attempts: 1,
      statusCode: 401,
      error: "HTTP 401",
      detail: "Invalid Webhook Token",
    });
    expect(calls).toHaveLength(1);

    for (const body of [
      "<html>nope</html>",
      JSON.stringify({ error: 5 }),
      JSON.stringify(null),
      "",
    ]) {
      const { fetch: next } = scripted(new Response(body, { status: 404 }));
      expect((await deliver(request, { fetch: next })).detail).toBeNull();
    }
    const { fetch: errorField } = scripted(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 403 })
    );
    expect((await deliver(request, { fetch: errorField })).detail).toBe("unauthorized");
  });

  it("refuses to follow redirects", async () => {
    const { fetch } = scripted(
      new Response(null, { status: 301, headers: { Location: "https://elsewhere.example" } })
    );
    expect(await deliver(request, { fetch })).toEqual({
      ok: false,
      attempts: 1,
      statusCode: 301,
      error: "Redirected (HTTP 301); use the final URL",
      detail: null,
    });
  });

  it("names timeouts and never echoes raw error messages", async () => {
    const never: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason))
      );
    expect(await deliver(request, { fetch: never, attempts: 1, timeoutMs: 5 })).toMatchObject({
      ok: false,
      error: "Timed out",
    });

    const { fetch } = scripted(failingWith("EWHATEVER"));
    const outcome = await deliver(request, { fetch, attempts: 1 });
    expect(outcome.error).toBe("Couldn't connect");
    expect(JSON.stringify(outcome)).not.toContain("secret");
  });

  it("stops when cancelled, before sending or while waiting", async () => {
    const aborted = new AbortController();
    aborted.abort();
    const { calls, fetch } = scripted(new Response(null, { status: 204 }));
    expect(await deliver(request, { fetch, signal: aborted.signal })).toMatchObject({
      ok: false,
      attempts: 0,
      error: "Cancelled",
    });
    expect(calls).toHaveLength(0);

    const controller = new AbortController();
    const cancelling: FetchLike = async () => {
      controller.abort();
      throw new Error("aborted");
    };
    expect(await deliver(request, { fetch: cancelling, signal: controller.signal })).toMatchObject({
      ok: false,
      attempts: 1,
      error: "Cancelled",
    });

    const later = new AbortController();
    const { fetch: failing } = scripted(new Response(null, { status: 500 }));
    const outcome = await deliver(request, {
      fetch: failing,
      signal: later.signal,
      sleep: async () => later.abort(),
    });
    expect(outcome).toMatchObject({ attempts: 1, error: "Cancelled" });
  });
});

describe("sleep", () => {
  it("waits, and ends early once aborted", async () => {
    const started = performance.now();
    await sleep(5);
    expect(performance.now() - started).toBeGreaterThanOrEqual(4);

    const controller = new AbortController();
    const waiting = sleep(60_000, controller.signal);
    controller.abort();
    await waiting;
  });
});
