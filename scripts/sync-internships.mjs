import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_MAX_AGE_DAYS,
  DEFAULT_REFRESH_HOURS,
  normalizeAndPruneFeed,
} from "../lib/internship-feed.mjs";
import {
  collectJobSources,
  DEFAULT_SOURCE_IDS,
  SOURCE_FEED_URLS,
} from "../lib/job-sources.mjs";

export const DEFAULT_UPSTREAM_URL = SOURCE_FEED_URLS["intern-wire"];

function configuredSources(value) {
  if (!value) return DEFAULT_SOURCE_IDS;
  return String(value).split(",").map((source) => source.trim()).filter(Boolean);
}

export async function syncInternships({
  outputPath = process.env.JOBS_OUTPUT_PATH || "public/internships.json",
  sourceIds = configuredSources(process.env.JOBS_SOURCE_IDS),
  maxAgeDays = Number(process.env.MAX_JOB_AGE_DAYS || DEFAULT_MAX_AGE_DAYS),
  refreshHours = Number(process.env.REFRESH_INTERVAL_HOURS || DEFAULT_REFRESH_HOURS),
  minActiveJobs = Number(process.env.MIN_ACTIVE_JOBS || 10),
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const target = resolve(outputPath);
  let previous = null;
  let previousFeed = null;
  try {
    previous = await readFile(target, "utf8");
    previousFeed = JSON.parse(previous);
  } catch {
    // The first successful sync creates the snapshot.
  }

  const collected = await collectJobSources({
    enabledSources: sourceIds,
    fetchImpl,
    now,
    previousItems: previousFeed?.items ?? [],
  });
  const feed = normalizeAndPruneFeed({
    generated_at: now.toISOString(),
    synced_at: now.toISOString(),
    last_scraped: now.toISOString(),
    source_status: collected.sourceStatus,
    source_feed_urls: Object.fromEntries(
      collected.enabledSources.map((source) => [source, SOURCE_FEED_URLS[source]]),
    ),
    items: collected.items,
  }, { now, maxAgeDays, refreshHours });
  if (feed.total < minActiveJobs) {
    throw new Error(`Safety check stopped a suspicious refresh with only ${feed.total} active jobs.`);
  }

  const temporary = `${target}.next`;
  const serialized = `${JSON.stringify(feed)}\n`;
  await mkdir(dirname(target), { recursive: true });
  if (previous === serialized) return { changed: false, feed };

  await writeFile(temporary, serialized, "utf8");
  await rename(temporary, target);
  return { changed: true, feed };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  const { changed, feed } = await syncInternships();
  const healthy = Object.values(feed.source_status ?? {}).filter((source) => source.status === "ok").length;
  const stale = Object.values(feed.source_status ?? {}).filter((source) => source.status !== "ok").length;
  console.log(`${changed ? "Updated" : "Checked"} ${feed.total} active opportunities from ${healthy} healthy sources${stale ? ` (${stale} using fallback)` : ""}.`);
}
