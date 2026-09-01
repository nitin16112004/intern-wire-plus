import assert from "node:assert/strict";
import test from "node:test";

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("feed-test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

test("serves the live feed and removes expired jobs", async () => {
  const originalFetch = globalThis.fetch;
  const freshDate = new Date().toISOString();
  globalThis.fetch = async () => new Response(JSON.stringify({
    generated_at: freshDate,
    items: [
      { title: "Current internship", url: "https://example.com/current", source: "linkedin", posted_at: freshDate },
      { title: "Expired internship", url: "https://example.com/expired", source: "linkedin", posted_at: "2020-01-01" },
    ],
  }));

  try {
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("http://localhost/api/internships"),
      { ASSETS: { fetch: async () => new Response("not used", { status: 404 }) } },
      context,
    );
    const feed = await response.json();
    assert.equal(response.status, 200);
    assert.equal(feed.served_from, "github-live");
    assert.equal(feed.total, 1);
    assert.equal(feed.items[0].title, "Current internship");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the bundled snapshot when the live feed fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("upstream unavailable", { status: 503 });

  try {
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("http://localhost/api/internships"),
      {
        ASSETS: {
          fetch: async () => new Response(JSON.stringify({
            items: [
              { title: "Fallback internship", url: "https://example.com/fallback", source: "manual", posted_at: new Date().toISOString() },
            ],
          })),
        },
      },
      context,
    );
    const feed = await response.json();
    assert.equal(response.status, 200);
    assert.equal(feed.served_from, "bundled-fallback");
    assert.equal(feed.total, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
