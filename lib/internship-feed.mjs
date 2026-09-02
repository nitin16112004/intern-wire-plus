const DAY_MS = 86_400_000;

export const DEFAULT_REFRESH_HOURS = 8;
export const DEFAULT_MAX_AGE_DAYS = 30;

function timestamp(value) {
  if (!value) return null;
  const parsed = new Date(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00Z`
      : value,
  ).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|trk$|trackingId$|refId$|originalSubdomain$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isExplicitlyClosed(job) {
  const status = String(job.status ?? job.state ?? "").toLowerCase();
  if (["closed", "expired", "inactive", "filled", "removed"].includes(status)) return true;
  if (job.active === false || job.is_active === false || job.expired === true) return true;
  return /\b(applications?|position|role)\s+(?:are\s+|is\s+)?(?:closed|expired)\b|\bno longer accepting\b/i.test(
    String(job.title ?? ""),
  );
}

function sourceCounts(items) {
  return items.reduce((counts, job) => {
    const source = String(job.source || "unknown");
    counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  }, {});
}

export function normalizeAndPruneFeed(input, options = {}) {
  if (!input || !Array.isArray(input.items)) {
    throw new TypeError("Internship feed must contain an items array.");
  }

  const nowMs = options.now instanceof Date
    ? options.now.getTime()
    : Number(options.now ?? Date.now());
  const maxAgeDays = Number(options.maxAgeDays ?? input.max_age_days ?? DEFAULT_MAX_AGE_DAYS);
  const refreshHours = Number(options.refreshHours ?? input.refresh_interval_hours ?? DEFAULT_REFRESH_HOURS);
  if (!Number.isFinite(nowMs) || maxAgeDays <= 0 || refreshHours <= 0) {
    throw new RangeError("Feed timing options must be positive numbers.");
  }

  const cutoff = nowMs - maxAgeDays * DAY_MS;
  const unique = new Map();

  for (const candidate of input.items) {
    if (!candidate || typeof candidate !== "object" || isExplicitlyClosed(candidate)) continue;
    const title = String(candidate.title ?? "").trim();
    const url = cleanUrl(candidate.url);
    const listedAt = timestamp(candidate.posted_at) ?? timestamp(candidate.scraped_at);
    if (!title || !url || !listedAt || listedAt < cutoff) continue;

    const computedExpiry = listedAt + maxAgeDays * DAY_MS;
    const explicitExpiry = timestamp(candidate.expires_at);
    const expiresAt = explicitExpiry ? Math.min(explicitExpiry, computedExpiry) : computedExpiry;
    if (expiresAt <= nowMs) continue;

    const normalized = {
      ...candidate,
      title,
      url,
      source: String(candidate.source || "unknown"),
      expires_at: new Date(expiresAt).toISOString(),
    };
    const existing = unique.get(url);
    const existingTime = existing
      ? timestamp(existing.posted_at) ?? timestamp(existing.scraped_at) ?? 0
      : 0;
    if (!existing || listedAt > existingTime) unique.set(url, normalized);
  }

  const items = [...unique.values()].sort((left, right) => {
    const leftTime = timestamp(left.posted_at) ?? timestamp(left.scraped_at) ?? 0;
    const rightTime = timestamp(right.posted_at) ?? timestamp(right.scraped_at) ?? 0;
    return rightTime - leftTime;
  });
  const syncedAt = input.synced_at ?? new Date(nowMs).toISOString();
  const nextRefreshAt = input.next_refresh_at
    ?? new Date((timestamp(syncedAt) ?? nowMs) + refreshHours * 3_600_000).toISOString();

  return {
    generated_at: input.generated_at ?? syncedAt,
    upstream_generated_at: input.upstream_generated_at ?? input.generated_at ?? input.last_scraped ?? null,
    synced_at: syncedAt,
    next_refresh_at: nextRefreshAt,
    refresh_interval_hours: refreshHours,
    max_age_days: maxAgeDays,
    total: items.length,
    by_source: sourceCounts(items),
    source_status: input.source_status ?? null,
    source_feed_urls: input.source_feed_urls ?? null,
    last_scraped: input.last_scraped ?? input.generated_at ?? syncedAt,
    items,
  };
}
