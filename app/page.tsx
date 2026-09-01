"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Bookmark, BookmarkCheck, BriefcaseBusiness, Building2, Check, ChevronRight, Clock3, ExternalLink, Filter, Flame, Inbox, MapPin, Radar, Rocket, Search, Sparkles, Target, X, Zap } from "lucide-react";
import { toast, Toaster } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

type Job = {
  id?: string | number;
  source: "linkedin" | "linkedin-post" | "twitter" | "manual" | string;
  title: string;
  company?: string | null;
  location?: string | null;
  url: string;
  posted_at?: string | null;
  scraped_at?: string | null;
  snippet?: string | null;
};

type Feed = {
  items: Job[];
  total: number;
  by_source: Record<string, number>;
  last_scraped?: string | null;
};

type TrackerStatus = "To apply" | "Applied" | "Interview" | "Offer";

const TRACKER_STATUSES: TrackerStatus[] = ["To apply", "Applied", "Interview", "Offer"];
const PAGE_SIZE = 24;
const SAVED_KEY = "internwire-plus-saved";
const TRACKED_KEY = "internwire-plus-tracked";

const statusStyles: Record<TrackerStatus, string> = {
  "To apply": "bg-white/5 text-slate-300 border-white/10",
  Applied: "bg-cyan-400/10 text-cyan-300 border-cyan-400/20",
  Interview: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  Offer: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
};

function jobKey(job: Job) {
  return String(job.id ?? job.url);
}

function categoryFor(title: string) {
  const value = title.toLowerCase();
  if (/quality|qa|test/.test(value)) return "QA & Testing";
  if (/data|analyst|machine learning|ai |artificial/.test(value)) return "Data & AI";
  if (/design|ui|ux|graphic/.test(value)) return "Design";
  if (/product|program manager|project manager/.test(value)) return "Product";
  if (/marketing|sales|growth|content/.test(value)) return "Business";
  if (/software|developer|engineer|frontend|backend|full.?stack|web/.test(value)) return "Engineering";
  return "Other";
}

function modeFor(job: Job) {
  const value = `${job.title} ${job.location ?? ""}`.toLowerCase();
  if (/remote|work from home|wfh/.test(value)) return "Remote";
  if (/hybrid/.test(value)) return "Hybrid";
  return "On-site";
}

function listingType(job: Job) {
  const value = job.title.toLowerCase();
  if (/intern|trainee/.test(value)) return "Internship";
  if (/fresher|graduate|entry.level|apprentice/.test(value)) return "Fresher";
  return "Other";
}

function relativeDate(value?: string | null) {
  if (!value) return "Date not listed";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return "Date not listed";
  const days = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function sourceLabel(source: string) {
  if (source === "manual") return "Editor pick";
  if (source === "linkedin-post") return "LinkedIn post";
  if (source === "twitter") return "X post";
  return "LinkedIn job";
}

function companyInitials(company?: string | null) {
  if (!company) return "IW";
  return company.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [category, setCategory] = useState("all");
  const [workMode, setWorkMode] = useState("all");
  const [roleType, setRoleType] = useState("Internship");
  const [freshness, setFreshness] = useState("30");
  const [sort, setSort] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [activeTab, setActiveTab] = useState("discover");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [tracked, setTracked] = useState<Record<string, TrackerStatus>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    fetch("/internships.json")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load internships");
        return response.json() as Promise<Feed>;
      })
      .then(setFeed)
      .catch(() => setLoadError(true));

    const hydrationTimer = window.setTimeout(() => {
      setSaved(safeRead<string[]>(SAVED_KEY, []));
      setTracked(safeRead<Record<string, TrackerStatus>>(TRACKED_KEY, {}));
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  }, [saved, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(TRACKED_KEY, JSON.stringify(tracked));
  }, [tracked, hydrated]);

  const filteredJobs = useMemo(() => {
    if (!feed) return [];
    const needle = query.trim().toLowerCase();
    const referenceTime = feed.items.reduce((latest, job) => {
      const timestamp = new Date(job.posted_at ?? job.scraped_at ?? 0).getTime();
      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, new Date(feed.last_scraped ?? 0).getTime() || 0);
    const cutoff = freshness === "all" || !referenceTime ? null : referenceTime - Number(freshness) * 86_400_000;
    const rows = feed.items.filter((job) => {
      if (source !== "all" && job.source !== source) return false;
      if (category !== "all" && categoryFor(job.title) !== category) return false;
      if (workMode !== "all" && modeFor(job) !== workMode) return false;
      if (roleType !== "all" && listingType(job) !== roleType) return false;
      if (cutoff) {
        const date = new Date(job.posted_at ?? job.scraped_at ?? 0).getTime();
        if (!date || date < cutoff) return false;
      }
      if (needle) {
        const haystack = [job.title, job.company, job.location, job.snippet].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      if (sort === "company") return (a.company ?? "").localeCompare(b.company ?? "");
      if (sort === "role") return a.title.localeCompare(b.title);
      return new Date(b.posted_at ?? b.scraped_at ?? 0).getTime() - new Date(a.posted_at ?? a.scraped_at ?? 0).getTime();
    });
  }, [feed, query, source, category, workMode, roleType, freshness, sort]);

  const jobsById = useMemo(() => {
    const map = new Map<string, Job>();
    feed?.items.forEach((job) => map.set(jobKey(job), job));
    return map;
  }, [feed]);

  const savedJobs = saved.map((id) => jobsById.get(id)).filter(Boolean) as Job[];
  const trackedJobs = Object.keys(tracked).map((id) => jobsById.get(id)).filter(Boolean) as Job[];
  const categories = useMemo(() => Array.from(new Set((feed?.items ?? []).map((job) => categoryFor(job.title)))).sort(), [feed]);

  function toggleSaved(job: Job) {
    const key = jobKey(job);
    const isSaved = saved.includes(key);
    setSaved((current) => current.includes(key) ? current.filter((id) => id !== key) : [key, ...current]);
    toast.success(isSaved ? "Removed from saved roles" : "Role saved to your shortlist");
  }

  function updateStatus(job: Job, status: TrackerStatus) {
    setTracked((current) => ({ ...current, [jobKey(job)]: status }));
    toast.success(`Moved to ${status}`);
  }

  function clearFilters() {
    setQuery("");
    setSource("all");
    setCategory("all");
    setWorkMode("all");
    setRoleType("Internship");
    setFreshness("30");
    setSort("newest");
    setVisibleCount(PAGE_SIZE);
  }

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setVisibleCount(PAGE_SIZE);
  }

  const activeFilterCount = [source !== "all", category !== "all", workMode !== "all", roleType !== "Internship", freshness !== "30"].filter(Boolean).length;

  return (
    <main className="site-shell min-h-screen bg-background text-foreground">
      <header className="topbar sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button className="group flex items-center gap-3" onClick={() => setActiveTab("discover")} aria-label="Open InternWire home">
            <span className="brand-mark grid size-10 place-items-center rounded-xl text-sm font-black text-white transition-transform group-hover:-rotate-6">IW</span>
            <span className="text-lg font-extrabold tracking-[-0.04em] text-white">InternWire<span className="text-cyan-300">+</span></span>
          </button>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 sm:flex">
            <span className="live-dot size-2 rounded-full bg-emerald-400" />
            Snapshot updated {feed?.last_scraped ? relativeDate(feed.last_scraped) : "recently"}
          </div>
          <Button size="sm" className="glow-button rounded-full" onClick={() => setActiveTab("saved")}><Bookmark className="size-4" /> <span className="hidden sm:inline">Saved</span>{saved.length > 0 ? ` ${saved.length}` : ""}</Button>
        </div>
      </header>

      <section className="hero-shell relative overflow-hidden border-b border-white/10">
        <div className="aurora aurora-one" aria-hidden="true" />
        <div className="aurora aurora-two" aria-hidden="true" />
        <div className="hero-grid-overlay" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-[1440px] items-center gap-8 px-4 pb-8 pt-9 sm:px-6 lg:grid-cols-[1.2fr_.8fr] lg:px-8 lg:pb-10 lg:pt-12">
          <div className="hero-copy">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold text-cyan-200"><Sparkles className="size-3.5" /> Career opportunities, decoded</div>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white text-balance sm:text-5xl lg:text-[3.6rem]">Your internship search, <span className="gradient-text">finally in focus.</span></h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Discover verified openings, build a shortlist and move every application from idea to offer.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button className="glow-button h-11 rounded-full px-5" onClick={() => document.getElementById("opportunities")?.scrollIntoView({ behavior: "smooth" })}>Explore opportunities <ArrowRight className="size-4" /></Button>
              <div className="flex items-center gap-2 text-sm text-slate-400"><span className="flex -space-x-2"><span className="source-bubble bg-[#0a66c2]">in</span><span className="source-bubble bg-white text-slate-950">X</span><span className="source-bubble bg-orange-500"><Flame className="size-3" /></span></span> Direct source links</div>
            </div>
          </div>
          <CareerPulse roles={feed?.total ?? 0} saved={saved.length} tracked={trackedJobs} trackedState={tracked} />
        </div>
        <div className="relative mx-auto grid max-w-[1440px] grid-cols-2 gap-px overflow-hidden border-x border-t border-white/10 bg-white/10 sm:grid-cols-4">
          <Metric value={feed ? feed.total.toLocaleString("en-IN") : "—"} label="Indexed roles" icon={<BriefcaseBusiness />} />
          <Metric value={String(Object.keys(feed?.by_source ?? {}).length || "—")} label="Direct sources" icon={<Radar />} />
          <Metric value={saved.length.toString()} label="Saved by you" icon={<Bookmark />} />
          <Metric value={trackedJobs.length.toString()} label="In your tracker" icon={<Target />} />
        </div>
      </section>

      <div id="opportunities" className="workspace-shell mx-auto max-w-[1440px] scroll-mt-20 px-4 py-7 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-6 flex flex-col justify-between gap-4 border-b border-border sm:flex-row sm:items-end">
            <TabsList variant="line" className="scrollbar-none h-11 w-full justify-start gap-5 overflow-x-auto sm:w-auto">
              <TabsTrigger value="discover" className="px-1 text-sm">Discover</TabsTrigger>
              <TabsTrigger value="saved" className="px-1 text-sm">Saved <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]">{saved.length}</span></TabsTrigger>
              <TabsTrigger value="tracker" className="px-1 text-sm">Application tracker <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]">{trackedJobs.length}</span></TabsTrigger>
            </TabsList>
            <p className="pb-3 text-xs text-muted-foreground">Your saved roles and tracker stay on this device.</p>
          </div>

          <TabsContent value="discover">
            <div className="filter-deck mb-5 rounded-3xl border border-border bg-card p-3 sm:p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_repeat(5,auto)]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} placeholder="Search role, company or city" className="search-field h-11 rounded-xl border border-white/10 bg-white/5 pl-10 shadow-none focus-visible:ring-cyan-300/25" />
                  {query && <button onClick={() => updateFilter(setQuery, "")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>}
                </div>
                <FilterSelect value={roleType} onChange={(value) => updateFilter(setRoleType, value)} label="Role type" options={["all", "Internship", "Fresher"]} />
                <FilterSelect value={category} onChange={(value) => updateFilter(setCategory, value)} label="Category" options={["all", ...categories]} />
                <FilterSelect value={workMode} onChange={(value) => updateFilter(setWorkMode, value)} label="Work mode" options={["all", "Remote", "Hybrid", "On-site"]} />
                <FilterSelect value={freshness} onChange={(value) => updateFilter(setFreshness, value)} label="Posted" options={["1", "7", "30", "all"]} display={{ "1": "Today", "7": "7 days", "30": "30 days", all: "Any time" }} />
                <FilterSelect value={sort} onChange={(value) => updateFilter(setSort, value)} label="Sort" options={["newest", "company", "role"]} display={{ newest: "Newest", company: "Company", role: "Role A–Z" }} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Filter className="size-3.5" /> Source</span>
                {[["all", "All sources"], ["linkedin", "LinkedIn jobs"], ["linkedin-post", "LinkedIn posts"], ["manual", "Editor picks"], ["twitter", "X posts"]].map(([value, label]) => (
                  <button key={value} onClick={() => updateFilter(setSource, value)} className={`source-chip rounded-full border px-3 py-1.5 text-xs font-semibold transition ${source === value ? "is-active border-cyan-300/30 bg-cyan-300/15 text-cyan-200" : "border-white/10 bg-white/[.03] text-muted-foreground hover:border-cyan-300/30 hover:text-white"}`}>{label}</button>
                ))}
                {(activeFilterCount > 0 || query) && <button onClick={clearFilters} className="ml-auto text-xs font-semibold text-primary hover:underline">Reset filters</button>}
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h2 className="text-xl font-extrabold tracking-tight">Recommended openings</h2><p className="mt-1 text-sm text-muted-foreground">{filteredJobs.length.toLocaleString("en-IN")} matching opportunities</p></div>
              <div className="hidden rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:block">Direct links only · no sign-up</div>
            </div>

            {loadError ? <EmptyState title="Listings could not load" description="Please refresh the page and try again." /> : !feed ? <LoadingGrid /> : filteredJobs.length === 0 ? <EmptyState title="No exact matches" description="Try a broader keyword or reset one of the filters." action={<Button variant="outline" onClick={clearFilters}>Reset filters</Button>} /> : (
              <>
                <div className="job-grid grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {filteredJobs.slice(0, visibleCount).map((job) => <JobCard key={jobKey(job)} job={job} saved={saved.includes(jobKey(job))} trackedStatus={tracked[jobKey(job)]} onSave={() => toggleSaved(job)} onOpen={() => setSelectedJob(job)} onTrack={(status) => updateStatus(job, status)} />)}
                </div>
                {visibleCount < filteredJobs.length && <div className="mt-8 flex justify-center"><Button variant="outline" size="lg" className="rounded-full px-8" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Show more roles <ChevronRight className="size-4" /></Button></div>}
              </>
            )}
          </TabsContent>

          <TabsContent value="saved">
            <SectionHeader title="Saved opportunities" description="A focused shortlist for roles you want to revisit." />
            {savedJobs.length === 0 ? <EmptyState title="Your shortlist is empty" description="Save promising roles while browsing and they will appear here." action={<Button onClick={() => setActiveTab("discover")}>Browse internships</Button>} /> : <div className="job-grid grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{savedJobs.map((job) => <JobCard key={jobKey(job)} job={job} saved trackedStatus={tracked[jobKey(job)]} onSave={() => toggleSaved(job)} onOpen={() => setSelectedJob(job)} onTrack={(status) => updateStatus(job, status)} />)}</div>}
          </TabsContent>

          <TabsContent value="tracker">
            <SectionHeader title="Application tracker" description="Move each application forward without losing the original job link." />
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{TRACKER_STATUSES.map((status, index) => <div key={status} className="tracker-stat rounded-2xl border border-border bg-card p-4" style={{ animationDelay: `${index * 80}ms` }}><div className="flex items-center justify-between"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[status]}`}>{status}</span><span className="text-2xl font-black tracking-tight">{trackedJobs.filter((job) => tracked[jobKey(job)] === status).length}</span></div></div>)}</div>
            {trackedJobs.length === 0 ? <EmptyState title="No applications tracked yet" description="Add a role from Discover, then update its stage as you progress." action={<Button onClick={() => setActiveTab("discover")}>Find a role</Button>} /> : <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_45px_rgba(15,23,42,.05)]"><div className="hidden grid-cols-[1.6fr_1fr_160px_110px] gap-4 border-b border-border bg-muted/45 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground md:grid"><span>Opportunity</span><span>Location</span><span>Status</span><span>Action</span></div>{trackedJobs.map((job) => <TrackerRow key={jobKey(job)} job={job} status={tracked[jobKey(job)]} onStatus={(status) => updateStatus(job, status)} onOpen={() => setSelectedJob(job)} onRemove={() => setTracked((current) => { const copy = { ...current }; delete copy[jobKey(job)]; return copy; })} />)}</div>}
          </TabsContent>
        </Tabs>
      </div>

      <footer className="mt-10 border-t border-border bg-[#070910]"><div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8"><p><span className="font-bold text-white">InternWire+</span> · Find, shortlist and track internships.</p><p>Always verify eligibility and apply on the original source.</p></div></footer>

      <JobSheet job={selectedJob} open={Boolean(selectedJob)} onOpenChange={(open) => !open && setSelectedJob(null)} saved={selectedJob ? saved.includes(jobKey(selectedJob)) : false} status={selectedJob ? tracked[jobKey(selectedJob)] : undefined} onSave={() => selectedJob && toggleSaved(selectedJob)} onTrack={(status) => selectedJob && updateStatus(selectedJob, status)} />
      <Toaster theme="dark" position="bottom-right" richColors />
    </main>
  );
}

function Metric({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return <div className="metric-tile bg-[#0d1120]/90 p-4 backdrop-blur"><div className="flex items-start justify-between"><div><div className="text-2xl font-black tracking-[-0.04em] text-white">{value}</div><div className="mt-1 text-xs font-semibold text-slate-400">{label}</div></div><span className="grid size-8 place-items-center rounded-lg bg-violet-400/10 text-violet-300 [&>svg]:size-4">{icon}</span></div></div>;
}

function CareerPulse({ roles, saved, tracked, trackedState }: { roles: number; saved: number; tracked: Job[]; trackedState: Record<string, TrackerStatus> }) {
  const interviewCount = tracked.filter((job) => trackedState[jobKey(job)] === "Interview").length;
  const offerCount = tracked.filter((job) => trackedState[jobKey(job)] === "Offer").length;
  return <div className="career-pulse relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[.06] p-5 shadow-2xl backdrop-blur-xl">
    <div className="scan-line" aria-hidden="true" />
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Career pulse</p><p className="mt-1 text-sm text-slate-400">Your search, moving forward</p></div><span className="radar-icon grid size-10 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Radar className="size-5" /></span></div>
    <div className="mt-5 grid grid-cols-[1fr_auto] items-end gap-4"><div className="pulse-bars flex h-24 items-end gap-2" aria-label={`${roles} indexed roles`}><span style={{ height: "28%" }} /><span style={{ height: "44%" }} /><span style={{ height: "36%" }} /><span style={{ height: "66%" }} /><span style={{ height: "54%" }} /><span style={{ height: "82%" }} /><span style={{ height: "72%" }} /><span style={{ height: "100%" }} /></div><div className="pb-1 text-right"><p className="text-3xl font-black tracking-[-.05em] text-white">{roles || "—"}</p><p className="text-xs text-slate-400">roles indexed</p></div></div>
    <div className="mt-5 grid grid-cols-4 gap-2">
      <PulseStage icon={<Bookmark />} label="Saved" count={saved} active={saved > 0} />
      <PulseStage icon={<Zap />} label="Applied" count={tracked.length} active={tracked.length > 0} />
      <PulseStage icon={<Target />} label="Interview" count={interviewCount} active={interviewCount > 0} />
      <PulseStage icon={<Rocket />} label="Offer" count={offerCount} active={offerCount > 0} />
    </div>
  </div>;
}

function PulseStage({ icon, label, count, active }: { icon: React.ReactNode; label: string; count: number; active: boolean }) {
  return <div className={`pulse-stage ${active ? "is-active" : ""}`}><span className="mx-auto grid size-8 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-400 [&>svg]:size-3.5">{icon}</span><p className="mt-2 text-center text-xs font-bold text-slate-300">{count}</p><p className="mt-0.5 truncate text-center text-[10px] text-slate-500">{label}</p></div>;
}

function FilterSelect({ value, onChange, label, options, display = {} }: { value: string; onChange: (value: string) => void; label: string; options: string[]; display?: Record<string, string> }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="h-11 min-w-[132px] rounded-xl border-white/10 bg-white/5" aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{display[option] ?? (option === "all" ? `All ${label.toLowerCase()}` : option)}</SelectItem>)}</SelectContent></Select>;
}

function JobCard({ job, saved, trackedStatus, onSave, onOpen, onTrack }: { job: Job; saved: boolean; trackedStatus?: TrackerStatus; onSave: () => void; onOpen: () => void; onTrack: (status: TrackerStatus) => void }) {
  const mode = modeFor(job);
  return <article className="job-card group relative flex min-h-[285px] flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 transition duration-300">
    <div className="card-glow" aria-hidden="true" />
    <div className="relative flex items-start justify-between gap-4"><div className="company-mark grid size-12 shrink-0 place-items-center rounded-2xl border border-white/10 text-sm font-black text-white">{companyInitials(job.company)}</div><button onClick={onSave} aria-label={saved ? "Remove from saved" : "Save opportunity"} className={`grid size-9 place-items-center rounded-full border transition ${saved ? "border-cyan-300/25 bg-cyan-300/15 text-cyan-200" : "border-white/10 bg-white/[.03] text-muted-foreground hover:border-cyan-300/30 hover:text-cyan-200"}`}>{saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}</button></div>
    <button onClick={onOpen} className="relative mt-4 text-left"><h3 className="line-clamp-2 text-[1.08rem] font-extrabold leading-6 tracking-[-0.02em] text-white transition group-hover:text-cyan-200">{job.title}</h3><p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"><Building2 className="size-3.5" /> {job.company || "Company not listed"}</p></button>
    <div className="relative mt-4 flex flex-wrap gap-2"><Badge variant="secondary" className="border border-violet-400/15 bg-violet-400/10 text-violet-200">{categoryFor(job.title)}</Badge><Badge variant="outline"><MapPin className="size-3" /> {mode}</Badge>{job.source === "manual" && <Badge className="bg-orange-500 text-white">Editor pick</Badge>}</div>
    <div className="relative mt-auto flex items-end justify-between gap-4 border-t border-border/70 pt-4"><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{job.location || "Location not listed"}</p><p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-300"><Clock3 className="size-3" /> {relativeDate(job.posted_at ?? job.scraped_at)}</p></div><div className="flex gap-2">{trackedStatus ? <Select value={trackedStatus} onValueChange={(value) => onTrack(value as TrackerStatus)}><SelectTrigger size="sm" className="max-w-[125px] rounded-full"><SelectValue /></SelectTrigger><SelectContent>{TRACKER_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select> : <Button variant="outline" size="sm" className="rounded-full" onClick={() => onTrack("To apply")}>Track</Button>}<Button size="sm" className="glow-button rounded-full" onClick={onOpen}>View <ArrowUpRight className="size-3.5" /></Button></div></div>
  </article>;
}

function TrackerRow({ job, status, onStatus, onOpen, onRemove }: { job: Job; status: TrackerStatus; onStatus: (status: TrackerStatus) => void; onOpen: () => void; onRemove: () => void }) {
  return <div className="grid gap-4 border-b border-border px-5 py-4 last:border-b-0 md:grid-cols-[1.6fr_1fr_160px_110px] md:items-center"><button onClick={onOpen} className="flex items-center gap-3 text-left"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-xs font-black">{companyInitials(job.company)}</span><span className="min-w-0"><span className="block truncate font-bold">{job.title}</span><span className="block truncate text-xs text-muted-foreground">{job.company || "Company not listed"}</span></span></button><span className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-3.5" /> {job.location || "Not listed"}</span><Select value={status} onValueChange={(value) => onStatus(value as TrackerStatus)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{TRACKER_STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><div className="flex gap-2"><Button variant="outline" size="icon-sm" onClick={onOpen} aria-label="View role"><ExternalLink /></Button><Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove from tracker" className="text-muted-foreground hover:text-destructive"><X /></Button></div></div>;
}

function JobSheet({ job, open, onOpenChange, saved, status, onSave, onTrack }: { job: Job | null; open: boolean; onOpenChange: (open: boolean) => void; saved: boolean; status?: TrackerStatus; onSave: () => void; onTrack: (status: TrackerStatus) => void }) {
  if (!job) return null;
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto border-white/10 bg-[#0c0f1c] sm:max-w-xl"><SheetHeader className="border-b border-border px-6 pb-5 pt-7"><div className="mb-4 flex items-center gap-3"><span className="company-mark grid size-12 place-items-center rounded-xl border border-white/10 text-sm font-black text-white">{companyInitials(job.company)}</span><div><p className="text-sm font-bold">{job.company || "Company not listed"}</p><p className="text-xs text-muted-foreground">{sourceLabel(job.source)}</p></div></div><SheetTitle className="pr-8 text-2xl font-black leading-tight tracking-[-0.035em]">{job.title}</SheetTitle><SheetDescription className="flex flex-wrap gap-x-4 gap-y-2 pt-2"><span className="flex items-center gap-1"><MapPin className="size-3.5" /> {job.location || "Location not listed"}</span><span className="flex items-center gap-1"><Clock3 className="size-3.5" /> {relativeDate(job.posted_at ?? job.scraped_at)}</span></SheetDescription></SheetHeader><div className="space-y-6 px-6 py-5"><div className="flex flex-wrap gap-2"><Badge className="border border-violet-400/15 bg-violet-400/10 text-violet-200">{categoryFor(job.title)}</Badge><Badge variant="outline">{listingType(job)}</Badge><Badge variant="outline">{modeFor(job)}</Badge></div>{job.snippet && <div><h4 className="text-sm font-extrabold">Listing note</h4><p className="mt-2 text-sm leading-6 text-muted-foreground">{job.snippet}</p></div>}<div className="rounded-2xl border border-border bg-white/[.03] p-4"><h4 className="flex items-center gap-2 text-sm font-extrabold"><Check className="size-4 text-emerald-300" /> Before you apply</h4><ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground"><li>• Verify graduation year and location eligibility.</li><li>• Tailor your resume to the role title and required skills.</li><li>• Apply only through the original source linked below.</li></ul></div><div><h4 className="mb-2 text-sm font-extrabold">Tracker stage</h4><Select value={status ?? "To apply"} onValueChange={(value) => onTrack(value as TrackerStatus)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{TRACKER_STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div></div><SheetFooter className="sticky bottom-0 grid grid-cols-[auto_1fr] gap-2 border-t border-border bg-[#0c0f1c]/95 px-6 py-4 backdrop-blur"><Button variant="outline" onClick={onSave}>{saved ? <BookmarkCheck /> : <Bookmark />}{saved ? "Saved" : "Save"}</Button><Button className="glow-button" asChild><a href={job.url} target="_blank" rel="noopener noreferrer">Apply on original source <ExternalLink /></a></Button></SheetFooter></SheetContent></Sheet>;
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return <div className="mb-5"><h2 className="text-2xl font-black tracking-[-0.035em]">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <Empty className="min-h-[360px] border border-dashed border-border bg-card"><EmptyHeader><EmptyMedia variant="icon"><Inbox /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{action}</Empty>;
}

function LoadingGrid() {
  return <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[275px] animate-pulse rounded-2xl border border-border bg-card p-5"><div className="size-12 rounded-xl bg-muted" /><div className="mt-5 h-5 w-4/5 rounded bg-muted" /><div className="mt-3 h-4 w-2/5 rounded bg-muted" /><div className="mt-6 h-6 w-3/5 rounded bg-muted" /></div>)}</div>;
}
