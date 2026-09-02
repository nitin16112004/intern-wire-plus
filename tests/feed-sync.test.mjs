import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAndPruneFeed } from "../lib/internship-feed.mjs";

const now = new Date("2026-09-01T12:00:00Z");

test("removes stale, expired, closed, and malformed listings", () => {
  const feed = normalizeAndPruneFeed({
    items: [
      { title: "Fresh QA Intern", url: "https://example.com/qa?utm_source=test", source: "manual", posted_at: "2026-08-31" },
      { title: "Old role", url: "https://example.com/old", source: "manual", posted_at: "2026-07-01" },
      { title: "Applications closed", url: "https://example.com/closed", source: "manual", posted_at: "2026-08-31" },
      { title: "Inactive role", url: "https://example.com/inactive", source: "manual", posted_at: "2026-08-31", active: false },
      { title: "No URL", source: "manual", posted_at: "2026-08-31" },
    ],
  }, { now, maxAgeDays: 30 });

  assert.equal(feed.total, 1);
  assert.equal(feed.items[0].title, "Fresh QA Intern");
  assert.equal(feed.items[0].url, "https://example.com/qa");
  assert.equal(feed.by_source.manual, 1);
});

test("deduplicates URLs and keeps the newest listing", () => {
  const feed = normalizeAndPruneFeed({
    items: [
      { title: "Older title", url: "https://example.com/job?trk=old", source: "linkedin", posted_at: "2026-08-20" },
      { title: "Newest title", url: "https://example.com/job", source: "linkedin", posted_at: "2026-08-30" },
    ],
  }, { now });

  assert.equal(feed.total, 1);
  assert.equal(feed.items[0].title, "Newest title");
  assert.equal(feed.items[0].expires_at, "2026-09-29T12:00:00.000Z");
});

test("rejects malformed feed payloads", () => {
  assert.throws(() => normalizeAndPruneFeed({}), /items array/);
});

test("preserves multi-source health metadata", () => {
  const feed = normalizeAndPruneFeed({
    source_status: { indeed: { status: "ok", fetched: 12 } },
    source_feed_urls: { indeed: "https://in.indeed.com/jobs" },
    items: [
      { title: "Product Intern", url: "https://example.com/product", source: "indeed", posted_at: "2026-08-31" },
    ],
  }, { now });

  assert.equal(feed.source_status.indeed.status, "ok");
  assert.equal(feed.source_feed_urls.indeed, "https://in.indeed.com/jobs");
});
