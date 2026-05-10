import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Icons,
  ImageBlock,
  PageHeader,
  Panel,
  TripSelect,
  money,
  shortDate,
} from "../components/ui.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// BuilderScreen — Screen 5: Build Itinerary
// ─────────────────────────────────────────────────────────────────────────────

export function BuilderScreen({
  trip,
  trips,
  selectedTripId,
  setSelectedTripId,
  setScreen,
  cities,
  refreshTrip,
}) {
  const emptyForm = {
    city_id: "",
    start_date: "",
    end_date: "",
    transport_cost: "",
    budget: "",
    notes: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Pre-fill dates when trip loads or changes
  useEffect(() => {
    if (trip) {
      setForm((cur) => ({
        ...cur,
        start_date: cur.start_date || trip.start_date || "",
        end_date: cur.end_date || trip.start_date || "",
      }));
    }
  }, [trip?.id]);

  // ── No trip selected ──────────────────────────────────────────────────────
  if (!trip) {
    return (
      <EmptyState
        title="Select a trip"
        action={
          <TripSelect
            trips={trips}
            selectedTripId={selectedTripId}
            onChange={setSelectedTripId}
          />
        }
      >
        Choose an itinerary before adding stops.
      </EmptyState>
    );
  }

  // ── Add Stop ──────────────────────────────────────────────────────────────
  async function handleAddStop(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.city_id) {
      setError("Please select a city.");
      return;
    }
    if (!form.start_date) {
      setError("Please set a start date.");
      return;
    }
    if (!form.end_date) {
      setError("Please set an end date.");
      return;
    }
    if (form.end_date < form.start_date) {
      setError("End date must be on or after start date.");
      return;
    }

    setSaving(true);
    try {
      await api.addStop(trip.id, {
        city_id: Number(form.city_id),
        start_date: form.start_date,
        end_date: form.end_date,
        transport_cost: Number(form.transport_cost) || 0,
        notes: form.notes || "",
        sort_order: (trip.stops?.length || 0) + 1,
      });

      // Reset form, keep end_date as next start_date for convenience
      setForm({
        city_id: "",
        start_date: form.end_date || trip.start_date || "",
        end_date: form.end_date || trip.start_date || "",
        transport_cost: "",
        budget: "",
        notes: "",
      });

      setSuccess("Stop added successfully!");
      setTimeout(() => setSuccess(""), 2500);
      await refreshTrip();
    } catch (err) {
      console.error("addStop error:", err);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to add stop. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Move stop order ───────────────────────────────────────────────────────
  async function move(stop, direction) {
    try {
      await api.updateStop(stop.id, {
        city_id: stop.city_id,
        start_date: stop.start_date,
        end_date: stop.end_date,
        transport_cost: Number(stop.transport_cost) || 0,
        notes: stop.notes || "",
        sort_order: Math.max(1, (stop.sort_order || 1) + direction),
      });
      await refreshTrip();
    } catch (err) {
      console.error("move error:", err);
      setError("Failed to reorder stop.");
    }
  }

  // ── Remove stop ───────────────────────────────────────────────────────────
  async function remove(stopId) {
    if (!window.confirm("Remove this stop from the itinerary?")) return;
    try {
      await api.deleteStop(stopId);
      await refreshTrip();
    } catch (err) {
      console.error("deleteStop error:", err);
      setError("Failed to remove stop.");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Build Itinerary"
        title={trip.name}
        subtitle="Add cities, assign dates, estimate transport, and reorder the trip flow."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <TripSelect
              trips={trips}
              selectedTripId={selectedTripId}
              onChange={setSelectedTripId}
            />
            <Button
              icon={Icons.CalendarDays}
              variant="ghost"
              onClick={() => setScreen?.("itinerary")}
            >
              View Itinerary
            </Button>
          </div>
        }
      />

      {/* ── Add Stop Form ── */}
      <Panel title="Add another section">
        {error && (
          <div
            style={{
              background: "#fff0f0",
              border: "1px solid #fcc",
              color: "#c0392b",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              background: "#f0fff4",
              border: "1px solid #9ae6b4",
              color: "#276749",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {success}
          </div>
        )}

        <form className="stop-form" onSubmit={handleAddStop}>
          <Field label="City">
            <select
              value={form.city_id}
              onChange={(e) =>
                setForm({ ...form, city_id: e.target.value })
              }
              required
            >
              <option value="">Select city</option>
              {(cities || []).map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}, {city.country}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notes">
            <input
              type="text"
              value={form.notes}
              onChange={(e) =>
                setForm({ ...form, notes: e.target.value })
              }
              placeholder="Hotel name, flight info, activity…"
            />
          </Field>

          <Field label="Start Date">
            <input
              type="date"
              value={form.start_date}
              onChange={(e) =>
                setForm({ ...form, start_date: e.target.value })
              }
              required
            />
          </Field>

          <Field label="End Date">
            <input
              type="date"
              value={form.end_date}
              min={form.start_date}
              onChange={(e) =>
                setForm({ ...form, end_date: e.target.value })
              }
              required
            />
          </Field>

          <Field label="Transport Cost ($)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.transport_cost}
              onChange={(e) =>
                setForm({ ...form, transport_cost: e.target.value })
              }
              placeholder="0"
            />
          </Field>

          <Field label="Budget of this section ($)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.budget}
              onChange={(e) =>
                setForm({ ...form, budget: e.target.value })
              }
              placeholder="0"
            />
          </Field>

          <Button icon={Icons.Plus} type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add Stop"}
          </Button>
        </form>
      </Panel>

      {/* ── Stop list ── */}
      <div className="stop-list">
        {trip.stops?.length ? (
          trip.stops.map((stop, index) => (
            <article className="stop-card" key={stop.id}>
              <ImageBlock src={stop.city_image} label={stop.city_name} />

              <div className="stop-body">
                <div className="stop-title">
                  <span>{index + 1}</span>
                  <h2>{stop.city_name}</h2>
                </div>

                <p>
                  {stop.country}&nbsp;|&nbsp;
                  {shortDate(stop.start_date)} – {shortDate(stop.end_date)}
                </p>

                <p>{stop.notes || stop.city_description}</p>

                {/* Budget + transport chips */}
                {(Number(stop.budget) > 0 ||
                  Number(stop.transport_cost) > 0) && (
                  <div className="chips">
                    {Number(stop.budget) > 0 && (
                      <span>💰 Budget: {money(stop.budget)}</span>
                    )}
                    {Number(stop.transport_cost) > 0 && (
                      <span>🚌 Transport: {money(stop.transport_cost)}</span>
                    )}
                  </div>
                )}

                {/* Activity chips */}
                {stop.activities?.length > 0 && (
                  <div className="chips">
                    {stop.activities.map((item) => (
                      <span key={item.id}>
                        {item.start_time} {item.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="vertical-actions">
                <IconButton
                  icon={Icons.CalendarDays}
                  label="Move earlier"
                  onClick={() => move(stop, -1)}
                />
                <IconButton
                  icon={Icons.Map}
                  label="Move later"
                  onClick={() => move(stop, 1)}
                />
                <IconButton
                  icon={Icons.Trash2}
                  label="Remove stop"
                  variant="danger"
                  onClick={() => remove(stop.id)}
                />
              </div>
            </article>
          ))
        ) : (
          <EmptyState title="No sections yet">
            Add a city stop above to begin building your itinerary.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ItineraryViewScreen — Screen 9: Itinerary with budget section

// ─────────────────────────────────────────────────────────────────────────────
// ItineraryViewScreen — Screen 9
// Layout: Day-pill left rail  |  Physical Activity card + Expense card
// ─────────────────────────────────────────────────────────────────────────────

function money1(value) {
  const n = Number(value) || 0;
  return "$" + n.toFixed(2);
}
 
function shortDate1(str) {
  if (!str) return "—";
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(startStr, endStr) {
  if (!startStr) return [];
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr || startStr}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [startStr];
  }

  const dates = [];
  const cur = new Date(start);
  const last = end >= start ? end : start;
  while (cur <= last && dates.length < 370) {
    dates.push(toDateInputValue(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
 

const es = {
  wrap:   { textAlign: "center", padding: "60px 24px", color: "#aaa" },
  icon:   { fontSize: 36, marginBottom: 12 },
  title:  { fontSize: 16, fontWeight: 700, color: "#555", marginBottom: 6 },
  sub:    { fontSize: 13, lineHeight: 1.5, marginBottom: 16 },
  action: { display: "flex", justifyContent: "center" },
};
 
function TripSelect1({ trips = [], selectedTripId, onChange }) {
  return (
    <select
      value={selectedTripId || ""}
      onChange={(e) => {
        const value = e.target.value;
        onChange(value ? Number(value) : null);
      }}
      style={ts.select}
    >
      <option value="" disabled>Select trip...</option>
      {trips.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
const ts = {
  select: {
    border: "1px solid #ddd",
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: 13,
    background: "#fff",
    color: "#333",
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
 
// ─────────────────────────────────────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────────────────────────────────────
 
const DAY_RAIL_W = 76;   // px — fixed left rail
const EXP_W      = 100;  // px — fixed expense card width
 
// ─────────────────────────────────────────────────────────────────────────────
// ItineraryViewScreen — Screen 9
// ─────────────────────────────────────────────────────────────────────────────
 
export function ItineraryViewScreen({
  trip,
  trips,
  selectedTripId,
  setSelectedTripId,
  refreshTrip,
}) {
  const [search,      setSearch]      = useState("");
  const [groupBy,     setGroupBy]     = useState("day");   // "day" | "stop"
  const [viewMode,    setViewMode]    = useState("list");  // "list" | "calendar"
  const [filterCat,   setFilterCat]   = useState("");
  const [sortBy,      setSortBy]      = useState("time");  // "time" | "cost_asc" | "cost_desc"
  const [showFilters, setShowFilters] = useState(false);
  const [removing,    setRemoving]    = useState(null);    // activity id being deleted
  const [removeErr,   setRemoveErr]   = useState("");
 
  // ── Build flat activity list grouped by date ──────────────────────────────
  const allDays = useMemo(() => {
    const map = {};

    function pushItem(key, date, stop, item) {
      if (!map[key]) {
        map[key] = { date, city: stop.city_name, stop, items: [] };
      } else if (map[key].city !== stop.city_name) {
        map[key].city = "Multiple cities";
      }
      map[key].items.push(item);
    }

    (trip?.stops || []).forEach((stop) => {
      const activities = stop.activities || [];
      const dates = new Set(daysBetween(stop.start_date, stop.end_date));
      activities.forEach((activity) => {
        dates.add(activity.activity_date || stop.start_date);
      });

      [...dates].sort().forEach((date) => {
        const key = groupBy === "stop" ? `stop-${stop.id}` : date;
        const dayActivities = activities.filter(
          (activity) => (activity.activity_date || stop.start_date) === date
        );

        if (dayActivities.length) {
          dayActivities.forEach((activity) => {
            pushItem(key, date, stop, {
              ...activity,
              _stop: stop,
              _dateLabel: shortDate1(date),
            });
          });
          return;
        }

        pushItem(key, date, stop, {
          id: `stop-${stop.id}-${date}`,
          _type: "stop",
          name: stop.city_name,
          category: "city stop",
          description:
            stop.notes ||
            `${shortDate1(date)} in ${stop.city_name}, ${stop.country}`,
          activity_date: date,
          start_time: "",
          custom_cost: date === stop.start_date ? Number(stop.transport_cost) || 0 : 0,
          cost: 0,
          _stop: stop,
          _dateLabel: shortDate1(date),
        });
      });
    });

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [trip, groupBy]);
 
  // ── Unique categories ─────────────────────────────────────────────────────
  const allCategories = useMemo(() => {
    const cats = new Set();
    (trip?.stops || []).forEach((stop) => {
      cats.add("city stop");
      (stop.activities || []).forEach((a) => a.category && cats.add(a.category));
    });
    return [...cats].sort();
  }, [trip]);
 
  // ── Search + filter + sort ────────────────────────────────────────────────
  const filteredDays = useMemo(() => {
    const days = allDays
      .map((day) => {
        let items = day.items;
 
        if (search.trim()) {
          const q = search.toLowerCase();
          items = items.filter(
            (a) =>
              a.name?.toLowerCase().includes(q) ||
              a.category?.toLowerCase().includes(q) ||
              a.description?.toLowerCase().includes(q) ||
              a._stop?.city_name?.toLowerCase().includes(q)
          );
        }
 
        if (filterCat) {
          items = items.filter((a) => a.category === filterCat);
        }
 
        if (sortBy === "cost_asc") {
          items = [...items].sort(
            (a, b) =>
              (Number(a.custom_cost ?? a.cost) || 0) -
              (Number(b.custom_cost ?? b.cost) || 0)
          );
        } else if (sortBy === "cost_desc") {
          items = [...items].sort(
            (a, b) =>
              (Number(b.custom_cost ?? b.cost) || 0) -
              (Number(a.custom_cost ?? a.cost) || 0)
          );
        } else {
          items = [...items].sort((a, b) =>
            (a.start_time || "").localeCompare(b.start_time || "")
          );
        }
 
        return { ...day, items };
      })
      .filter((day) => day.items.length > 0);

    if (sortBy === "cost_asc") {
      return [...days].sort(
        (a, b) =>
          dayTotal(a.items) - dayTotal(b.items) ||
          a.date.localeCompare(b.date)
      );
    }

    if (sortBy === "cost_desc") {
      return [...days].sort(
        (a, b) =>
          dayTotal(b.items) - dayTotal(a.items) ||
          a.date.localeCompare(b.date)
      );
    }

    return [...days].sort((a, b) => a.date.localeCompare(b.date));
  }, [allDays, search, filterCat, sortBy]);
 
  // ── Helpers ───────────────────────────────────────────────────────────────
  function dayNumber(dateStr) {
    if (!trip?.start_date || !dateStr) return "—";
    const start = new Date(trip.start_date + "T00:00:00");
    const cur   = new Date(dateStr   + "T00:00:00");
    const diff  = Math.round((cur - start) / 86400000) + 1;
    return diff > 0 ? diff : "—";
  }
 
  function dayTotal(items) {
    return items.reduce(
      (sum, a) => sum + (Number(a.custom_cost ?? a.cost) || 0),
      0
    );
  }
 
  // ── Remove activity — calls api.deleteActivity from api.js ───────────────
  //    api.js:  deleteActivity: (id) => request(`/planned/${id}`, { method: "DELETE" })
  //    app.py:  DELETE /api/planned/{planned_id}  ✓
  async function removeActivity(id) {
    if (!window.confirm("Remove this activity from the itinerary?")) return;
    setRemoving(id);
    setRemoveErr("");
    try {
      await api.deleteActivity(id);   // ← uses api.js correctly
      await refreshTrip();
    } catch (err) {
      console.error("removeActivity error:", err);
      setRemoveErr(err.message || "Failed to remove activity.");
      setTimeout(() => setRemoveErr(""), 3000);
    } finally {
      setRemoving(null);
    }
  }
 
  // ── No trip selected ──────────────────────────────────────────────────────
  if (!trip) {
    return (
      <EmptyState
        title="Select a trip"
        action={
          <TripSelect1
            trips={trips}
            selectedTripId={selectedTripId}
            onChange={setSelectedTripId}
          />
        }
      >
        The itinerary timeline appears after a trip is selected.
      </EmptyState>
    );
  }
 
  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={iv.root}>
 
      {/* ══ TOP BAR ══════════════════════════════════════════════════════════ */}
      <div style={iv.topBar}>
        <span style={iv.appName}>Traveloop</span>
        <div style={iv.avatar} />
      </div>
 
      {/* ══ TOOLBAR ══════════════════════════════════════════════════════════ */}
      <div style={iv.toolbar}>
 
        {/* Search */}
        <div style={iv.searchWrap}>
          <Icons.Search size={14} style={iv.searchIcon} />
          <input
            style={iv.searchInput}
            placeholder="Search itinerary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button style={iv.clearSearch} onClick={() => setSearch("")}>x</button>
          )}
        </div>
 
        {/* Group by */}
        <button
          style={{ ...iv.toolBtn, ...(groupBy !== "day" ? iv.toolBtnActive : {}) }}
          onClick={() => setGroupBy(groupBy === "day" ? "stop" : "day")}
        >
          {groupBy === "day" ? "Group by city" : "Group by day"}
        </button>

        <div style={iv.modeToggle}>
          <button
            style={{
              ...iv.modeBtn,
              ...(viewMode === "list" ? iv.modeBtnActive : {}),
            }}
            onClick={() => setViewMode("list")}
          >
            List
          </button>
          <button
            style={{
              ...iv.modeBtn,
              ...(viewMode === "calendar" ? iv.modeBtnActive : {}),
            }}
            onClick={() => setViewMode("calendar")}
          >
            Calendar
          </button>
        </div>
 
        {/* Filter */}
        <button
          style={{ ...iv.toolBtn, ...(filterCat ? iv.toolBtnActive : {}) }}
          onClick={() => setShowFilters((v) => !v)}
        >
          Filter
        </button>
 
        {/* Sort */}
        <button
          style={{ ...iv.toolBtn, ...(sortBy !== "time" ? iv.toolBtnActive : {}) }}
          onClick={() =>
            setSortBy((s) =>
              s === "time" ? "cost_asc" : s === "cost_asc" ? "cost_desc" : "time"
            )
          }
        >
          {sortBy === "time"
            ? "Sort by..."
            : sortBy === "cost_asc"
            ? "Sort low $"
            : "Sort high $"}
        </button>
      </div>
 
      {/* ══ FILTER DROPDOWN ══════════════════════════════════════════════════ */}
      {showFilters && (
        <div style={iv.filterRow}>
          <span style={iv.filterLabel}>Category:</span>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            style={iv.filterSelect}
          >
            <option value="">All</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {filterCat && (
            <button style={iv.clearBtn} onClick={() => setFilterCat("")}>
              Clear x
            </button>
          )}
        </div>
      )}
 
      {/* ══ ERROR TOAST ══════════════════════════════════════════════════════ */}
      {removeErr && <div style={iv.errorToast}>{removeErr}</div>}
 
      {/* ══ TRIP HEADER ══════════════════════════════════════════════════════ */}
      <div style={iv.tripHeader}>
        <h1 style={iv.tripTitle}>Itinerary for {trip.name}</h1>
        <div style={iv.tripSub}>
          <span>{shortDate1(trip.start_date)} - {shortDate1(trip.end_date)}</span>
          <span style={iv.tripSubDot}>/</span>
          <TripSelect1
            trips={trips}
            selectedTripId={selectedTripId}
            onChange={setSelectedTripId}
          />
        </div>
      </div>
 
      {/* ══ COLUMN HEADERS ═══════════════════════════════════════════════════ */}
      {viewMode === "list" ? (
        <>
      <div style={iv.colHeaderRow}>
        <div style={iv.dayRailSpacer} />   {/* exact width = DAY_RAIL_W */}
        <div style={iv.colHeaderInner}>
          <span style={{ ...iv.colHeading, flex: 1 }}>Physical Activity</span>
          <span style={{ ...iv.colHeading, width: EXP_W }}>Expense</span>
        </div>
      </div>
 
      {/* ══ BODY ═════════════════════════════════════════════════════════════ */}
      <div style={iv.body}>
        {filteredDays.length ? (
          filteredDays.map((day, di) => (
            <div key={day.date} style={iv.dayGroup}>
 
              {/* Two-column: left rail + right activity list */}
              <div style={iv.dayRow}>
 
                {/* ── LEFT RAIL */}
                <div style={iv.dayRail}>
                  <div style={iv.dayPill}>Day {dayNumber(day.date)}</div>
                  <div style={iv.dayRailMeta}>{shortDate1(day.date)}</div>
                  <div style={iv.dayRailMeta}>{day.city}</div>
                  <div style={iv.dayTotalBadge}>{money1(dayTotal(day.items))}</div>
                </div>
 
                {/* ── RIGHT COL */}
                <div style={iv.activityCol}>
                  {day.items.map((activity, ai) => (
                    <div key={activity.id}>
 
                      {/* Activity + expense row */}
                      <div style={iv.actRow}>
 
                        {/* Physical Activity card */}
                        <div style={iv.actCard}>
                          <div style={iv.actName}>{activity.name}</div>
                          <div style={iv.actMeta}>
                            {activity.start_time && (
                              <span style={iv.actTime}>{activity.start_time}</span>
                            )}
                            {groupBy === "stop" && activity._dateLabel && (
                              <span style={iv.actTime}>{activity._dateLabel}</span>
                            )}
                            {activity.category && (
                              <span style={iv.actCat}>{activity.category}</span>
                            )}
                            {Number(activity.duration_hours) > 0 && (
                              <span style={iv.actDur}>{activity.duration_hours}h</span>
                            )}
                          </div>
                          {activity.description && (
                            <div style={iv.actDesc}>{activity.description}</div>
                          )}
                        </div>
 
                        {/* Expense card */}
                        <div style={iv.expCard}>
                          <div style={iv.expAmount}>
                            {money1(activity.custom_cost ?? activity.cost)}
                          </div>
                          {activity.custom_cost != null &&
                            activity.custom_cost !== activity.cost && (
                              <div style={iv.expOriginal}>
                                orig {money1(activity.cost)}
                              </div>
                            )}
                          {activity._type !== "stop" && (
                          <button
                            style={{
                              ...iv.removeBtn,
                              opacity: removing === activity.id ? 0.4 : 1,
                            }}
                            title="Remove activity"
                            disabled={removing === activity.id}
                            onClick={() => removeActivity(activity.id)}
                          >
                            {removing === activity.id ? "…" : "✕"}
                          </button>
                          )}
                        </div>
                      </div>
 
                      {/* Down-arrow between rows (not after last) */}
                      {ai < day.items.length - 1 && (
                        <div style={iv.arrowWrap}>
                          <div style={iv.arrowLine} />
                          <div style={iv.arrowHead}>▼</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
 
              {/* Day separator (not after last day) */}
              {di < filteredDays.length - 1 && <div style={iv.daySep} />}
            </div>
          ))
        ) : (
          <div style={iv.empty}>
            {allDays.length === 0
              ? "No activities planned yet.\nAdd activities to stops in the Build Itinerary screen."
              : "No activities match your search or filter."}
          </div>
        )}
      </div>
        </>
      ) : (
        <div style={iv.calendarGrid}>
          {filteredDays.length ? (
            filteredDays.map((day) => (
              <article key={day.date} style={iv.calendarDay}>
                <div style={iv.calendarDayHead}>
                  <strong>Day {dayNumber(day.date)}</strong>
                  <span>{shortDate1(day.date)}</span>
                </div>
                <div style={iv.calendarCity}>{day.city}</div>
                {day.items.map((activity) => (
                  <div key={activity.id} style={iv.calendarItem}>
                    <span>{activity.start_time || activity._dateLabel}</span>
                    <strong>{activity.name}</strong>
                    <em>{money1(activity.custom_cost ?? activity.cost)}</em>
                  </div>
                ))}
              </article>
            ))
          ) : (
            <div style={iv.empty}>
              {allDays.length === 0
                ? "No itinerary sections yet. Add city stops in the Build Itinerary screen."
                : "No activities match your search or filter."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
 
const iv = {
  root: {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    background:
      "linear-gradient(180deg, #f6fbf9 0%, #f3f6f4 42%, #eef3f1 100%)",
    minHeight: "100vh",
    color: "#18231f",
    paddingBottom: 24,
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 24px",
    background: "rgba(255,255,255,0.86)",
    borderBottom: "1px solid rgba(20,68,54,0.1)",
    boxShadow: "0 1px 16px rgba(24,45,38,0.04)",
    position: "sticky",
    top: 0,
    zIndex: 3,
    backdropFilter: "blur(12px)",
  },
  appName: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f6b55",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "2px solid #fff",
    background: "linear-gradient(135deg, #0f6b55, #f1a661)",
    boxShadow: "0 4px 14px rgba(15,107,85,0.24)",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "14px 18px",
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(20,68,54,0.1)",
    borderRadius: 8,
    boxShadow: "0 12px 32px rgba(28,48,42,0.08)",
    maxWidth: 980,
    margin: "18px auto 0",
    width: "calc(100% - 32px)",
    boxSizing: "border-box",
    flexWrap: "wrap",
  },
  searchWrap: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    border: "1px solid #d5e1dc",
    borderRadius: 6,
    padding: "8px 11px",
    background: "#fff",
    gap: 8,
    minWidth: 220,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
  },
  searchIcon: { color: "#6f817a", flexShrink: 0 },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 13,
    color: "#24352f",
    fontFamily: "inherit",
  },
  clearSearch: {
    border: "none",
    background: "none",
    color: "#74847e",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    padding: 0,
    lineHeight: 1,
    flexShrink: 0,
  },
  toolBtn: {
    border: "1px solid #d5e1dc",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    background: "#fff",
    color: "#365048",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    boxShadow: "0 1px 2px rgba(28,48,42,0.04)",
  },
  toolBtnActive: {
    background: "#0f6b55",
    color: "#fff",
    borderColor: "#0f6b55",
  },
  modeToggle: {
    display: "flex",
    alignItems: "center",
    border: "1px solid #d5e1dc",
    borderRadius: 6,
    overflow: "hidden",
    background: "#fff",
    flexShrink: 0,
    boxShadow: "0 1px 2px rgba(28,48,42,0.04)",
  },
  modeBtn: {
    border: "none",
    borderRight: "1px solid #e3ece8",
    padding: "8px 11px",
    fontSize: 12,
    fontWeight: 700,
    background: "#fff",
    color: "#365048",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  modeBtnActive: {
    background: "#19342d",
    color: "#fff",
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 18px",
    background: "#fff",
    border: "1px solid #dfe9e5",
    borderRadius: 8,
    maxWidth: 980,
    margin: "10px auto 0",
    width: "calc(100% - 32px)",
    boxSizing: "border-box",
    fontSize: 13,
  },
  filterLabel: { color: "#365048", fontWeight: 700 },
  filterSelect: {
    border: "1px solid #d5e1dc",
    borderRadius: 5,
    padding: "6px 9px",
    fontSize: 13,
    background: "#fff",
    fontFamily: "inherit",
    cursor: "pointer",
  },
  clearBtn: {
    border: "none",
    background: "none",
    color: "#b75f36",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    padding: 0,
    fontFamily: "inherit",
  },
  errorToast: {
    background: "#fff4f0",
    border: "1px solid #f4cbbd",
    color: "#9c3f24",
    fontSize: 13,
    padding: "10px 16px",
    textAlign: "center",
    maxWidth: 980,
    margin: "10px auto 0",
    borderRadius: 8,
  },
  tripHeader: {
    padding: "30px 18px 18px",
    textAlign: "center",
    maxWidth: 980,
    margin: "0 auto",
  },
  tripTitle: {
    fontSize: 28,
    fontWeight: 800,
    margin: "0 0 8px",
    color: "#172820",
  },
  tripSub: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 13,
    color: "#64766f",
    flexWrap: "wrap",
  },
  tripSubDot: { color: "#b5c4be" },
  colHeaderRow: {
    display: "flex",
    gap: 12,
    padding: "0 20px 8px",
    maxWidth: 860,
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  },
  dayRailSpacer: {
    width: DAY_RAIL_W,
    flexShrink: 0,
  },
  colHeaderInner: {
    flex: 1,
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  colHeading: {
    fontSize: 11,
    fontWeight: 800,
    color: "#6b7e77",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  body: {
    maxWidth: 860,
    margin: "0 auto",
    padding: "0 20px 60px",
    width: "100%",
    boxSizing: "border-box",
  },
  dayGroup: { marginBottom: 10 },
  dayRow: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    marginTop: 16,
  },
  dayRail: {
    width: DAY_RAIL_W,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    paddingTop: 0,
  },
  dayPill: {
    border: "1px solid #0f6b55",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 800,
    color: "#fff",
    background: "#0f6b55",
    whiteSpace: "nowrap",
    textAlign: "center",
    boxShadow: "0 6px 16px rgba(15,107,85,0.2)",
  },
  dayRailMeta: {
    fontSize: 11,
    color: "#71827b",
    textAlign: "center",
    lineHeight: 1.3,
    maxWidth: DAY_RAIL_W,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  dayTotalBadge: {
    fontSize: 11,
    fontWeight: 800,
    color: "#7c4c1b",
    background: "#fff3df",
    border: "1px solid #f2d3aa",
    borderRadius: 999,
    padding: "3px 8px",
    marginTop: 3,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  activityCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  actRow: {
    display: "flex",
    gap: 14,
    alignItems: "stretch",
  },
  actCard: {
    flex: 1,
    background: "#fff",
    border: "1px solid #dde9e4",
    borderRadius: 8,
    padding: "13px 16px",
    boxShadow: "0 10px 24px rgba(32,55,47,0.08)",
    minHeight: 64,
    minWidth: 0,
    borderLeft: "4px solid #0f6b55",
  },
  actName: {
    fontSize: 15,
    fontWeight: 800,
    color: "#172820",
    marginBottom: 7,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  actMeta: {
    display: "flex",
    gap: 7,
    flexWrap: "wrap",
    alignItems: "center",
  },
  actTime: {
    fontSize: 11,
    fontWeight: 700,
    color: "#315a4e",
    background: "#edf7f3",
    border: "1px solid #d5e9e1",
    borderRadius: 999,
    padding: "2px 7px",
  },
  actCat: {
    fontSize: 11,
    fontWeight: 700,
    color: "#7b5128",
    background: "#fff3df",
    border: "1px solid #f2d3aa",
    borderRadius: 999,
    padding: "2px 8px",
    textTransform: "capitalize",
  },
  actDur: { fontSize: 11, color: "#75847e", fontWeight: 700 },
  actDesc: {
    fontSize: 12,
    color: "#63746d",
    marginTop: 8,
    lineHeight: 1.5,
  },
  expCard: {
    width: EXP_W,
    flexShrink: 0,
    background: "#fff",
    border: "1px solid #f0d8b7",
    borderRadius: 8,
    padding: "12px 9px",
    boxShadow: "0 10px 24px rgba(107,77,38,0.08)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    position: "relative",
  },
  expAmount: {
    fontSize: 15,
    fontWeight: 800,
    color: "#7c4c1b",
    textAlign: "center",
  },
  expOriginal: {
    fontSize: 10,
    color: "#a99178",
    textDecoration: "line-through",
    textAlign: "center",
  },
  removeBtn: {
    position: "absolute",
    top: 5,
    right: 6,
    background: "#fff4f0",
    border: "1px solid #f4cbbd",
    borderRadius: 999,
    fontSize: 10,
    color: "#a14a2c",
    cursor: "pointer",
    padding: "1px 5px",
    lineHeight: 1,
    transition: "color 0.15s",
  },
  arrowWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    margin: "4px 0",
    paddingRight: EXP_W + 12,   // nudge arrow under actCard only
  },
  arrowLine: { width: 2, height: 12, background: "#c7d7d1", borderRadius: 2 },
  arrowHead: { fontSize: 10, color: "#8aa49a", lineHeight: 1, marginTop: -1 },
  daySep: {
    height: 1,
    background: "linear-gradient(90deg, transparent, #dce8e3, transparent)",
    margin: "22px 0 4px",
  },
  calendarGrid: {
    maxWidth: 980,
    margin: "0 auto",
    padding: "8px 18px 60px",
    width: "100%",
    boxSizing: "border-box",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
  },
  calendarDay: {
    background: "#fff",
    border: "1px solid #dde9e4",
    borderRadius: 8,
    padding: 14,
    minHeight: 165,
    boxShadow: "0 12px 28px rgba(32,55,47,0.08)",
    borderTop: "4px solid #0f6b55",
  },
  calendarDayHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    fontSize: 12,
    color: "#365048",
    fontWeight: 800,
  },
  calendarCity: {
    fontSize: 15,
    fontWeight: 800,
    color: "#172820",
    margin: "10px 0",
  },
  calendarItem: {
    display: "grid",
    gridTemplateColumns: "52px 1fr auto",
    gap: 8,
    alignItems: "center",
    borderTop: "1px solid #edf3f0",
    padding: "9px 0",
    fontSize: 12,
    color: "#53665f",
  },
  empty: {
    textAlign: "center",
    color: "#7b8b85",
    fontSize: 14,
    fontStyle: "italic",
    padding: "52px 24px",
    lineHeight: 1.8,
    whiteSpace: "pre-line",
  },
};
