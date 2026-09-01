import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_MAX_AGE_DAYS,
  DEFAULT_REFRESH_HOURS,
  normalizeAndPruneFeed,
} from "../lib/internship-feed.mjs";

export const DEFAULT_UPSTREAM_URL =
  "https://raw.githubusercontent.com/imajij/intern-wire/main/static/data.json";

export async function syncInternships({
  upstreamUrl = process.env.JOBS_FEED_URL || DEFAULT_UPSTREAM_URL,
  outputPath = process.env.JOBS_OUTPUT_PATH || "public/internships.json",
  maxAgeDays = Number(process.env.MAX_JOB_AGE_DAYS || DEFAULT_MAX_AGE_DAYS),
  refreshHours = Number(process.env.REFRESH_INTERVAL_HOURS || DEFAULT_REFRESH_HOURS),
  minActiveJobs = Number(process.env.MIN_ACTIVE_JOBS || 10),
  now = new Date(),
} = {}) {
  const response = await fetch(upstreamUrl, {
    headers: { "user-agent": "InternWirePlus/1.0 (+https://github.com/nitin16112004/intern-wire-plus)" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Upstream feed returned HTTP ${response.status}.`);

  const upstream = await response.json();
  const feed = normalizeAndPruneFeed(upstream, { now, maxAgeDays, refreshHours });
  if (feed.total < minActiveJobs) {
    throw new Error(`Safety check stopped a suspicious refresh with only ${feed.total} active jobs.`);
  }

  const target = resolve(outputPath);
  const temporary = `${target}.next`;
  const serialized = `${JSON.stringify({
    ...feed,
    source_feed_url: upstreamUrl,
  })}\n`;
  await mkdir(dirname(target), { recursive: true });

  let previous = null;
  try {
    previous = await readFile(target, "utf8");
  } catch {
    // The first successful sync creates the snapshot.
  }
  if (previous === serialized) return { changed: false, feed };

  await writeFile(temporary, serialized, "utf8");
  await rename(temporary, target);
  return { changed: true, feed };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  const { changed, feed } = await syncInternships();
  console.log(`${changed ? "Updated" : "Checked"} ${feed.total} active internships.`);
}
