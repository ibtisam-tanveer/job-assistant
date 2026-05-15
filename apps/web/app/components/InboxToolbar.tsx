"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

const STATUSES = ["", "saved", "applied", "phone", "onsite", "offer", "rejected"] as const;

export function InboxToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const sort = searchParams.get("sort") ?? "updated";

  const push = useCallback(
    (next: Record<string, string>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      startTransition(() => {
        router.push(`/?${p.toString()}`);
      });
    },
    [router, searchParams],
  );

  return (
    <form
      className="ja-inbox-toolbar"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        push({
          q: String(fd.get("q") ?? ""),
          status: String(fd.get("status") ?? ""),
          sort: String(fd.get("sort") ?? "updated"),
        });
      }}
    >
      <input
        name="q"
        type="search"
        className="ja-input ja-inbox-search"
        placeholder="Search title, company, location…"
        defaultValue={q}
        aria-label="Search jobs"
      />
      <select
        name="status"
        className="ja-select ja-inbox-select"
        defaultValue={status}
        aria-label="Filter by status"
        onChange={(e) =>
          push({ q, status: e.target.value, sort })
        }
      >
        <option value="">All statuses</option>
        {STATUSES.filter(Boolean).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        name="sort"
        className="ja-select ja-inbox-select"
        defaultValue={sort}
        aria-label="Sort jobs"
        onChange={(e) =>
          push({ q, status, sort: e.target.value })
        }
      >
        <option value="updated">Recently updated</option>
        <option value="title">Title A–Z</option>
        <option value="company">Company A–Z</option>
      </select>
      <button type="submit" className="ja-btn ja-btn--ghost ja-btn--sm" disabled={pending}>
        {pending ? "…" : "Search"}
      </button>
    </form>
  );
}
