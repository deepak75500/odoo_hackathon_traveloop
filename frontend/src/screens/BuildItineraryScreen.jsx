import { useState } from "react";
import { api } from "../api.js";
import { Button, EmptyState, Field, IconButton, Icons, PageHeader, Panel } from "../components/ui.jsx";

export function BuildItineraryScreen({ trip, cities, refreshTrip }) {
  const [sections, setSections] = useState(
    trip?.stops?.map((stop) => ({
      id: stop.id,
      city_name: stop.city_name,
      start_date: stop.start_date,
      end_date: stop.end_date,
      budget: stop.transport_cost || 0,
      notes: stop.notes || "",
      activities: stop.activities || [],
    })) || []
  );
  const [addingSection, setAddingSection] = useState(false);
  const [newSection, setNewSection] = useState({
    city_id: "",
    start_date: "",
    end_date: "",
    transport_cost: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (!trip) return <EmptyState title="Select a trip">Choose a trip to build its itinerary sections.</EmptyState>;

  async function addSection(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.addStop(trip.id, {
        city_id: parseInt(newSection.city_id),
        start_date: newSection.start_date,
        end_date: newSection.end_date,
        transport_cost: parseFloat(newSection.transport_cost) || 0,
        notes: newSection.notes,
        sort_order: sections.length + 1,
      });
      setNewSection({ city_id: "", start_date: "", end_date: "", transport_cost: "", notes: "" });
      setAddingSection(false);
      setMessage("Section added.");
      refreshTrip();
    } catch (err) {
      setMessage(err.message || "Failed to add section.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSection(stopId) {
    if (!confirm("Remove this section?")) return;
    await api.deleteStop(stopId);
    refreshTrip();
  }

  const dateRange = (start, end) => {
    if (!start || !end) return "No dates set";
    return `${start} to ${end}`;
  };

  const budgetLabel = (budget) => (budget ? `$${budget}` : "$0");

  return (
    <div className="screen-stack narrow">
      <PageHeader
        eyebrow="Build Itinerary"
        title={trip.name}
        subtitle="Add and manage sections for each stop on your trip."
      />

      <div className="itinerary-sections">
        {sections.length === 0 && (
          <div className="itinerary-empty-hint">
            <Icons.MapPin size={32} />
            <p>No sections yet. Add your first stop below.</p>
          </div>
        )}

        {sections.map((section, index) => (
          <div className="itinerary-section-card" key={section.id}>
            <div className="itinerary-section-header">
              <span className="section-number">Section {index + 1}</span>
              <strong className="section-city">{section.city_name}</strong>
              <IconButton
                icon={Icons.Trash2}
                label="Remove section"
                variant="danger"
                onClick={() => removeSection(section.id)}
              />
            </div>

            <p className="section-description">
              All the necessary information about this section. This can be anything like the know section, hotel or any other activity.
            </p>

            <div className="section-meta-row">
              <div className="section-meta-item">
                <Icons.Calendar size={14} />
                <span>Date Range: {dateRange(section.start_date, section.end_date)}</span>
              </div>
              <div className="section-meta-item budget-pill">
                <Icons.Wallet size={14} />
                <span>Budget of this section: {budgetLabel(section.budget)}</span>
              </div>
            </div>

            {section.activities?.length > 0 && (
              <div className="section-activities-preview">
                {section.activities.map((act) => (
                  <span className="activity-chip" key={act.id}>
                    {act.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {addingSection ? (
        <Panel title="Add New Section">
          <form className="form-grid" onSubmit={addSection}>
            <Field label="Select City">
              <select
                value={newSection.city_id}
                onChange={(e) => setNewSection({ ...newSection, city_id: e.target.value })}
                required
              >
                <option value="">Choose a city…</option>
                {(cities || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}, {c.country}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Start Date">
              <input
                type="date"
                value={newSection.start_date}
                onChange={(e) => setNewSection({ ...newSection, start_date: e.target.value })}
                required
              />
            </Field>

            <Field label="End Date">
              <input
                type="date"
                value={newSection.end_date}
                onChange={(e) => setNewSection({ ...newSection, end_date: e.target.value })}
                required
              />
            </Field>

            <Field label="Transport / Budget ($)">
              <input
                type="number"
                placeholder="0"
                value={newSection.transport_cost}
                onChange={(e) => setNewSection({ ...newSection, transport_cost: e.target.value })}
              />
            </Field>

            <label className="field wide">
              <span>Notes</span>
              <textarea
                rows={2}
                placeholder="Optional notes for this stop…"
                value={newSection.notes}
                onChange={(e) => setNewSection({ ...newSection, notes: e.target.value })}
              />
            </label>

            <div className="wide form-actions">
              <Button icon={Icons.Plus} disabled={saving}>
                {saving ? "Adding…" : "Add Section"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAddingSection(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      ) : (
        <div className="add-section-cta">
          <Button icon={Icons.Plus} variant="secondary" onClick={() => setAddingSection(true)}>
            + Add another Section
          </Button>
        </div>
      )}

      {message && <p className="success-text">{message}</p>}
    </div>
  );
}
