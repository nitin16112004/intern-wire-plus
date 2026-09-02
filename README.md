# InternWire+

> A premium internship discovery and application-tracking workspace built for students and fresh graduates.

[![Live Demo](https://img.shields.io/badge/Live_Demo-InternWire%2B-7c5cff?style=for-the-badge)](https://intern-wire-plus.patelpavan7757.chatgpt.site)
[![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)

## Overview

InternWire+ turns a large internship feed into a focused job-search workflow. Users can search and filter direct-source opportunities, save promising roles, inspect job details and move applications through a simple pipeline without creating an account.

The interface uses a dark career-dashboard visual system with animated aurora lighting, a live career-pulse graphic, responsive job cards and accessible reduced-motion behavior.

**Live application:** [intern-wire-plus.patelpavan7757.chatgpt.site](https://intern-wire-plus.patelpavan7757.chatgpt.site)

## Features

- Search by role, company, keyword or location
- Filter by role type, category, work mode, source and freshness
- Sort opportunities by newest, company or role
- Save and remove opportunities from a personal shortlist
- Track applications across `To apply`, `Applied`, `Interview` and `Offer`
- Open a detailed job panel before visiting the original source
- Persist saved roles and tracker stages in browser storage
- Refresh LinkedIn, Indeed, Naukri and public job APIs automatically every eight hours
- Keep the last healthy snapshot when one source is temporarily blocked
- Deduplicate listings and remove closed, invalid or 30-day-old roles
- Fall back to the last bundled snapshot if a live refresh is unavailable
- Use the full workflow on desktop, tablet and mobile
- Respect the operating system's reduced-motion preference

## Product Flow

```mermaid
flowchart LR
    A[Discover roles] --> B[Filter and compare]
    B --> C[Save shortlist]
    C --> D[Apply at source]
    D --> E[Track progress]
    E --> F[Interview or offer]
```

## Tech Stack

| Area | Technology |
| --- | --- |
| UI | React 19, TypeScript, Tailwind CSS 4 |
| Framework | Vinext / Next-compatible App Router |
| Components | Radix UI, Shadcn-style primitives, Lucide icons |
| Feedback | Sonner notifications |
| State | React hooks and browser `localStorage` |
| Automation | Scheduled GitHub Actions feed refresh |
| Build | Vite 8, Vinext build pipeline |
| Hosting | Cloudflare Workers-compatible Sites deployment |

## Getting Started

### Requirements

- Node.js `22.13.0` or newer
- npm

### Installation

```bash
git clone https://github.com/nitin16112004/intern-wire-plus.git
cd intern-wire-plus
npm ci
```

### Development

```bash
npm run dev
```

### Production build

```bash
npm run build
```

### Run the production build

```bash
npm run start
```

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the built application |
| `npm run lint` | Run ESLint checks |
| `npm test` | Build and execute the included tests |
| `npm run sync:jobs` | Refresh, deduplicate and prune the internship feed |
| `npm run install:ci` | Install the locked dependency set in the hosted build environment |

## Project Structure

```text
intern-wire-plus/
├── app/
│   ├── globals.css        # Theme, responsive styling and animations
│   ├── layout.tsx         # Metadata and root document layout
│   └── page.tsx           # Discovery, saved roles, details and tracker UI
├── components/ui/         # Reusable accessible interface primitives
├── hooks/                 # Shared React hooks
├── lib/                   # Utility and feed-normalization helpers
├── public/
│   ├── internships.json   # Last validated internship feed snapshot
│   └── favicon.svg
├── scripts/               # Build helpers and feed sync command
├── tests/                 # Rendering, component and feed-policy checks
├── worker/                # Cloudflare-compatible worker entry point
├── .github/workflows/     # CI and eight-hour feed automation
├── package.json
└── vite.config.ts
```

## Data Model

Each listing follows this shape:

```ts
type Job = {
  id?: string | number;
  source: "linkedin" | "indeed" | "naukri" | "himalayas" | "arbeitnow" | "remotive" | string;
  title: string;
  company?: string | null;
  location?: string | null;
  url: string;
  posted_at?: string | null;
  scraped_at?: string | null;
  expires_at?: string | null;
  snippet?: string | null;
};
```

### Automatic feed lifecycle

The `Refresh internship feed` workflow runs every eight hours and can also be started manually. It queries each source independently, validates the merged payload, removes malformed and explicitly closed records, deduplicates tracking URLs, and drops listings after a 30-day active window. A minimum-result safety check prevents a broken upstream response from wiping the existing feed.

| Source | Integration | Coverage |
| --- | --- | --- |
| LinkedIn + curated feed | The Intern Wire public snapshot | India-focused internships |
| Indeed India | Public search-result page parser | India internships and freshers |
| Naukri | Public job-search response | India internships and fresher roles |
| Himalayas | Official public JSON API | Remote internships open to India |
| Arbeitnow | Official public JSON API | European ATS and early-career roles |
| Remotive | Official public JSON API | International remote internships |

Indeed and Naukri can throttle automated requests or change their public result format. Each adapter therefore fails independently: a temporary block keeps that source's last healthy, still-unexpired records while the remaining sources continue refreshing. `JOBS_SOURCE_IDS` can restrict enabled adapters, and `NAUKRI_NKPARAM` can be supplied as a repository secret if Naukri requires its current public-client parameter.

The production Worker serves the refreshed file from this repository and re-applies the expiry rules on every response. If the live file cannot be reached, it uses the last bundled snapshot. This means an expired listing disappears at request time even if a scheduled run is delayed. An external source can close a role before its age limit without exposing a machine-readable status, so applicants should still confirm availability on the original page.

Saved job IDs and tracker stages are device-local and do not leave the browser.

## Design System

- Ink-black background with violet, cyan and emerald signals
- Frosted surfaces and subtle gradient borders
- Animated career-pulse data graphic
- Staggered job-card entrance and hover feedback
- Touch-friendly controls and horizontally scrollable mobile tabs
- `prefers-reduced-motion` support for accessibility

## Deployment

The project builds to a Cloudflare Workers-compatible artifact. The included `.openai/hosting.json`, worker entry point and build scripts support deployment through ChatGPT Sites. The standard production build can also be adapted to another Vinext-compatible host.

## Roadmap

- Add server-backed user accounts and cross-device saved roles
- Add eligibility filters for graduation year and degree
- Add notes, deadlines and reminders to tracked applications
- Add an admin workflow for curated opportunities

## Acknowledgements

The product concept was informed by [The Intern Wire](https://github.com/imajij/intern-wire), an open internship aggregation project. Multi-source adapters use the public interfaces exposed by Indeed, Naukri, Himalayas, Arbeitnow and Remotive; each listing remains attributed and links back to its original source. InternWire+ uses an independently built React interface and extends the concept with a shortlist, application tracker and redesigned experience.

Job titles, company names and outbound links in the bundled data snapshot belong to their respective sources. Always verify eligibility and listing validity on the original page before applying.

## License

The application code is available under the [MIT License](LICENSE). Third-party dependencies and vendored assets remain subject to their own licenses.
