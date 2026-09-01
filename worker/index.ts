/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { DEFAULT_MAX_AGE_DAYS, DEFAULT_REFRESH_HOURS, normalizeAndPruneFeed } from "../lib/internship-feed.mjs";

const LIVE_FEED_URL =
  "https://raw.githubusercontent.com/nitin16112004/intern-wire-plus/main/public/internships.json";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

async function loadFeed(request: Request, env: Env) {
  let payload: unknown;
  let source = "github-live";

  try {
    const response = await fetch(LIVE_FEED_URL, {
      headers: { "user-agent": "InternWirePlus/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Live feed returned HTTP ${response.status}.`);
    payload = await response.json();
  } catch {
    source = "bundled-fallback";
    const fallbackUrl = new URL("/internships.json", request.url);
    const response = await env.ASSETS.fetch(new Request(fallbackUrl));
    if (!response.ok) return new Response("Internship feed unavailable", { status: 503 });
    payload = await response.json();
  }

  try {
    const feed = normalizeAndPruneFeed(payload, {
      maxAgeDays: DEFAULT_MAX_AGE_DAYS,
      refreshHours: DEFAULT_REFRESH_HOURS,
    });
    const response = new Response(JSON.stringify({ ...feed, served_from: source }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600",
        "x-content-type-options": "nosniff",
        "x-internwire-feed": source,
      },
    });
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  } catch {
    return new Response("Internship feed invalid", { status: 502 });
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname === "/api/internships" && (request.method === "GET" || request.method === "HEAD")) {
      return loadFeed(request, env);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
