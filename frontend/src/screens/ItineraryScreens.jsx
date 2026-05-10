import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, EmptyState, Field, IconButton, Icons, ImageBlock, PageHeader, Panel, TripSelect, money, shortDate } from "../components/ui.jsx";

export function BuilderScreen({ trip, trips, selectedTripId, setSelectedTripId, cities, refreshTrip }) {
  const [form, setForm] = useState({ city_id: "", start_date: "", end_date: "", transport_cost: 0, notes: "" });

  useEffect(() => {
    if (trip) setForm((current) => ({ ...current, start_date: current.start_date || trip.start_date, end_date: current.end_date || trip.start_date }));
  }, [trip?.id]);

  if (!trip) {
    return (
      <EmptyState title="Select a trip" action={<TripSelect trips={trips} selectedTripId={selectedTripId} onChange={setSelectedTripId} />}>
        Choose an itinerary before adding stops.
      </EmptyState>
    );
  }

  async function addStop(event) {
    event.preventDefault();
    await api.addStop(trip.id, { ...form, city_id: Number(form.city_id) });
    setForm({ city_id: "", start_date: trip.start_date, end_date: trip.start_date, transport_cost: 0, notes: "" });
    refreshTrip();
  }

  async function move(stop, direction) {
    await api.updateStop(stop.id, { ...stop, sort_order: Math.max(1, stop.sort_order + direction) });
    refreshTrip();
  }

  async function remove(stopId) {
    await api.deleteStop(stopId);
    refreshTrip();
  }

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Build Itinerary" title={trip.name} subtitle="Add cities, assign dates, estimate transport, and reorder the trip flow." actions={<TripSelect trips={trips} selectedTripId={selectedTripId} onChange={setSelectedTripId} />} />
      <Panel title="Add another section">
        <form className="stop-form" onSubmit={addStop}>
          <Field label="City">
            <select value={form.city_id} onChange={(e) => setForm({ ...form, city_id: e.target.value })} required>
              <option value="">Select city</option>
              {cities.map((city) => <option key={city.id} value={city.id}>{city.name}, {city.country}</option>)}
            </select>
          </Field>
          <Field label="Start"><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></Field>
          <Field label="End"><input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required /></Field>
          <Field label="Transport"><input type="number" min="0" value={form.transport_cost} onChange={(e) => setForm({ ...form, transport_cost: e.target.value })} /></Field>
          <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Button icon={Icons.Plus}>Add Stop</Button>
        </form>
      </Panel>
      <div className="stop-list">
        {trip.stops?.length ? trip.stops.map((stop, index) => (
          <article className="stop-card" key={stop.id}>
            <ImageBlock src={stop.city_image} label={stop.city_name} />
            <div className="stop-body">
              <div className="stop-title"><span>{index + 1}</span><h2>{stop.city_name}</h2></div>
              <p>{stop.country} | {shortDate(stop.start_date)} - {shortDate(stop.end_date)}</p>
              <p>{stop.notes || stop.city_description}</p>
              <div className="chips">{stop.activities?.map((item) => <span key={item.id}>{item.start_time} {item.name}</span>)}</div>
            </div>
            <div className="vertical-actions">
              <IconButton icon={Icons.CalendarDays} label="Move earlier" onClick={() => move(stop, -1)} />
              <IconButton icon={Icons.Map} label="Move later" onClick={() => move(stop, 1)} />
              <IconButton icon={Icons.Trash2} label="Remove stop" variant="danger" onClick={() => remove(stop.id)} />
            </div>
          </article>
        )) : <EmptyState title="No sections yet">Add a city stop to begin the itinerary.</EmptyState>}
      </div>
    </div>
  );
}

export function ItineraryViewScreen({ trip, trips, selectedTripId, setSelectedTripId, refreshTrip }) {
  const [mode, setMode] = useState("list");
  const days = useMemo(() => {
    const map = {};
    (trip?.stops || []).forEach((stop) => {
      for (const activity of stop.activities || []) {
        map[activity.activity_date] ||= { date: activity.activity_date, city: stop.city_name, items: [] };
        map[activity.activity_date].items.push(activity);
      }
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [trip]);

  if (!trip) {
    return (
      <EmptyState title="Select a trip" action={<TripSelect trips={trips} selectedTripId={selectedTripId} onChange={setSelectedTripId} />}>
        The itinerary timeline appears after a trip is selected.
      </EmptyState>
    );
  }

  async function removeActivity(id) {
    await api.deleteActivity(id);
    refreshTrip();
  }

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Itinerary View"
        title={trip.name}
        subtitle={`${shortDate(trip.start_date)} - ${shortDate(trip.end_date)}`}
        actions={
          <>
            <TripSelect trips={trips} selectedTripId={selectedTripId} onChange={setSelectedTripId} />
            <div className="segmented">
              <button className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>List</button>
              <button className={mode === "calendar" ? "active" : ""} onClick={() => setMode("calendar")}>Calendar</button>
            </div>
          </>
        }
      />
      {mode === "list" ? (
        <div className="timeline">
          {trip.stops?.map((stop) => (
            <section className="timeline-item" key={stop.id}>
              <div className="timeline-dot" />
              <div className="timeline-panel">
                <h2>{stop.city_name}</h2>
                <p>{shortDate(stop.start_date)} - {shortDate(stop.end_date)} | {stop.country}</p>
                {stop.activities?.map((activity) => (
                  <div className="activity-line" key={activity.id}>
                    <div><strong>{activity.name}</strong><span>{activity.activity_date} at {activity.start_time}</span></div>
                    <small>{activity.category} | {money(activity.custom_cost || activity.cost)}</small>
                    <IconButton icon={Icons.Trash2} label="Remove activity" variant="danger" onClick={() => removeActivity(activity.id)} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="calendar-grid">
          {days.length ? days.map((day) => (
            <article className="calendar-day" key={day.date}>
              <strong>{shortDate(day.date)}</strong>
              <span>{day.city}</span>
              {day.items.map((item) => <small key={item.id}>{item.start_time} {item.name}</small>)}
            </article>
          )) : <EmptyState title="No scheduled activities">Add activities to see day-wise calendar cards.</EmptyState>}
        </div>
      )}
    </div>
  );
}
