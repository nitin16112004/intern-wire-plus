import assert from "node:assert/strict";
import test from "node:test";
import {
  collectJobSources,
  mapHimalayasPayload,
  mapIndeedGraphqlPayload,
  mapJobicyPayload,
  mapNaukriPayload,
  mapRemoteOkPayload,
  mapSimplifyPayload,
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

test("maps Indeed's public-client GraphQL fallback", () => {
  const jobs = mapIndeedGraphqlPayload({
    data: {
      jobSearch: {
        results: [{
          job: {
            key: "fallback-1",
            title: "Design Intern",
            datePublished: "2026-09-01T12:00:00Z",
            description: { html: "Design <strong>product</strong> flows." },
            location: { formatted: { long: "Remote in India" } },
            employer: { name: "Pixel Works" },
          },
        }],
      },
    },
  }, { now });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].source, "indeed");
  assert.equal(jobs[0].company, "Pixel Works");
  assert.equal(jobs[0].snippet, "Design product flows.");
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

test("maps current Simplify listings and ignores closed roles", () => {
  const jobs = mapSimplifyPayload([
    { id: "open-1", company_name: "Acme", title: "SWE Intern", locations: ["Remote"], url: "https://example.com/open", date_posted: 1788249600, is_visible: true },
    { id: "closed-1", company_name: "Acme", title: "Old Intern", locations: ["Remote"], url: "https://example.com/closed", date_posted: 1788249600, closed: true },
  ], { now });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].source, "simplify");
  assert.equal(jobs[0].location, "Remote");
});

test("maps early-career roles from Remote OK and Jobicy", () => {
  const remoteOk = mapRemoteOkPayload([
    { legal: "metadata" },
    { id: "r1", position: "Frontend Intern", company: "Orbit", location: "Worldwide", url: "https://remoteok.com/r1", date: "2026-09-01" },
  ], { now });
  const jobicy = mapJobicyPayload({
    jobs: [{ id: "j1", jobTitle: "Graduate Developer", companyName: "Nova", jobGeo: "Remote", url: "https://jobicy.com/j1", pubDate: "2026-09-01" }],
  }, { now });

  assert.equal(remoteOk.length, 1);
  assert.equal(remoteOk[0].source, "remoteok");
  assert.equal(jobicy.length, 1);
  assert.equal(jobicy[0].source, "jobicy");
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
