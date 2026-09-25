"use client";

import { Card } from "@/components/layout/Card";
import { Chip } from "@/components/primitives/Chip";
import { FilterRow } from "@/components/search/FilterRow";
import { SearchBar } from "@/components/search/SearchBar";
import { SelectFilter } from "@/components/search/SelectFilter";
import { Tag } from "@/generated/prisma/client";
import { capitalizeFirstLetter } from "@/lib/strings";
import { FOCUS_RING } from "@/lib/styles";
import { TeaStat } from "@/lib/types";
import { useMemo, useState } from "react";
import { TeaCard } from "./TeaCard";
import { TeaOfTheDay } from "./TeaOfTheDay";
import { TeaTable } from "./TeaTable";

type Props = {
  onClick?: (id: string) => void;
  teas: TeaStat[];
  tags: Tag[];
  ratedIds?: Set<string>;
  urlPrefix: string;
};

type SortKey = "rating" | "rating-asc" | "votes" | "name";
type ViewKey = "grid" | "table";

const ALL_TAG_KEY = "__tea_browser_all__";
const STATUS_KEYS = ["all", "untried", "tried"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

const STATUS_LABELS: Record<StatusKey, string> = {
  all: "All",
  untried: "Untried",
  tried: "Tried",
};

const SORT_COMPARE: Record<SortKey, (a: TeaStat, b: TeaStat) => number> = {
  rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
  "rating-asc": (a, b) => (a.rating ?? Infinity) - (b.rating ?? Infinity),
  votes: (a, b) => b.votes - a.votes,
  name: (a, b) => a.name.localeCompare(b.name),
};

const sortTags = (tag?: string) => (a: Tag, b: Tag) => {
  if (a.name === tag) {
    return -1;
  } else if (b.name === tag) {
    return 1;
  } else {
    return a.name.localeCompare(b.name);
  }
};

export function TeaBrowser({
  onClick,
  teas,
  tags,
  ratedIds,
  urlPrefix,
}: Props) {
  const tagKeys = [ALL_TAG_KEY, ...tags.map(t => t.name).toSorted()];
  const teaOfTheDay = selectTeaOfTheDay(teas);

  const [view, setView] = useState<ViewKey>("grid");
  const [tag, setTag] = useState<string>(ALL_TAG_KEY);
  const [status, setStatus] = useState<StatusKey>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("rating");

  const filtered = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return teas
      .filter(tea => {
        if (tag !== ALL_TAG_KEY && !tea.tags.some(t => t.name === tag))
          return false;
        if (status === "untried" && ratedIds != null && ratedIds.has(tea.id))
          return false;
        if (status === "tried" && (ratedIds == null || !ratedIds.has(tea.id)))
          return false;
        if (lowerQuery !== "") {
          const matches =
            tea.name.toLowerCase().includes(lowerQuery) ||
            tea.tags.some(t => t.name.toLowerCase().includes(lowerQuery));
          if (!matches) return false;
        }
        return true;
      })
      .map(tea => {
        tea.tags.sort(tag === ALL_TAG_KEY ? sortTags() : sortTags(tag));
        return tea;
      })
      .sort(SORT_COMPARE[sort]);
  }, [teas, ratedIds, tag, status, query, sort]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {
      [ALL_TAG_KEY]: teas.length,
      ...Object.fromEntries(tags.map(tag => [tag.name, 0])),
    };
    teas.forEach(tea => {
      tags
        .map(t => t.name)
        .forEach(key => {
          if (tea.tags.some(t => t.name === key)) counts[key] += 1;
        });
    });
    return counts;
  }, [teas, tags]);

  const statusCounts = useMemo(() => {
    const triedCount = teas.filter(
      tea => ratedIds != null && ratedIds.has(tea.id)
    ).length;
    return {
      all: teas.length,
      untried: teas.length - triedCount,
      tried: triedCount,
    } satisfies Record<StatusKey, number>;
  }, [teas, ratedIds]);

  return (
    <>
      <Card padding={14} className={"mb-3"}>
        <div className="flex flex-wrap items-center gap-4">
          <SearchBar
            query={query}
            placeholder="Search teas…"
            onChange={value => setQuery(value)}
            onClear={() => setQuery("")}
          />

          <SelectFilter label="Sort" value={sort} onChange={setSort}>
            <option value="rating">Highest rated</option>
            <option value="rating-asc">Lowest rated</option>
            <option value="votes">Most votes</option>
            <option value="name">Name (A→Z)</option>
          </SelectFilter>

          <ViewPicker view={view} onChange={setView} />
        </div>

        <FilterRow label="Tag">
          {tagKeys.map(key => (
            <Chip
              key={key}
              active={tag === key}
              onClick={() => setTag(key)}
              count={tagCounts[key]}
            >
              {key === ALL_TAG_KEY ? "All" : capitalizeFirstLetter(key)}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="Status">
          {STATUS_KEYS.map(key => (
            <Chip
              key={key}
              active={status === key}
              onClick={() => setStatus(key)}
              count={statusCounts[key]}
            >
              {STATUS_LABELS[key]}
            </Chip>
          ))}
        </FilterRow>
      </Card>

      <div
        className="text-meta flex items-center justify-between"
        style={{ marginBottom: 12 }}
      >
        <div className="text-ink-muted">
          Showing <strong className="text-ink">{filtered.length}</strong> of{" "}
          {teas.length} teas
        </div>
        <div className="text-ink-muted">
          Click any tea for ratings & comments
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 40 }}>
          <div className="text-ink text-feature font-serif">
            {teas.length === 0
              ? "No teas available."
              : "No teas match those filters."}
          </div>
          <div className="text-ink-muted text-meta" style={{ marginTop: 6 }}>
            {teas.length === 0
              ? "Teas will appear here after being added."
              : "Try clearing the filters or widening your search."}
          </div>
        </Card>
      ) : view === "grid" ? (
        <div
          className="grid"
          style={{
            gap: 14,
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
          }}
        >
          {filtered.length == teas.length ? (
            <div className="md:col-span-3 md:row-span-2">
              <TeaOfTheDay
                key={teaOfTheDay.id}
                tea={teaOfTheDay}
                urlPrefix={urlPrefix}
                onClick={onClick}
              ></TeaOfTheDay>
            </div>
          ) : null}

          {filtered
            .filter(tea => {
              return filtered.length == teas.length
                ? tea.id != teaOfTheDay.id
                : filtered;
            })
            .map(tea => (
              <TeaCard
                key={tea.id}
                tea={tea}
                urlPrefix={urlPrefix}
                onClick={onClick}
              />
            ))}
        </div>
      ) : (
        <TeaTable teas={filtered} urlPrefix={urlPrefix} />
      )}
    </>
  );
}

function ViewPicker({
  view,
  onChange,
}: {
  view: ViewKey;
  onChange: (value: ViewKey) => void;
}) {
  return (
    <div
      className="border-ink/10 flex overflow-hidden border"
      style={{ borderRadius: 7 }}
    >
      {(["grid", "table"] satisfies ViewKey[]).map(v => {
        const active = view === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange && onChange(v)}
            className={`text-meta cursor-pointer px-3 py-2 font-medium ${
              active ? "bg-ink text-paper" : "bg-paper text-ink"
            } ${FOCUS_RING.paper}`}
            aria-pressed={active}
          >
            {v === "grid" ? "▦ Grid" : "☰ Table"}
          </button>
        );
      })}
    </div>
  );
}

function selectTeaOfTheDay(teas: TeaStat[]): TeaStat {
  const currentDate = new Date(Date.now());
  const teaOfTheDayIndex =
    (currentDate.getDate() +
      currentDate.getMonth() * currentDate.getFullYear()) %
    teas.length;
  return teas[teaOfTheDayIndex];
}
