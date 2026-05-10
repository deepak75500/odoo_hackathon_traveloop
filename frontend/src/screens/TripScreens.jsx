import { useState, useEffect, useCallback } from "react";

/* ─── helpers ─── */
const money = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v ?? 0);

const formatDate = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

const FALLBACK = "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=70";
const API_BASE = "http://localhost:8082";

/* ─── CreateTripScreen ─── */
const initialTrip = {
  name: "",
  start_date: "",
  end_date: "",
  budget_limit: 2500,
  cover_photo: "",
  description: "",
};

export function CreateTripScreen({ onCreate, cities: propCities = [], activities: propActivities = [], user, setScreen, token }) {
  const [form, setForm] = useState(initialTrip);
  const [selectedCity, setSelectedCity] = useState(null);
  const [cityQuery, setCityQuery] = useState("");
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* ── live city list from /api/cities ── */
  const [allCities, setAllCities] = useState(propCities);
  useEffect(() => {
    if (propCities.length > 0) { setAllCities(propCities); return; }
    fetch(`${API_BASE}/api/cities`)
      .then((r) => r.json())
      .then((d) => setAllCities(d.cities ?? []))
      .catch(() => {});
  }, []);

  /* ── activities fetched from /api/activities?city_id=X when city chosen ── */
  const [cityActivities, setCityActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  const fetchActivities = useCallback(async (cityId) => {
    setActivitiesLoading(true);
    setCityActivities([]);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/api/activities?city_id=${cityId}`, { headers });
      const data = await res.json();
      setCityActivities(data.activities ?? []);
    } catch {
      setCityActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  }, [token]);

  /* on mount — show popular activities (no city filter) */
  useEffect(() => {
    if (propActivities.length > 0) { setCityActivities(propActivities.slice(0, 6)); return; }
    setActivitiesLoading(true);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${API_BASE}/api/activities`, { headers })
      .then((r) => r.json())
      .then((d) => setCityActivities((d.activities ?? []).slice(0, 6)))
      .catch(() => {})
      .finally(() => setActivitiesLoading(false));
  }, []);

  const update = (field, value) => setForm((cur) => ({ ...cur, [field]: value }));

  /* city dropdown filter */
  const filteredCities = allCities.filter(
    (c) =>
      c.name.toLowerCase().includes(cityQuery.toLowerCase()) ||
      c.country.toLowerCase().includes(cityQuery.toLowerCase())
  ).slice(0, 6);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onCreate({
        ...form,
        name: form.name || selectedCity?.name || "My Trip",
      });
      setForm(initialTrip);
      setSelectedCity(null);
      setCityQuery("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const initials = (user?.name ?? "T")
    .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={cs.root}>
      {/* ── NAVBAR ── */}
      <nav style={cs.navbar}>
        <div style={cs.navBrand}>
          <span style={cs.navLogo}>✈</span>
          <span style={cs.navTitle}>Traveloop</span>
        </div>
        <button style={cs.avatar} onClick={() => setScreen?.("profile")} title={user?.name}>
          {user?.photo_url
            ? <img src={user.photo_url} alt="avatar" style={cs.avatarImg} />
            : initials}
        </button>
      </nav>

      <div style={cs.body}>
        {/* ── PLAN FORM PANEL ── */}
        <section style={cs.panel}>
          <div style={cs.panelHeader}>
            <h2 style={cs.panelTitle}>Plan a new trip</h2>
          </div>

          <form onSubmit={submit} style={cs.form}>
            {/* Trip Name */}
            <div style={cs.fieldRow}>
              <label style={cs.label}>Trip Name:</label>
              <input
                style={cs.input}
                placeholder="Give your trip a name…"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>

            {/* Select a Place */}
            <div style={cs.fieldRow}>
              <label style={cs.label}>Select a Place:</label>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  style={cs.input}
                  placeholder="Search cities…"
                  value={cityQuery}
                  onChange={(e) => {
                    setCityQuery(e.target.value);
                    setShowCitySuggestions(true);
                    setSelectedCity(null);
                  }}
                  onFocus={() => setShowCitySuggestions(true)}
                  onBlur={() => setTimeout(() => setShowCitySuggestions(false), 180)}
                />
                {showCitySuggestions && filteredCities.length > 0 && (
                  <div style={cs.dropdown}>
                    {filteredCities.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        style={cs.dropdownItem}
                        onMouseDown={() => {
                          setSelectedCity(c);
                          setCityQuery(`${c.name}, ${c.country}`);
                          setShowCitySuggestions(false);
                          if (!form.name) update("name", `Trip to ${c.name}`);
                          fetchActivities(c.id);
                        }}
                      >
                        <span style={cs.dropdownCity}>{c.name}</span>
                        <span style={cs.dropdownCountry}>{c.country} · {c.region}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Start Date */}
            <div style={cs.fieldRow}>
              <label style={cs.label}>Start Date:</label>
              <input
                style={cs.input}
                type="date"
                value={form.start_date}
                onChange={(e) => update("start_date", e.target.value)}
                required
              />
            </div>

            {/* End Date */}
            <div style={cs.fieldRow}>
              <label style={cs.label}>End Date:</label>
              <input
                style={cs.input}
                type="date"
                value={form.end_date}
                min={form.start_date}
                onChange={(e) => update("end_date", e.target.value)}
                required
              />
            </div>

            {/* Budget */}
            <div style={cs.fieldRow}>
              <label style={cs.label}>Budget ($):</label>
              <input
                style={cs.input}
                type="number"
                min="0"
                placeholder="e.g. 2500"
                value={form.budget_limit}
                onChange={(e) => update("budget_limit", e.target.value)}
              />
            </div>

            {/* Description */}
            <div style={{ ...cs.fieldRow, alignItems: "flex-start" }}>
              <label style={{ ...cs.label, paddingTop: 10 }}>Description:</label>
              <textarea
                style={{ ...cs.input, resize: "vertical", minHeight: 90, lineHeight: 1.5 }}
                placeholder="What's this trip about? Add some notes…"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </div>

            {error && <p style={cs.errorText}>{error}</p>}

            <div style={cs.formActions}>
              <button type="button" style={cs.cancelBtn} onClick={() => setScreen?.("dashboard")}>
                Cancel
              </button>
              <button type="submit" style={cs.submitBtn} disabled={loading}>
                {loading ? "Saving…" : "✈  Create Trip"}
              </button>
            </div>
          </form>
        </section>

        {/* ── SUGGESTIONS PANEL ── */}
        <section style={cs.suggestPanel}>
          <div style={cs.suggestHeader}>
            <span style={cs.suggestIcon}>🗺</span>
            <h3 style={cs.suggestTitle}>
              Suggestions for Places to Visit / Activities to Perform
              {selectedCity && (
                <span style={cs.suggestCity}> — {selectedCity.name}</span>
              )}
            </h3>
          </div>

          <div style={cs.cardGrid}>
            {activitiesLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={cs.skeleton}>
                  <div style={cs.skeletonImg} />
                  <div style={cs.skeletonBody}>
                    <div style={{ ...cs.skeletonLine, width: "70%" }} />
                    <div style={{ ...cs.skeletonLine, width: "45%", height: 10 }} />
                  </div>
                </div>
              ))
            ) : cityActivities.length > 0 ? (
              cityActivities.slice(0, 6).map((act) => (
                <div key={act.id} style={cs.suggestCard}>
                  <div style={cs.suggestImgWrap}>
                    <img
                      src={act.image_url || FALLBACK}
                      alt={act.name}
                      style={cs.suggestImg}
                      onError={(e) => (e.target.src = FALLBACK)}
                    />
                    <div style={cs.suggestOverlay} />
                    <span style={cs.categoryBadge}>{act.category}</span>
                    {act.city_name && (
                      <span style={cs.cityBadge}>📍 {act.city_name}</span>
                    )}
                  </div>
                  <div style={cs.suggestInfo}>
                    <strong style={cs.suggestName}>{act.name}</strong>
                    <div style={cs.suggestMeta}>
                      <span style={cs.suggestCost}>${act.cost ?? 0}</span>
                      <span style={cs.suggestDur}>⏱ {act.duration_hours}h</span>
                    </div>
                    {act.description && (
                      <p style={cs.suggestDesc}>{act.description}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p style={{ gridColumn: "1/-1", color: "#aaa", fontSize: 14, padding: "20px 0" }}>
                No activities found. Try selecting a city above.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── TripListScreen ─── */
export function TripListScreen({ trips, selectTrip, removeTrip, setScreen, user }) {
  const initials = (user?.name ?? "T")
    .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={cs.root}>
      {/* NAVBAR */}
      <nav style={cs.navbar}>
        <div style={cs.navBrand}>
          <span style={cs.navLogo}>✈</span>
          <span style={cs.navTitle}>Traveloop</span>
        </div>
        <button style={cs.avatar} onClick={() => setScreen?.("profile")}>
          {user?.photo_url
            ? <img src={user.photo_url} alt="avatar" style={cs.avatarImg} />
            : initials}
        </button>
      </nav>

      <div style={cs.body}>
        <div style={cs.listHeader}>
          <div>
            <p style={cs.listEyebrow}>My Trips</p>
            <h2 style={cs.listTitle}>Your Travel Plans</h2>
          </div>
          <button style={cs.submitBtn} onClick={() => setScreen?.("create")}>
            + New Trip
          </button>
        </div>

        {trips && trips.length > 0 ? (
          <div style={cs.tripGrid}>
            {trips.map((trip) => (
              <article key={trip.id} style={cs.tripCard}>
                <div style={cs.tripImgWrap}>
                  <img
                    src={trip.cover_photo || FALLBACK}
                    alt={trip.name}
                    style={cs.tripImg}
                    onError={(e) => (e.target.src = FALLBACK)}
                  />
                  <div style={cs.tripOverlay} />
                  <span style={cs.tripStops}>
                    📍 {trip.destination_count ?? 0} stop{trip.destination_count === 1 ? "" : "s"}
                  </span>
                </div>
                <div style={cs.tripInfo}>
                  <strong style={cs.tripName}>{trip.name}</strong>
                  <span style={cs.tripDates}>
                    {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                  </span>
                  {trip.budget_limit > 0 && (
                    <span style={cs.tripBudget}>Budget: {money(trip.budget_limit)}</span>
                  )}
                  {trip.description && (
                    <p style={cs.tripDesc}>{trip.description}</p>
                  )}
                </div>
                <div style={cs.tripActions}>
                  <button style={cs.actionBtn} onClick={() => selectTrip?.(trip.id, "itinerary")}>
                    View
                  </button>
                  <button style={cs.actionBtn} onClick={() => selectTrip?.(trip.id, "builder")}>
                    Edit
                  </button>
                  <button
                    style={{ ...cs.actionBtn, ...cs.dangerBtn }}
                    onClick={() => removeTrip?.(trip.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div style={cs.emptyState}>
            <span style={{ fontSize: 48 }}>🗺</span>
            <h3 style={{ margin: "12px 0 4px", color: "#1a1a2e", fontSize: 18, fontWeight: 800 }}>
              No trips yet
            </h3>
            <p style={{ color: "#888", marginBottom: 20, fontSize: 14 }}>
              Create your first itinerary to start planning.
            </p>
            <button style={cs.submitBtn} onClick={() => setScreen?.("create")}>
              + Create Trip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   STYLES
───────────────────────────────────────────── */
const cs = {
  root: {
    fontFamily: "'Nunito', 'Segoe UI', sans-serif",
    background: "#f7f7f9",
    minHeight: "100vh",
  },

  /* Navbar */
  navbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    height: 56,
    background: "#fff",
    borderBottom: "1px solid #ececec",
    position: "sticky",
    top: 0,
    zIndex: 100,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  navBrand: { display: "flex", alignItems: "center", gap: 8 },
  navLogo: { fontSize: 22 },
  navTitle: { fontSize: 20, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.5px" },
  avatar: {
    width: 38, height: 38, borderRadius: "50%",
    background: "#1a1a2e", color: "#fff",
    border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14,
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", padding: 0,
  },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },

  /* Body */
  body: { padding: "20px 20px 60px", maxWidth: 860, margin: "0 auto" },

  /* Plan form panel */
  panel: {
    background: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
    marginBottom: 20,
    border: "1px solid #ececec",
  },
  panelHeader: {
    background: "#1a1a2e",
    padding: "14px 20px",
  },
  panelTitle: {
    margin: 0,
    color: "#fff",
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: 0.3,
  },

  /* Form */
  form: { padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 14 },
  fieldRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  label: {
    width: 120,
    textAlign: "right",
    fontSize: 13,
    fontWeight: 700,
    color: "#555",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    border: "1.5px solid #e0e0e8",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
    color: "#1a1a2e",
    outline: "none",
    background: "#fafafa",
    transition: "border-color 0.15s",
  },
  dropdown: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    background: "#fff",
    border: "1.5px solid #e0e0e8",
    borderRadius: 10,
    zIndex: 50,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    overflow: "hidden",
  },
  dropdownItem: {
    width: "100%",
    border: "none",
    background: "none",
    padding: "10px 14px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    textAlign: "left",
    borderBottom: "1px solid #f0f0f5",
  },
  dropdownCity: { fontSize: 14, fontWeight: 700, color: "#1a1a2e" },
  dropdownCountry: { fontSize: 12, color: "#888" },
  errorText: { color: "#e53935", fontSize: 13, margin: 0 },
  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    background: "none",
    border: "1.5px solid #e0e0e8",
    borderRadius: 10,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 700,
    color: "#888",
    cursor: "pointer",
  },
  submitBtn: {
    background: "#1a1a2e",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 0.3,
  },

  /* Suggestions panel */
  suggestPanel: {
    background: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
    border: "1px solid #ececec",
  },
  suggestHeader: {
    padding: "14px 20px",
    borderBottom: "1px solid #f0f0f5",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  suggestIcon: { fontSize: 20 },
  suggestTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: "#1a1a2e",
  },
  suggestCity: { color: "#5c6bc0", fontWeight: 800 },

  /* 3-col grid */
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    padding: 20,
  },
  suggestCard: {
    borderRadius: 12,
    overflow: "hidden",
    border: "1.5px solid #ececec",
    background: "#fafafa",
    cursor: "default",
    transition: "transform 0.15s, box-shadow 0.15s",
  },
  suggestImgWrap: {
    position: "relative",
    height: 130,
    background: "#eee",
    overflow: "hidden",
  },
  suggestImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  suggestOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(to top, rgba(0,0,0,0.35), transparent 55%)",
  },
  categoryBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    background: "rgba(26,26,46,0.8)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 20,
    textTransform: "capitalize",
    backdropFilter: "blur(4px)",
  },
  suggestInfo: { padding: "10px 12px 12px" },
  suggestName: { fontSize: 13, fontWeight: 800, color: "#1a1a2e", display: "block", marginBottom: 6 },
  suggestMeta: { display: "flex", gap: 10, alignItems: "center" },
  suggestCost: { fontSize: 12, fontWeight: 700, color: "#5c6bc0" },
  suggestDur: { fontSize: 11, color: "#888" },

  /* Skeleton */
  skeleton: {
    borderRadius: 12,
    overflow: "hidden",
    border: "1.5px solid #ececec",
    background: "#fafafa",
  },
  skeletonImg: {
    height: 130,
    background: "linear-gradient(90deg, #f0f0f5 25%, #e4e4ee 50%, #f0f0f5 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s infinite",
  },
  skeletonBody: { padding: "10px 12px 14px", display: "flex", flexDirection: "column", gap: 8 },
  skeletonLine: {
    height: 13,
    borderRadius: 6,
    background: "linear-gradient(90deg, #f0f0f5 25%, #e4e4ee 50%, #f0f0f5 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s infinite",
  },
  cityBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    background: "rgba(92,107,192,0.9)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 20,
    backdropFilter: "blur(4px)",
  },
  suggestDesc: {
    fontSize: 11,
    color: "#888",
    margin: "4px 0 0",
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },

  /* Trip list */
  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 20,
  },
  listEyebrow: { margin: "0 0 2px", fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8 },
  listTitle: { margin: 0, fontSize: 24, fontWeight: 800, color: "#1a1a2e" },
  tripGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 18,
  },
  tripCard: {
    background: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
    border: "1px solid #ececec",
    display: "flex",
    flexDirection: "column",
  },
  tripImgWrap: { position: "relative", height: 170, overflow: "hidden", background: "#ddd" },
  tripImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  tripOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(to top, rgba(0,0,0,0.45), transparent 55%)",
  },
  tripStops: {
    position: "absolute",
    bottom: 10,
    left: 12,
    fontSize: 11,
    color: "#fff",
    fontWeight: 600,
    textShadow: "0 1px 3px rgba(0,0,0,0.4)",
  },
  tripInfo: { padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 4 },
  tripName: { fontSize: 15, fontWeight: 800, color: "#1a1a2e" },
  tripDates: { fontSize: 12, color: "#888" },
  tripBudget: { fontSize: 12, color: "#5c6bc0", fontWeight: 700 },
  tripDesc: { fontSize: 12, color: "#666", margin: "4px 0 0", lineHeight: 1.4 },
  tripActions: {
    display: "flex",
    gap: 8,
    padding: "10px 14px 14px",
    borderTop: "1px solid #f0f0f5",
  },
  actionBtn: {
    flex: 1,
    background: "#f0f0f5",
    border: "none",
    borderRadius: 8,
    padding: "8px 0",
    fontSize: 12,
    fontWeight: 700,
    color: "#1a1a2e",
    cursor: "pointer",
  },
  dangerBtn: { background: "#fce4ec", color: "#c62828" },

  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
    background: "#fff",
    borderRadius: 16,
    border: "1px solid #ececec",
  },
};