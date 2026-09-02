import assert from "node:assert/strict";
import test from "node:test";
import {
  collectJobSources,
  mapHimalayasPayload,
  mapNaukriPayload,
  parseIndeedSearch,
} from "../lib/job-sources.mjs";

const now = new Date("2026-09-02T08:00:00Z");

test("parses Indeed's embedded job-card payload", () => {
  const payload = {
    metaData: {
      mosaicProviderJobCardsModel: {
        results: [{
          jobkey: "abc123",
          displayTitle: "Software Engineering Intern",
          company: "Acme Labs",
          formattedLocation: "Bengaluru, Karnataka",
          formattedRelativeTime: "2 days ago",
          snippet: "Build <b>production</b> features.",
        }],
      },
    },
  };
  const html = `<script>window.mosaic.providerData["mosaic-provider-jobcards"]=${JSON.stringify(payload)};</script>`;
  const jobs = parseIndeedSearch(html, { now });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].source, "indeed");
  assert.equal(jobs[0].company, "Acme Labs");
  assert.equal(jobs[0].posted_at, "2026-08-31T08:00:00.000Z");
  assert.equal(jobs[0].url, "https://in.indeed.com/viewjob?jk=abc123");
  assert.equal(jobs[0].snippet, "Build production features.");
});

test("maps Naukri results and preserves India-specific fields", () => {
  const jobs = mapNaukriPayload({
    jobDetails: [{
      jobId: "9988",
      title: "Data Analyst Fresher",
      companyName: "Orbit Data",
      jdURL: "/job-listings-data-analyst-9988",
      footerPlaceholderLabel: "1 day ago",
      placeholders: [{ type: "location", label: "Pune, Maharashtra" }],
      tagsAndSkills: "SQL, Excel",
    }],
  }, { now });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].source, "naukri");
  assert.equal(jobs[0].location, "Pune, Maharashtra");
  assert.equal(jobs[0].posted_at, "2026-09-01T08:00:00.000Z");
  assert.match(jobs[0].url, /^https:\/\/www\.naukri\.com\//);
});

test("maps Himalayas internships with source expiry", () => {
  const jobs = mapHimalayasPayload({
    jobs: [{
      guid: "remote-1",
      title: "Product Intern",
      companyName: "Northstar",
      locationRestrictions: ["India", "Worldwide"],
      applicationLink: "https://himalayas.app/jobs/product-intern",
      pubDate: "2026-09-01T10:00:00Z",
      expiryDate: "2026-09-20T10:00:00Z",
      excerpt: "Support the product team.",
    }],
  }, { now });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].source, "himalayas");
  assert.equal(jobs[0].expires_at, "2026-09-20T10:00:00.000Z");
});

test("retains the last healthy source snapshot when a source is blocked", async () => {
  const previous = [{
    id: "indeed-old",
    source: "indeed",
    title: "QA Intern",
    url: "https://in.indeed.com/viewjob?jk=old",
    posted_at: "2026-09-01T10:00:00Z",
  }];
  const result = await collectJobSources({
    enabledSources: ["indeed"],
    previousItems: previous,
    now,
    fetchImpl: async () => new Response("blocked", { status: 403 }),
  });

  assert.deepEqual(result.items, previous);
  assert.equal(result.sourceStatus.indeed.status, "stale");
  assert.equal(result.sourceStatus.indeed.retained, 1);
});
