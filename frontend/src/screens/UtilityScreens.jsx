import { useEffect, useState } from "react";
import { api, saveSession } from "../api.js";
import { Button, EmptyState, Field, IconButton, Icons, ImageBlock, PageHeader, Panel, Stat, formatDate, money, shortDate } from "../components/ui.jsx";

export function ChecklistScreen({ trip, refreshTrip }) {
  const [form, setForm] = useState({ label: "", category: "General" });
  if (!trip) return <EmptyState title="Select a trip">Packing checklists are stored per trip.</EmptyState>;

  async function add(event) {
    event.preventDefault();
    await api.addChecklist(trip.id, form);
    setForm({ label: "", category: "General" });
    refreshTrip();
  }

  async function toggle(item) {
    await api.updateChecklist(item.id, { ...item, is_packed: item.is_packed ? 0 : 1 });
    refreshTrip();
  }

  async function remove(id) {
    await api.deleteChecklist(id);
    refreshTrip();
  }

  return (
    <div className="screen-stack narrow">
      <PageHeader eyebrow="Packing Checklist" title={trip.name} subtitle="Add, categorize, check off, and reset packing items." />
      <Panel>
        <form className="check-form" onSubmit={add}>
          <input placeholder="New packing item" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {["General", "Clothing", "Documents", "Electronics", "Toiletries"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <Button icon={Icons.Plus}>Add</Button>
          <Button type="button" variant="secondary" icon={Icons.ClipboardList} onClick={() => Promise.all((trip.checklist || []).map((item) => api.updateChecklist(item.id, { ...item, is_packed: 0 }))).then(refreshTrip)}>Reset</Button>
        </form>
      </Panel>
      <div className="check-list">
        {trip.checklist?.map((item) => (
          <div className={`check-row ${item.is_packed ? "packed" : ""}`} key={item.id}>
            <button className="check-toggle" onClick={() => toggle(item)}>{item.is_packed ? <Icons.Check size={16} /> : null}</button>
            <div><strong>{item.label}</strong><small>{item.category}</small></div>
            <IconButton icon={Icons.Trash2} label="Remove item" variant="danger" onClick={() => remove(item.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShareScreen({ trip, refreshTrip }) {
  const [link, setLink] = useState("");
  if (!trip) return <EmptyState title="Select a trip">Create a public URL after selecting a trip.</EmptyState>;

  async function share() {
    const payload = await api.share(trip.id);
    const url = `${window.location.origin}/?public=${payload.token}`;
    setLink(url);
    refreshTrip();
  }

  return (
    <div className="screen-stack narrow">
      <PageHeader eyebrow="Shared/Public Itinerary" title={trip.name} subtitle="Read-only itinerary for friends, public inspiration, and social sharing." />
      <Panel title="Public URL">
        <p className="subtle">{trip.description}</p>
        <div className="share-box"><code>{link || (trip.public_token ? `${window.location.origin}/?public=${trip.public_token}` : "No public link yet")}</code></div>
        <div className="form-actions">
          <Button icon={Icons.Share2} onClick={share}>{trip.public_token ? "Refresh Link" : "Create Link"}</Button>
          <Button variant="secondary" icon={Icons.Copy} disabled={!link && !trip.public_token} onClick={() => navigator.clipboard.writeText(link || `${window.location.origin}/?public=${trip.public_token}`)}>Copy Link</Button>
        </div>
      </Panel>
    </div>
  );
}

export function ProfileScreen({ user, setUser, savedCities, reloadSaved, logout }) {
  const [form, setForm] = useState(user || {});
  const [message, setMessage] = useState("");
  useEffect(() => setForm(user || {}), [user?.id]);

  async function save(event) {
    event.preventDefault();
    const payload = await api.updateMe(form);
    saveSession(localStorage.getItem("traveloop_token"), payload.user);
    setUser(payload.user);
    setMessage("Profile saved.");
  }

  async function removeSaved(cityId) {
    await api.unsaveCity(cityId);
    reloadSaved();
  }

  async function deleteAccount() {
    if (!confirm("Delete this account and all related trips?")) return;
    await api.deleteMe();
    logout();
  }

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="User Profile" title="Settings and saved destinations" subtitle="Edit profile fields, language preference, privacy, and destination bookmarks." />
      <div className="two-col">
        <Panel title="User details">
          <form className="form-grid" onSubmit={save}>
            {["first_name", "last_name", "email", "phone", "city", "country", "photo_url"].map((field) => (
              <Field label={field.replace("_", " ")} key={field}>
                <input value={form[field] || ""} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
              </Field>
            ))}
            <Field label="Language">
              <select value={form.language || "English"} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                {["English", "Hindi", "Spanish", "French", "Japanese"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <label className="field wide"><span>Bio</span><textarea rows={4} value={form.bio || ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
            <div className="wide form-actions"><Button icon={Icons.Settings}>Save Profile</Button><Button type="button" variant="danger" icon={Icons.Trash2} onClick={deleteAccount}>Delete Account</Button></div>
            {message && <p className="success-text wide">{message}</p>}
          </form>
        </Panel>
        <Panel title="Saved destinations">
          <div className="saved-list">
            {savedCities.length ? savedCities.map((city) => (
              <div className="saved-row" key={city.id}>
                <ImageBlock src={city.image_url} label={city.name} />
                <div><strong>{city.name}</strong><small>{city.country}</small></div>
                <IconButton icon={Icons.Trash2} label="Remove saved city" variant="danger" onClick={() => removeSaved(city.id)} />
              </div>
            )) : <p className="subtle">Saved cities will appear here.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function NotesScreen({ trip, refreshTrip }) {
  const [form, setForm] = useState({ title: "", body: "", note_date: new Date().toISOString().slice(0, 10), stop_id: "" });
  if (!trip) return <EmptyState title="Select a trip">Notes can be attached to a full trip or a specific stop.</EmptyState>;

  async function add(event) {
    event.preventDefault();
    await api.addNote(trip.id, { ...form, stop_id: form.stop_id || null });
    setForm({ title: "", body: "", note_date: new Date().toISOString().slice(0, 10), stop_id: "" });
    refreshTrip();
  }

  async function remove(id) {
    await api.deleteNote(id);
    refreshTrip();
  }

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Trip Notes / Journal" title={trip.name} subtitle="Save hotel details, local contacts, day reminders, and free-form notes." />
      <Panel title="Add trip note">
        <form className="form-grid" onSubmit={add}>
          <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
          <Field label="Date"><input type="date" value={form.note_date} onChange={(e) => setForm({ ...form, note_date: e.target.value })} /></Field>
          <Field label="Stop">
            <select value={form.stop_id} onChange={(e) => setForm({ ...form, stop_id: e.target.value })}>
              <option value="">Trip note</option>
              {trip.stops?.map((stop) => <option key={stop.id} value={stop.id}>{stop.city_name}</option>)}
            </select>
          </Field>
          <label className="field wide"><span>Note</span><textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></label>
          <div className="wide form-actions"><Button icon={Icons.NotebookText}>Save Note</Button></div>
        </form>
      </Panel>
      <div className="note-grid">
        {trip.notes?.map((note) => (
          <article className="note-card" key={note.id}>
            <div><strong>{note.title}</strong><span>{formatDate(note.note_date)}</span></div>
            <p>{note.body}</p>
            <IconButton icon={Icons.Trash2} label="Delete note" variant="danger" onClick={() => remove(note.id)} />
          </article>
        ))}
      </div>
    </div>
  );
}

export function AdminScreen({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadAnalytics() {
    setError("");
    try {
      const payload = await api.analytics();
      setData(payload);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function updateRole(row, role) {
    await api.adminUpdateUser(row.id, { role });
    setNotice(`${row.name} is now ${role}.`);
    loadAnalytics();
  }

  async function deleteUser(row) {
    if (!confirm(`Delete ${row.name} and all related trips?`)) return;
    await api.adminDeleteUser(row.id);
    setNotice(`${row.name} was removed.`);
    loadAnalytics();
  }

  if (error) return <EmptyState title="Admin role required">{error}</EmptyState>;
  if (!data) return <EmptyState title="Loading analytics">Preparing platform usage metrics.</EmptyState>;

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Admin-only" title="Analytics Dashboard" subtitle="Track user trends, trip data, platform usage, popular cities, and activity adoption." />
      {notice && <div className="admin-notice"><span>{notice}</span><button onClick={() => setNotice("")}>Dismiss</button></div>}
      <div className="stats-grid">
        <Stat label="Users" value={data.counts.users} icon={Icons.User} />
        <Stat label="Trips created" value={data.counts.trips} icon={Icons.Plane} tone="blue" />
        <Stat label="Planned activities" value={data.counts.planned} icon={Icons.WandSparkles} tone="gold" />
        <Stat label="Public trips" value={data.counts.public_trips} icon={Icons.Share2} />
      </div>
      <div className="two-col">
        <TrendChart rows={data.tripTrends} />
        <StatusChart rows={data.tripStatuses} />
      </div>
      <div className="two-col">
        <BarChart title="Top cities" rows={data.topCities} label={(row) => `${row.name}, ${row.country}`} valueKey="plans" meta={(row) => `${row.region} | cost index ${row.cost_index}`} />
        <BarChart title="Top activities" rows={data.topActivities} label={(row) => row.name} valueKey="adds" meta={(row) => `${row.category} | ${row.city} | avg ${money(row.avg_cost)}`} />
      </div>
      <EngagementPanel rows={data.engagement} />
      <UserManagement users={data.users} currentUser={user} onRoleChange={updateRole} onDelete={deleteUser} />
    </div>
  );
}

function TrendChart({ rows }) {
  const max = Math.max(1, ...rows.map((row) => row.trips));
  return (
    <Panel title="Trips created trend">
      <div className="trend-chart">
        {rows.length ? rows.map((row) => (
          <div className="trend-column" key={row.date}>
            <div className="trend-track"><i style={{ height: `${Math.max(12, row.trips / max * 100)}%` }} /></div>
            <strong>{row.trips}</strong>
            <span>{shortDate(row.date)}</span>
          </div>
        )) : <p className="subtle">No trips created yet.</p>}
      </div>
    </Panel>
  );
}

function StatusChart({ rows }) {
  const max = Math.max(1, ...rows.map((row) => row.trips));
  return (
    <Panel title="Trip status mix">
      <div className="chart-list">
        {rows.map((row) => (
          <div className="chart-row" key={row.status}>
            <div className="chart-label"><strong>{row.status}</strong><span>{row.trips} trips</span></div>
            <div className="chart-track"><i style={{ width: `${row.trips / max * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BarChart({ title, rows, label, valueKey, meta }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey] || 0)));
  return (
    <Panel title={title}>
      <div className="chart-list">
        {rows.length ? rows.map((row) => (
          <div className="chart-row" key={`${title}-${label(row)}`}>
            <div className="chart-label"><strong>{label(row)}</strong><span>{meta(row)}</span></div>
            <div className="chart-track"><i style={{ width: `${Number(row[valueKey] || 0) / max * 100}%` }} /></div>
            <b>{row[valueKey]}</b>
          </div>
        )) : <p className="subtle">No data yet.</p>}
      </div>
    </Panel>
  );
}

function EngagementPanel({ rows }) {
  return (
    <Panel title="User engagement stats">
      <div className="engagement-grid">
        {rows.slice(0, 6).map((row) => (
          <article className="engagement-card" key={row.id}>
            <div>
              <strong>{row.name}</strong>
              <span>{row.email}</span>
            </div>
            <div className="engagement-metrics">
              <span>{row.trips_created} trips</span>
              <span>{row.stops_added} stops</span>
              <span>{row.activities_planned} activities</span>
              <span>{row.notes_written} notes</span>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function UserManagement({ users, currentUser, onRoleChange, onDelete }) {
  return (
    <Panel title="User management tools">
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>User</th><th>Role</th><th>Engagement</th><th>Planned budget</th><th>Last trip update</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.name}</strong><span>{row.email}</span></td>
                <td><span className={`role-pill role-${row.role}`}>{row.role}</span></td>
                <td>{row.trips_created} trips | {row.activities_planned} activities | {row.public_trips} public</td>
                <td>{money(row.planned_budget)}</td>
                <td>{row.last_trip_date ? formatDate(row.last_trip_date.slice(0, 10)) : "-"}</td>
                <td>
                  <div className="inline-actions">
                    <select value={row.role} onChange={(event) => onRoleChange(row, event.target.value)}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                    <IconButton icon={Icons.Trash2} label="Delete user" variant="danger" disabled={row.id === currentUser?.id} onClick={() => onDelete(row)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Table({ title, rows }) {
  const columns = Object.keys(rows[0] || {});
  return (
    <Panel title={title}>
      <div className="table-wrap">
        <table>
          <thead><tr>{columns.map((column) => <th key={column}>{column.replace("_", " ")}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{row[column]}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </Panel>
  );
}

export function PublicItinerary({ token }) {
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.publicTrip(token).then((payload) => setTrip(payload.trip)).catch((err) => setError(err.message));
  }, [token]);
  if (error) return <EmptyState title="Shared itinerary unavailable">{error}</EmptyState>;
  if (!trip) return <EmptyState title="Loading itinerary">Fetching public travel plan.</EmptyState>;

  return (
    <main className="public-shell">
      <section className="public-hero" style={{ backgroundImage: `url(${trip.cover_photo || trip.stops?.[0]?.city_image || ""})` }}>
        <div>
          <span>Shared by {trip.owner_name}</span>
          <h1>{trip.name}</h1>
          <p>{shortDate(trip.start_date)} - {shortDate(trip.end_date)}</p>
          <div className="form-actions">
            <Button icon={Icons.Copy} onClick={() => navigator.clipboard.writeText(window.location.href)}>Copy Trip Link</Button>
          </div>
        </div>
      </section>
      <section className="public-content">
        {trip.stops?.map((stop) => (
          <article className="public-stop" key={stop.id}>
            <ImageBlock src={stop.city_image} label={stop.city_name} />
            <div>
              <h2>{stop.city_name}</h2>
              <p>{stop.country} | {shortDate(stop.start_date)} - {shortDate(stop.end_date)}</p>
              {stop.activities?.map((activity) => (
                <div className="activity-line" key={activity.id}>
                  <div><strong>{activity.name}</strong><span>{activity.activity_date} at {activity.start_time}</span></div>
                  <small>{activity.category}</small>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
