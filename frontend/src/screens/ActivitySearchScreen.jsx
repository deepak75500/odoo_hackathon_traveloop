// screens/ActivitySearchScreen.jsx  –  Screen 8: Activity / City Search

import { useState, useMemo } from "react";
import { api } from "../api.js";
import {
  Button,
  EmptyState,
  Field,
  Icons,
  PageHeader,
  Panel,
  money,
} from "../components/ui.jsx";

// ── Result row ────────────────────────────────
function ResultRow({ item, type, onPlan, tripStop }) {
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState(false);

  async function plan() {
    if (!tripStop) return alert("Select a trip stop first.");
    setAdding(true);
    try {
      await api.addPlannedActivity(tripStop.id, {
        activity_id: item.id,
        activity_date: tripStop.start_date,
        start_time: "09:00",
      });
      setDone(true);
      onPlan && onPlan();
    } catch (err) {
      alert(err.message || "Could not add activity.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="search-result-row">
      {/* Thumbnail */}
      {item.image_url && (
        <div className="result-thumb">
          <img src={item.image_url} alt={item.name} />
        </div>
      )}

      {/* Info */}
      <div className="result-info">
        <strong className="result-name">{item.name || item.label}</strong>
        {type === "activity" ? (
          <div className="result-meta">
            <span className="result-category">{item.category}</span>
            <span>{money(item.cost)}</span>
            <span>
              <Icons.Clock size={12} /> {item.duration_hours}h
            </span>
            {item.city_name && (
              <span>
                <Icons.MapPin size={12} /> {item.city_name}
              </span>
            )}
          </div>
        ) : (
          <div className="result-meta">
            <span>{item.country}</span>
            <span>{item.region}</span>
            <span>Cost index: {item.cost_index}</span>
            <span>
              <Icons.Star size={12} /> Popularity: {item.popularity}
            </span>
          </div>
        )}
        {item.description && (
          <p className="result-desc">{item.description}</p>
        )}
      </div>

      {/* Action */}
      {type === "activity" && (
        <div className="result-action">
          {done ? (
            <span className="result-done">
              <Icons.Check size={14} /> Added
            </span>
          ) : (
            <button
              className="btn btn-outline btn-sm"
              onClick={plan}
              disabled={adding || !tripStop}
              title={!tripStop ? "Select a trip with stops first" : "Add to current stop"}
            >
              {adding ? (
                <Icons.Loader size={13} />
              ) : (
                <Icons.Plus size={13} />
              )}
              {adding ? "Adding…" : "Plan"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Screen ───────────────────────────────
export function ActivitySearchScreen({ cities, allActivities, trip, refreshTrip }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("activity"); // 'activity' | 'city'
  const [groupBy, setGroupBy] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [selectedStop, setSelectedStop] = useState(trip?.stops?.[0] || null);

  // Keep stop in sync if trip changes
  const stops = trip?.stops || [];

  // Build city name lookup for activities
  const cityNameById = useMemo(() => {
    const map = {};
    for (const c of cities || []) map[c.id] = c.name;
    return map;
  }, [cities]);

  const activitiesWithCity = useMemo(
    () =>
      (allActivities || []).map((a) => ({
        ...a,
        city_name: cityNameById[a.city_id] || "",
      })),
    [allActivities, cityNameById]
  );

  // All categories for filter dropdown
  const categories = useMemo(
    () => [...new Set(activitiesWithCity.map((a) => a.category))].sort(),
    [activitiesWithCity]
  );

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();

    if (mode === "activity") {
      return activitiesWithCity
        .filter((a) => {
          const matchQ =
            !q ||
            a.name.toLowerCase().includes(q) ||
            a.category.toLowerCase().includes(q) ||
            a.city_name.toLowerCase().includes(q);
          const matchCat = !filterCat || a.category === filterCat;
          return matchQ && matchCat;
        })
        .sort((a, b) => {
          if (sortBy === "cost") return a.cost - b.cost;
          if (sortBy === "duration") return a.duration_hours - b.duration_hours;
          return a.name.localeCompare(b.name);
        });
    }

    // city mode
    return (cities || [])
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.country.toLowerCase().includes(q) ||
          c.region.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (sortBy === "cost") return a.cost_index - b.cost_index;
        if (sortBy === "popularity") return b.popularity - a.popularity;
        return a.name.localeCompare(b.name);
      });
  }, [query, mode, filterCat, sortBy, activitiesWithCity, cities]);

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Activity / City Search"
        title="Explore activities & destinations"
        subtitle="Search, filter, and add activities directly to your trip stop."
      />

      {/* ── Toolbar ── */}
      <div className="listing-toolbar">
        <input
          className="listing-search"
          placeholder="Paragliding, Sightseeing, Tokyo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {/* Mode toggle */}
        <div className="toggle-group">
          <button
            className={`btn btn-sm ${mode === "activity" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setMode("activity")}
          >
            <Icons.WandSparkles size={13} /> Activities
          </button>
          <button
            className={`btn btn-sm ${mode === "city" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setMode("city")}
          >
            <Icons.MapPin size={13} /> Cities
          </button>
        </div>

        {mode === "activity" && (
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="">Filter: All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Sort: Name</option>
          {mode === "activity" && <option value="cost">Cost</option>}
          {mode === "activity" && <option value="duration">Duration</option>}
          {mode === "city" && <option value="popularity">Popularity</option>}
          {mode === "city" && <option value="cost">Cost Index</option>}
        </select>
      </div>

      {/* ── Trip stop selector (for planning) ── */}
      {mode === "activity" && stops.length > 0 && (
        <div className="search-stop-picker">
          <span>
            <Icons.Plane size={14} /> Add to stop:
          </span>
          <select
            value={selectedStop?.id || ""}
            onChange={(e) => {
              const s = stops.find((x) => x.id === Number(e.target.value));
              setSelectedStop(s || null);
            }}
          >
            {stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.city_name} ({s.start_date} – {s.end_date})
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "activity" && stops.length === 0 && trip && (
        <p className="subtle" style={{ padding: "0.5rem 1rem" }}>
          Your trip has no stops yet. Add stops in the Build Itinerary screen to plan activities.
        </p>
      )}

      {!trip && mode === "activity" && (
        <p className="subtle" style={{ padding: "0.5rem 1rem" }}>
          Select a trip from the sidebar to plan activities.
        </p>
      )}

      {/* ── Results ── */}
      <div className="search-results-list">
        <p className="results-count subtle">
          {results.length} result{results.length !== 1 ? "s" : ""}
          {query ? ` for "${query}"` : ""}
        </p>

        {results.length === 0 ? (
          <EmptyState title="No results found">
            Try a different keyword or clear your filters.
          </EmptyState>
        ) : (
          results.map((item) => (
            <ResultRow
              key={item.id}
              item={item}
              type={mode}
              tripStop={selectedStop}
              onPlan={refreshTrip}
            />
          ))
        )}
      </div>
    </div>
  );
}
