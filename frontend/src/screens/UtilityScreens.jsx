import { useEffect, useMemo, useRef, useState } from "react";
import { api, assetUrl, saveSession } from "../api.js";
import { Button, EmptyState, Field, IconButton, Icons, ImageBlock, PageHeader, Panel, Stat, formatDate, money, shortDate } from "../components/ui.jsx";

export function ChecklistScreen({ trip, refreshTrip }) {
  const [form, setForm] = useState({ label: "", category: "General" });
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState("category");
  const [filterBy, setFilterBy] = useState("all");
  const [sortBy, setSortBy] = useState("category");
  const [showAdd, setShowAdd] = useState(false);

  const items = trip?.checklist || [];
  const categories = useMemo(() => {
    const base = ["Documents", "Clothing", "Electronics", "Toiletries", "General"];
    return [...new Set([...base, ...items.map((item) => item.category).filter(Boolean)])];
  }, [items]);
  const packedCount = items.filter((item) => item.is_packed).length;
  const progress = items.length ? Math.round((packedCount / items.length) * 100) : 0;

  async function add(event) {
    event.preventDefault();
    if (!form.label.trim()) return;
    await api.addChecklist(trip.id, form);
    setForm({ label: "", category: "General" });
    setShowAdd(false);
    refreshTrip();
  }

  async function toggle(item) {
    await api.updateChecklist(item.id, { label: item.label, category: item.category, is_packed: item.is_packed ? 0 : 1 });
    refreshTrip();
  }

  async function remove(id) {
    await api.deleteChecklist(id);
    refreshTrip();
  }

  async function resetAll() {
    await Promise.all(items.map((item) => api.updateChecklist(item.id, { label: item.label, category: item.category, is_packed: 0 })));
    refreshTrip();
  }

  async function shareChecklist() {
    const text = [
      `${trip.name} packing checklist`,
      `${packedCount}/${items.length} packed`,
      "",
      ...items.map((item) => `${item.is_packed ? "[x]" : "[ ]"} ${item.label} (${item.category})`),
    ].join("\n");
    await navigator.clipboard?.writeText(text);
  }

  const visibleItems = useMemo(() => {
    let list = [...items];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((item) =>
        item.label?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q)
      );
    }
    if (filterBy === "packed") list = list.filter((item) => item.is_packed);
    if (filterBy === "unpacked") list = list.filter((item) => !item.is_packed);
    if (filterBy.startsWith("cat:")) list = list.filter((item) => item.category === filterBy.slice(4));

    if (sortBy === "name") list.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
    else if (sortBy === "packed") list.sort((a, b) => Number(a.is_packed) - Number(b.is_packed));
    else list.sort((a, b) => `${a.category || ""}-${a.id}`.localeCompare(`${b.category || ""}-${b.id}`));
    return list;
  }, [items, query, filterBy, sortBy]);

  const groupedItems = useMemo(() => {
    if (groupBy === "none") return { "Checklist": visibleItems };
    return visibleItems.reduce((groups, item) => {
      const key = groupBy === "status" ? (item.is_packed ? "Packed" : "Still needed") : (item.category || "General");
      groups[key] = groups[key] || [];
      groups[key].push(item);
      return groups;
    }, {});
  }, [visibleItems, groupBy]);

  if (!trip) return <EmptyState title="Select a trip">Packing checklists are stored per trip.</EmptyState>;

  return (
    <div style={utilityMock.root}>
      <div style={utilityMock.topBar}>
        <strong>Traveloop</strong>
        <span style={utilityMock.topDot} />
      </div>

      <main style={utilityMock.page}>
        <p style={utilityMock.eyebrow}>Packing Checklist / Screen 11</p>
        <div style={utilityMock.toolbar}>
          <input style={utilityMock.searchInput} placeholder="Search item..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <select style={utilityMock.smallSelect} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="category">Group by category</option>
            <option value="status">Group by status</option>
            <option value="none">No group</option>
          </select>
          <select style={utilityMock.smallSelect} value={filterBy} onChange={(e) => setFilterBy(e.target.value)}>
            <option value="all">Filter: all</option>
            <option value="unpacked">Unpacked</option>
            <option value="packed">Packed</option>
            {categories.map((category) => <option key={category} value={`cat:${category}`}>{category}</option>)}
          </select>
          <select style={utilityMock.smallSelect} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="category">Sort: category</option>
            <option value="name">Name A-Z</option>
            <option value="packed">Needed first</option>
          </select>
        </div>

        <section style={utilityMock.sectionHead}>
          <h1 style={utilityMock.title}>Packing checklist</h1>
          <select style={utilityMock.tripSelect} value={trip.id} disabled>
            <option>{trip.name}</option>
          </select>
          <div style={utilityMock.progressMeta}>
            <span>Progress: {packedCount}/{items.length} items packed</span>
            <span>{progress}%</span>
          </div>
          <div style={utilityMock.progressTrack}><i style={{ ...utilityMock.progressFill, width: `${progress}%` }} /></div>
        </section>

        <div style={utilityMock.groupList}>
          {Object.entries(groupedItems).map(([group, groupItems]) => {
            const groupPacked = groupItems.filter((item) => item.is_packed).length;
            return (
              <section key={group} style={utilityMock.checkGroup}>
                <div style={utilityMock.groupHeader}>
                  <strong>{group}</strong>
                  <span>{groupPacked}/{groupItems.length}</span>
                </div>
                {groupItems.map((item) => (
                  <div key={item.id} style={utilityMock.checkRow}>
                    <button style={utilityMock.checkbox} onClick={() => toggle(item)} aria-label="Toggle packed">
                      {item.is_packed ? <Icons.Check size={13} /> : null}
                    </button>
                    <span style={{ ...utilityMock.checkText, ...(item.is_packed ? utilityMock.doneText : {}) }}>{item.label}</span>
                    <button style={utilityMock.iconTextBtn} onClick={() => remove(item.id)} aria-label="Remove item">x</button>
                  </div>
                ))}
              </section>
            );
          })}
          {!visibleItems.length && <EmptyState title="No checklist items">Try a different search or add a new item.</EmptyState>}
        </div>

        {showAdd && (
          <form style={utilityMock.addRow} onSubmit={add}>
            <input style={utilityMock.searchInput} placeholder="New packing item" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} autoFocus />
            <select style={utilityMock.smallSelect} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
            <button style={utilityMock.primaryBtn}>Save item</button>
          </form>
        )}

        <div style={utilityMock.bottomActions}>
          <button style={utilityMock.outlineBtn} onClick={() => setShowAdd((value) => !value)}>+ add item to checklist</button>
          <button style={utilityMock.outlineBtn} onClick={resetAll}>Reset all</button>
          <button style={utilityMock.outlineBtn} onClick={shareChecklist}>Share checklist</button>
        </div>
      </main>
    </div>
  );
}

const utilityMock = {
  root: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #eef7f4 0%, #f7f7fb 44%, #fff8ed 100%)",
    color: "#172820",
  },
  topBar: {
    height: 48,
    background: "rgba(255,255,255,0.92)",
    borderBottom: "1px solid #d9e5df",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 20px",
    position: "sticky",
    top: 0,
    zIndex: 5,
    backdropFilter: "blur(10px)",
    boxShadow: "0 2px 14px rgba(19, 44, 37, 0.06)",
  },
  topDot: { width: 20, height: 20, borderRadius: "50%", border: "2px solid #0f6b55", background: "#e7f5ef", display: "inline-block" },
  page: { maxWidth: 980, margin: "0 auto", padding: "22px 18px 72px" },
  eyebrow: { margin: "0 0 8px", color: "#0f6b55", fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  title: { margin: "0 0 10px", fontSize: 26, fontWeight: 950, color: "#172820" },
  toolbar: {
    display: "flex",
    gap: 9,
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
    background: "rgba(255,255,255,0.76)",
    border: "1px solid #d9e5df",
    borderRadius: 8,
    padding: 10,
    boxShadow: "0 10px 24px rgba(23, 40, 32, 0.06)",
  },
  searchInput: { border: "1.5px solid #d9e5df", borderRadius: 8, padding: "10px 12px", minWidth: 180, flex: 1, fontSize: 13, background: "#fff", outline: "none", fontFamily: "inherit", color: "#172820", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" },
  smallSelect: { border: "1.5px solid #d9e5df", borderRadius: 8, padding: "10px 10px", background: "#fff", fontSize: 12, color: "#172820", fontWeight: 800, outline: "none", minHeight: 38 },
  tripSelect: { border: "1.5px solid #b9d7cb", borderRadius: 8, padding: "9px 11px", minWidth: 260, background: "#f8fcfa", fontSize: 12, fontWeight: 800, color: "#0f6b55" },
  sectionHead: { marginBottom: 14, background: "#fff", border: "1px solid #d9e5df", borderRadius: 8, padding: 16, boxShadow: "0 14px 30px rgba(23, 40, 32, 0.08)" },
  progressMeta: { display: "flex", justifyContent: "space-between", gap: 12, color: "#45564f", fontSize: 12, fontWeight: 900, marginTop: 12 },
  progressTrack: { height: 11, borderRadius: 999, background: "#e6ece9", overflow: "hidden", marginTop: 6, boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)" },
  progressFill: { display: "block", height: "100%", background: "linear-gradient(90deg, #0f6b55, #f4a261)", borderRadius: 999 },
  groupList: { display: "flex", flexDirection: "column", gap: 12 },
  checkGroup: { background: "#fff", border: "1px solid #d9e5df", borderRadius: 8, overflow: "hidden", boxShadow: "0 10px 24px rgba(23, 40, 32, 0.07)" },
  groupHeader: { background: "#eef7f4", borderBottom: "1px solid #d9e5df", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#0f6b55" },
  checkRow: { display: "grid", gridTemplateColumns: "24px minmax(0, 1fr) 24px", gap: 9, alignItems: "center", padding: "9px 12px", borderBottom: "1px solid #eef1ef" },
  checkbox: { width: 20, height: 20, borderRadius: 6, border: "1.5px solid #0f6b55", background: "#f8fcfa", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#0f6b55", padding: 0 },
  checkText: { fontSize: 13, color: "#202b27", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 },
  doneText: { color: "#7c8b84", textDecoration: "line-through", fontWeight: 600 },
  iconTextBtn: { border: "none", background: "#fff1f0", color: "#b23b35", cursor: "pointer", fontWeight: 900, padding: 0, borderRadius: 6, width: 22, height: 22 },
  addRow: { display: "grid", gridTemplateColumns: "minmax(180px, 1fr) auto auto", gap: 8, marginTop: 12, background: "#fff", border: "1px solid #d9e5df", borderRadius: 8, padding: 10 },
  bottomActions: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14 },
  outlineBtn: { border: "1.5px solid #0f6b55", background: "#fff", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontWeight: 900, color: "#0f6b55", cursor: "pointer", boxShadow: "0 4px 12px rgba(15, 107, 85, 0.08)" },
  primaryBtn: { border: "none", background: "#0f6b55", color: "#fff", borderRadius: 8, padding: "9px 15px", fontSize: 12, fontWeight: 950, cursor: "pointer", boxShadow: "0 8px 18px rgba(15, 107, 85, 0.2)" },
  composerActions: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  noteLayout: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center", marginBottom: 14, background: "#fff", border: "1px solid #d9e5df", borderRadius: 8, padding: 16, boxShadow: "0 14px 30px rgba(23, 40, 32, 0.08)" },
  noteTabs: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 },
  noteTab: { border: "1.5px solid #d9e5df", background: "#fff", borderRadius: 999, padding: "8px 15px", fontSize: 12, fontWeight: 900, cursor: "pointer", color: "#45564f" },
  noteTabActive: { background: "#0f6b55", color: "#fff", borderColor: "#0f6b55", boxShadow: "0 6px 14px rgba(15, 107, 85, 0.18)" },
  noteList: { display: "flex", flexDirection: "column", gap: 12 },
  noteCard: { background: "#fff", border: "1px solid #d9e5df", borderLeft: "5px solid #f4a261", borderRadius: 8, padding: 14, boxShadow: "0 12px 26px rgba(23, 40, 32, 0.08)" },
  noteCardHead: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  noteTitle: { margin: 0, fontSize: 15, fontWeight: 950, color: "#172820" },
  noteMeta: { display: "flex", gap: 8, flexWrap: "wrap", color: "#60736b", fontSize: 11, fontWeight: 900, marginTop: 4 },
  noteText: { margin: "10px 0 0", fontSize: 13, lineHeight: 1.58, color: "#343f3a", whiteSpace: "pre-wrap" },
  noteActions: { display: "flex", gap: 7, flexShrink: 0 },
  noteIcon: { width: 30, height: 30, border: "1px solid #d9e5df", background: "#f8fcfa", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#0f6b55" },
  noteForm: { background: "#fff", border: "1px solid #d9e5df", borderRadius: 8, padding: 14, display: "grid", gap: 10, marginBottom: 16, boxShadow: "0 12px 26px rgba(23, 40, 32, 0.08)" },
  noteFormGrid: { display: "grid", gridTemplateColumns: "1fr 160px 180px", gap: 8 },
  textArea: { border: "1.5px solid #d9e5df", borderRadius: 8, padding: "10px 12px", fontSize: 13, resize: "vertical", minHeight: 92, outline: "none", fontFamily: "inherit", color: "#172820" },
};

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

export function ProfileScreen({ user, setUser, savedCities, reloadSaved, logout, trips = [], selectTrip, setScreen }) {
  const [form, setForm] = useState(user || {});
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => setForm(user || {}), [user?.id]);

  const initials = (form.name || user?.name || "U")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const photoSrc = assetUrl(form.photo_url);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const preplannedTrips = [...(trips || [])]
    .filter((trip) => !trip.end_date || new Date(`${trip.end_date}T00:00:00`) >= today)
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  const previousTrips = [...(trips || [])]
    .filter((trip) => trip.end_date && new Date(`${trip.end_date}T00:00:00`) < today)
    .sort((a, b) => (b.end_date || "").localeCompare(a.end_date || ""));

  async function save(event) {
    event.preventDefault();
    const payload = await api.updateMe(form);
    saveSession(localStorage.getItem("traveloop_token"), payload.user);
    setUser(payload.user);
    setForm(payload.user);
    setMessage("Profile saved.");
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const payload = await api.uploadPhoto(file, form.photo_url || "");
      const nextPhotoUrl = payload.url;
      const updatedUser = payload.user || (await api.updateMe({ ...(user || form), photo_url: nextPhotoUrl })).user;

      saveSession(localStorage.getItem("traveloop_token"), updatedUser);
      setUser(updatedUser);
      setForm((current) => ({ ...current, photo_url: updatedUser.photo_url || nextPhotoUrl }));
      setMessage("Photo updated in database.");
    } catch (err) {
      setMessage(err.message || "Photo upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
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

  function TripMiniCard({ trip }) {
    return (
      <article style={ps.tripCard}>
        <div style={ps.tripThumb}>
          {trip.cover_photo ? (
            <img src={trip.cover_photo} alt={trip.name} style={ps.tripImg} />
          ) : (
            <span>{trip.name?.[0] || "T"}</span>
          )}
        </div>
        <strong style={ps.tripName}>{trip.name}</strong>
        <small style={ps.tripDate}>{formatDate(trip.start_date)}</small>
        <button style={ps.viewBtn} onClick={() => selectTrip?.(trip.id, "itinerary")}>
          View
        </button>
      </article>
    );
  }

  return (
    <div style={ps.root}>
      <div style={ps.topBar}>
        <span style={ps.brand}>Traveloop</span>
        <button style={ps.avatarButton} onClick={() => setScreen?.("profile")}>
          {photoSrc ? <img src={photoSrc} alt="profile" style={ps.avatarImg} /> : initials}
        </button>
      </div>

      <div style={ps.profileShell}>
        <PageHeader
          eyebrow="Screen 7"
          title="User Profile Page"
          subtitle="Profile details, photo, saved destinations, and trip history."
        />

        <div style={ps.heroGrid}>
          <section style={ps.photoPanel}>
            <div style={ps.photoFrame}>
              {photoSrc ? <img src={photoSrc} alt="User" style={ps.photoImg} /> : <span>{initials}</span>}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={uploadPhoto}
              style={{ display: "none" }}
            />
            <button
              type="button"
              style={ps.photoBtn}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading..." : "Change Photo"}
            </button>
            <p style={ps.photoHint}>Saved from database field: photo_url</p>
          </section>

          <section style={ps.detailPanel}>
            <h2 style={ps.panelTitle}>User Details</h2>
            <form style={ps.formGrid} onSubmit={save}>
              {["first_name", "last_name", "email", "phone", "city", "country"].map((field) => (
                <Field label={field.replace("_", " ")} key={field}>
                  <input
                    value={form[field] || ""}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="Profile photo URL">
                <input
                  value={form.photo_url || ""}
                  onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
                />
              </Field>
              <Field label="Language">
                <select value={form.language || "English"} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                  {["English", "Hindi", "Spanish", "French", "Japanese"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <label style={ps.wideField}>
                <span>Bio</span>
                <textarea rows={4} value={form.bio || ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
              </label>
              <div style={ps.formActions}>
                <Button icon={Icons.Settings}>Save Profile</Button>
                <Button type="button" variant="danger" icon={Icons.Trash2} onClick={deleteAccount}>
                  Delete Account
                </Button>
              </div>
              {message && <p style={ps.message}>{message}</p>}
            </form>
          </section>
        </div>

        <section style={ps.tripsPanel}>
          <h2 style={ps.panelTitle}>Preplanned Trips</h2>
          <div style={ps.tripGrid}>
            {preplannedTrips.length ? preplannedTrips.slice(0, 6).map((trip) => (
              <TripMiniCard key={trip.id} trip={trip} />
            )) : <p style={ps.emptyText}>No preplanned trips yet.</p>}
          </div>
        </section>

        <section style={ps.tripsPanel}>
          <h2 style={ps.panelTitle}>Previous Trips</h2>
          <div style={ps.tripGrid}>
            {previousTrips.length ? previousTrips.slice(0, 6).map((trip) => (
              <TripMiniCard key={trip.id} trip={trip} />
            )) : <p style={ps.emptyText}>Previous trips will appear here.</p>}
          </div>
        </section>

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

const ps = {
  root: {
    minHeight: "100vh",
    background: "#f6f7f5",
  },
  topBar: {
    height: 52,
    background: "#fff",
    borderBottom: "1px solid #dfe5df",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 18px",
    position: "sticky",
    top: 0,
    zIndex: 5,
  },
  brand: { fontWeight: 900, color: "#0f6b55" },
  avatarButton: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: "1px solid #d4ded8",
    background: "#0f6b55",
    color: "#fff",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    cursor: "pointer",
  },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  profileShell: {
    maxWidth: 980,
    margin: "0 auto",
    padding: "22px 18px 60px",
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "240px 1fr",
    gap: 18,
    alignItems: "stretch",
    marginBottom: 18,
  },
  photoPanel: {
    background: "#fff",
    border: "1px solid #dfe5df",
    borderRadius: 10,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  photoFrame: {
    width: 132,
    height: 132,
    borderRadius: "50%",
    border: "2px solid #d4ded8",
    background: "#edf3ef",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#0f6b55",
    fontSize: 30,
    fontWeight: 900,
  },
  photoImg: { width: "100%", height: "100%", objectFit: "cover" },
  photoBtn: {
    border: "none",
    borderRadius: 8,
    padding: "9px 14px",
    background: "#0f6b55",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  photoHint: { margin: 0, color: "#7c8b84", fontSize: 12, textAlign: "center" },
  detailPanel: {
    background: "#fff",
    border: "1px solid #dfe5df",
    borderRadius: 10,
    padding: 18,
  },
  panelTitle: {
    margin: "0 0 14px",
    color: "#172820",
    fontSize: 18,
    fontWeight: 900,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  },
  wideField: {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    fontWeight: 800,
    color: "#45564f",
  },
  formActions: {
    gridColumn: "1 / -1",
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  message: {
    gridColumn: "1 / -1",
    margin: 0,
    color: "#0f6b55",
    fontWeight: 800,
    fontSize: 13,
  },
  tripsPanel: {
    background: "#fff",
    border: "1px solid #dfe5df",
    borderRadius: 10,
    padding: 16,
    marginBottom: 18,
  },
  tripGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))",
    gap: 14,
  },
  tripCard: {
    border: "1px solid #dfe5df",
    borderRadius: 8,
    padding: 10,
    background: "#fbfcfb",
    minHeight: 180,
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },
  tripThumb: {
    height: 78,
    borderRadius: 6,
    background: "#edf3ef",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#0f6b55",
    fontWeight: 900,
  },
  tripImg: { width: "100%", height: "100%", objectFit: "cover" },
  tripName: { color: "#172820", fontSize: 13, lineHeight: 1.2 },
  tripDate: { color: "#7c8b84", fontSize: 11 },
  viewBtn: {
    marginTop: "auto",
    border: "1px solid #0f6b55",
    borderRadius: 6,
    background: "#fff",
    color: "#0f6b55",
    padding: "6px 8px",
    fontWeight: 800,
    cursor: "pointer",
  },
  emptyText: { color: "#7c8b84", margin: 0, fontSize: 13 },
};

export function NotesScreen({ trip, refreshTrip }) {
  const emptyForm = { title: "", body: "", note_date: new Date().toISOString().slice(0, 10), stop_id: "" };
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState("none");
  const [filterBy, setFilterBy] = useState("all");
  const [sortBy, setSortBy] = useState("recent");

  const notes = trip?.notes || [];
  const stops = trip?.stops || [];
  const stopName = (stopId) => stops.find((stop) => String(stop.id) === String(stopId))?.city_name || "Trip note";

  async function add(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    const payload = { ...form, stop_id: form.stop_id || null };
    if (editingId) await api.updateNote(editingId, payload);
    else await api.addNote(trip.id, payload);
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    refreshTrip();
  }

  function edit(note) {
    setEditingId(note.id);
    setForm({
      title: note.title || "",
      body: note.body || "",
      note_date: note.note_date || new Date().toISOString().slice(0, 10),
      stop_id: note.stop_id || "",
    });
    setShowForm(true);
  }

  async function remove(id) {
    await api.deleteNote(id);
    refreshTrip();
  }

  const visibleNotes = useMemo(() => {
    let list = [...notes];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((note) =>
        note.title?.toLowerCase().includes(q) ||
        note.body?.toLowerCase().includes(q) ||
        stopName(note.stop_id).toLowerCase().includes(q)
      );
    }
    if (filterBy === "trip") list = list.filter((note) => !note.stop_id);
    if (filterBy === "stop") list = list.filter((note) => note.stop_id);
    if (filterBy.startsWith("stop:")) list = list.filter((note) => String(note.stop_id) === filterBy.slice(5));

    if (sortBy === "oldest") list.sort((a, b) => (a.note_date || "").localeCompare(b.note_date || ""));
    else if (sortBy === "title") list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    else if (sortBy === "stop") list.sort((a, b) => stopName(a.stop_id).localeCompare(stopName(b.stop_id)));
    else list.sort((a, b) => (b.note_date || "").localeCompare(a.note_date || "") || (b.id || 0) - (a.id || 0));
    return list;
  }, [notes, query, filterBy, sortBy, stops]);

  const groupedNotes = useMemo(() => {
    if (groupBy === "none") return { "": visibleNotes };
    return visibleNotes.reduce((groups, note) => {
      let key = "All notes";
      if (groupBy === "stop") key = stopName(note.stop_id);
      if (groupBy === "date") key = note.note_date || "No date";
      groups[key] = groups[key] || [];
      groups[key].push(note);
      return groups;
    }, {});
  }, [visibleNotes, groupBy, stops]);

  if (!trip) return <EmptyState title="Select a trip">Notes can be attached to a full trip or a specific stop.</EmptyState>;

  return (
    <div style={utilityMock.root}>
      <div style={utilityMock.topBar}>
        <strong>Traveloop</strong>
        <span style={utilityMock.topDot} />
      </div>

      <main style={utilityMock.page}>
        <p style={utilityMock.eyebrow}>Trip notes or journal screen / Screen 13</p>
        <div style={utilityMock.toolbar}>
          <input style={utilityMock.searchInput} placeholder="Search for..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <select style={utilityMock.smallSelect} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="none">Group by</option>
            <option value="stop">Stop</option>
            <option value="date">Date</option>
          </select>
          <select style={utilityMock.smallSelect} value={filterBy} onChange={(e) => setFilterBy(e.target.value)}>
            <option value="all">Filter: all</option>
            <option value="trip">Trip notes</option>
            <option value="stop">Stop notes</option>
            {stops.map((stop) => <option key={stop.id} value={`stop:${stop.id}`}>{stop.city_name}</option>)}
          </select>
          <select style={utilityMock.smallSelect} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="recent">Sort: recent</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title A-Z</option>
            <option value="stop">By stop</option>
          </select>
        </div>

        <section style={utilityMock.noteLayout}>
          <div>
            <h1 style={utilityMock.title}>Trip notes</h1>
            <select style={utilityMock.tripSelect} value={trip.id} disabled>
              <option>{trip.name}</option>
            </select>
          </div>
          <button style={utilityMock.outlineBtn} onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm((value) => !value); }}>+ Add note</button>
        </section>

        <div style={utilityMock.noteTabs}>
          <button style={{ ...utilityMock.noteTab, ...(groupBy === "none" && filterBy === "all" ? utilityMock.noteTabActive : {}) }} onClick={() => { setGroupBy("none"); setFilterBy("all"); }}>All</button>
          <button style={{ ...utilityMock.noteTab, ...(groupBy === "date" ? utilityMock.noteTabActive : {}) }} onClick={() => setGroupBy("date")}>By day</button>
          <button style={{ ...utilityMock.noteTab, ...(groupBy === "stop" || filterBy === "stop" ? utilityMock.noteTabActive : {}) }} onClick={() => { setGroupBy("stop"); setFilterBy("stop"); }}>By stop</button>
        </div>

        {showForm && (
          <form style={utilityMock.noteForm} onSubmit={add}>
            <div style={utilityMock.noteFormGrid}>
              <input style={utilityMock.searchInput} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input style={utilityMock.searchInput} type="date" value={form.note_date} onChange={(e) => setForm({ ...form, note_date: e.target.value })} />
              <select style={utilityMock.smallSelect} value={form.stop_id} onChange={(e) => setForm({ ...form, stop_id: e.target.value })}>
                <option value="">Trip note</option>
                {stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.city_name}</option>)}
              </select>
            </div>
            <textarea style={utilityMock.textArea} placeholder="Write note details..." value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <div style={utilityMock.composerActions}>
              <button style={utilityMock.primaryBtn}>{editingId ? "Save note" : "Add note"}</button>
              <button type="button" style={utilityMock.outlineBtn} onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}>Cancel</button>
            </div>
          </form>
        )}

        <div style={utilityMock.noteList}>
          {Object.entries(groupedNotes).map(([group, groupNotes]) => (
            <section key={group || "all"}>
              {group && <p style={utilityMock.groupHeader}><strong>{group}</strong><span>{groupNotes.length}</span></p>}
              <div style={utilityMock.noteList}>
                {groupNotes.map((note) => (
                  <article style={utilityMock.noteCard} key={note.id}>
                    <div style={utilityMock.noteCardHead}>
                      <div>
                        <h2 style={utilityMock.noteTitle}>{note.title}</h2>
                        <div style={utilityMock.noteMeta}>
                          <span>{formatDate(note.note_date)}</span>
                          <span>{stopName(note.stop_id)}</span>
                        </div>
                      </div>
                      <div style={utilityMock.noteActions}>
                        <button style={utilityMock.noteIcon} onClick={() => edit(note)} aria-label="Edit note"><Icons.Pencil size={14} /></button>
                        <button style={utilityMock.noteIcon} onClick={() => remove(note.id)} aria-label="Delete note"><Icons.Trash2 size={14} /></button>
                      </div>
                    </div>
                    <p style={utilityMock.noteText}>{note.body}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {!visibleNotes.length && <EmptyState title="No notes found">Add a note or adjust your filters.</EmptyState>}
        </div>
      </main>
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
