import { useState } from "react";
import { api } from "../api.js";
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Icons,
  PageHeader,
  Panel,
  money,
  shortDate,
} from "../components/ui.jsx";

// ── helpers ──────────────────────────────────
function totalActivitiesCost(stop) {
  return (stop.activities || []).reduce(
    (sum, a) => sum + (a.custom_cost ?? a.cost ?? 0),
    0
  );
}

function totalExpenses(trip) {
  return (trip.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
}

function totalTransport(trip) {
  return (trip.stops || []).reduce(
    (sum, s) => sum + (s.transport_cost || 0),
    0
  );
}

// ── Activity Add Form ─────────────────────────
function AddActivityForm({ stop, activities, onAdded }) {
  const [form, setForm] = useState({
    activity_id: "",
    activity_date: stop.start_date || "",
    start_time: "09:00",
    custom_cost: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.addPlannedActivity(stop.id, {
        ...form,
        activity_id: parseInt(form.activity_id),
        custom_cost: form.custom_cost ? parseFloat(form.custom_cost) : null,
      });
      setForm({ activity_id: "", activity_date: stop.start_date || "", start_time: "09:00", custom_cost: "", notes: "" });
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="add-activity-form form-grid" onSubmit={submit}>
      <Field label="Activity">
        <select
          value={form.activity_id}
          onChange={(e) => setForm({ ...form, activity_id: e.target.value })}
          required
        >
          <option value="">Select activity…</option>
          {(activities || []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {money(a.cost)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input
          type="date"
          value={form.activity_date}
          min={stop.start_date}
          max={stop.end_date}
          onChange={(e) => setForm({ ...form, activity_date: e.target.value })}
          required
        />
      </Field>
      <Field label="Time">
        <input
          type="time"
          value={form.start_time}
          onChange={(e) => setForm({ ...form, start_time: e.target.value })}
        />
      </Field>
      <Field label="Custom cost ($)">
        <input
          type="number"
          placeholder="Leave blank to use default"
          value={form.custom_cost}
          onChange={(e) => setForm({ ...form, custom_cost: e.target.value })}
        />
      </Field>
      <div className="wide form-actions">
        <Button icon={Icons.Plus} disabled={saving}>
          {saving ? "Adding…" : "Add Activity"}
        </Button>
      </div>
    </form>
  );
}

// ── Day column view ──────────────────────────
function DayBlock({ label, activities, onRemove }) {
  return (
    <div className="day-block">
      <div className="day-block-header">
        <Icons.Calendar size={14} />
        <strong>{label}</strong>
      </div>
      {activities.length === 0 && (
        <p className="subtle day-empty">No activities yet.</p>
      )}
      {activities.map((act) => (
        <div className="day-activity-row" key={act.id}>
          <div className="day-activity-info">
            <span className="day-activity-time">{act.start_time}</span>
            <span className="day-activity-name">{act.name}</span>
          </div>
          <div className="day-activity-right">
            <span className="day-activity-cost">
              {money(act.custom_cost ?? act.cost)}
            </span>
            <IconButton
              icon={Icons.Trash2}
              label="Remove"
              variant="danger"
              onClick={() => onRemove(act.id)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Stop panel ────────────────────────────────
function StopPanel({ stop, allActivities, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false);

  async function removeActivity(plannedId) {
    await api.deletePlannedActivity(plannedId);
    onRefresh();
  }

  // Group activities by date
  const byDate = {};
  for (const act of stop.activities || []) {
    const d = act.activity_date || stop.start_date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(act);
  }

  const days = Object.keys(byDate).sort();
  const stopCost = totalActivitiesCost(stop) + (stop.transport_cost || 0);

  return (
    <div className="stop-panel">
      <div className="stop-panel-header">
        <div>
          <h3 className="stop-city">{stop.city_name}</h3>
          <p className="stop-dates">
            {shortDate(stop.start_date)} – {shortDate(stop.end_date)}
          </p>
        </div>
        <div className="stop-budget-badge">
          <Icons.Wallet size={14} />
          {money(stopCost)}
        </div>
      </div>

      {days.length > 0 ? (
        <div className="day-blocks-list">
          {days.map((d, i) => (
            <DayBlock
              key={d}
              label={`Day ${i + 1} — ${d}`}
              activities={byDate[d]}
              onRemove={removeActivity}
            />
          ))}
        </div>
      ) : (
        <div className="stop-no-activities">
          <p className="subtle">No activities planned for this stop.</p>
        </div>
      )}

      {showAdd ? (
        <AddActivityForm
          stop={stop}
          activities={allActivities}
          onAdded={() => { setShowAdd(false); onRefresh(); }}
        />
      ) : (
        <button
          className="btn btn-outline add-activity-btn"
          onClick={() => setShowAdd(true)}
        >
          <Icons.Plus size={14} /> Add activity
        </button>
      )}
    </div>
  );
}

// ── Budget Summary sidebar ────────────────────
function BudgetSummary({ trip }) {
  const actCost = (trip.stops || []).reduce(
    (sum, s) => sum + totalActivitiesCost(s),
    0
  );
  const transport = totalTransport(trip);
  const expenses = totalExpenses(trip);
  const total = actCost + transport + expenses;
  const limit = trip.budget_limit || 0;
  const remaining = limit - total;
  const pct = limit > 0 ? Math.min(100, (total / limit) * 100) : 0;

  return (
    <Panel title="Budget Summary">
      <div className="budget-summary">
        <div className="budget-row">
          <span>Activities</span>
          <strong>{money(actCost)}</strong>
        </div>
        <div className="budget-row">
          <span>Transport</span>
          <strong>{money(transport)}</strong>
        </div>
        <div className="budget-row">
          <span>Other expenses</span>
          <strong>{money(expenses)}</strong>
        </div>
        <hr />
        <div className="budget-row budget-total">
          <span>Total Spent</span>
          <strong>{money(total)}</strong>
        </div>
        {limit > 0 && (
          <>
            <div className="budget-row">
              <span>Budget Limit</span>
              <strong>{money(limit)}</strong>
            </div>
            <div className="budget-row" style={{ color: remaining < 0 ? "var(--color-danger)" : "var(--color-success)" }}>
              <span>Remaining</span>
              <strong>{money(remaining)}</strong>
            </div>
            <div className="budget-progress-track">
              <div
                className="budget-progress-fill"
                style={{
                  width: `${pct}%`,
                  background: pct > 90 ? "var(--color-danger)" : pct > 70 ? "var(--color-warn)" : "var(--color-success)",
                }}
              />
            </div>
            <p className="budget-pct-label">{pct.toFixed(0)}% of budget used</p>
          </>
        )}
      </div>
    </Panel>
  );
}

// ── Main Screen ───────────────────────────────
export function ItineraryViewScreen({ trip, allCityActivities, refreshTrip }) {
  const [search, setSearch] = useState("");

  if (!trip)
    return (
      <EmptyState title="Select a trip">
        Open a trip to view its full itinerary and budget breakdown.
      </EmptyState>
    );

  const stops = (trip.stops || []).filter((s) =>
    !search || s.city_name?.toLowerCase().includes(search.toLowerCase())
  );

  const cityActivities = (stopCityId) =>
    (allCityActivities || []).filter((a) => a.city_id === stopCityId);

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Itinerary View"
        title={`Itinerary for ${trip.name}`}
        subtitle="Day-by-day activities and expenses for each stop."
      />

      {/* Toolbar */}
      <div className="listing-toolbar">
        <input
          className="listing-search"
          placeholder="Search stops…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select>
          <option>Group by</option>
          <option>Day</option>
          <option>City</option>
        </select>
        <select>
          <option>Filter</option>
          <option>With activities</option>
          <option>Empty</option>
        </select>
        <select>
          <option>Sort by</option>
          <option>Date</option>
          <option>Cost</option>
        </select>
      </div>

      <div className="itinerary-view-layout">
        {/* Left: Stops/Days */}
        <div className="itinerary-stops-col">
          {stops.length === 0 ? (
            <p className="subtle">No stops match your search.</p>
          ) : (
            stops.map((stop) => (
              <StopPanel
                key={stop.id}
                stop={stop}
                allActivities={cityActivities(stop.city_id)}
                onRefresh={refreshTrip}
              />
            ))
          )}
        </div>

        {/* Right: Budget */}
        <div className="itinerary-budget-col">
          <BudgetSummary trip={trip} />
        </div>
      </div>
    </div>
  );
}
