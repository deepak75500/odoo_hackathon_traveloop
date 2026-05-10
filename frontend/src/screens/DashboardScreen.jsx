import { useState, useMemo } from "react";
import { assetUrl } from "../api.js";

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const money = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v ?? 0);

const formatDateRange = (s, e) => {
  if (!s) return "";
  const fmt = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return e ? `${fmt(s)} – ${fmt(e)}` : fmt(s);
};

const FALLBACK_BANNER =
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200&q=80";

const FALLBACK_CITY =
  "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&q=70";

const FALLBACK_TRIP =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=70";

/* Cost-index → colour badge */
const costTone = (idx) => {
  if (!idx) return { bg: "#e8f5e9", color: "#2e7d32" };
  if (idx < 1.5) return { bg: "#e8f5e9", color: "#2e7d32" };
  if (idx < 2.5) return { bg: "#fff8e1", color: "#f57f17" };
  return { bg: "#fce4ec", color: "#c62828" };
};

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function DashboardScreen({
  dashboard,
  trips,
  cities,
  setScreen,
  selectTrip,
}) {
  const user = dashboard?.user ?? {};
  const recentTrips = trips ?? dashboard?.recentTrips ?? [];
  const popularCities = cities ?? dashboard?.popularCities ?? [];

  /* Search / filter state */
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState("none");
  const [sortBy, setSortBy] = useState("date");
  const [filterOpen, setFilterOpen] = useState(false);
  const [regionFilter, setRegionFilter] = useState("all");

  /* Derived filtered cities */
  const filteredCities = useMemo(() => {
    let list = [...popularCities];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.country?.toLowerCase().includes(q) ||
          c.region?.toLowerCase().includes(q)
      );
    }
    if (regionFilter !== "all") {
      list = list.filter((c) => c.region?.toLowerCase() === regionFilter.toLowerCase());
    }
    if (sortBy === "cost") list.sort((a, b) => (a.cost_index ?? 0) - (b.cost_index ?? 0));
    else if (sortBy === "name") list.sort((a, b) => a.name?.localeCompare(b.name));
    else list.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    return list;
  }, [popularCities, query, regionFilter, sortBy]);

  /* Grouped trips */
  const displayedTrips = useMemo(() => {
    if (groupBy === "status") {
      const today = new Date().toISOString().slice(0, 10);
      const bucket = (t) => {
        if (t.end_date < today) return "Completed";
        if (t.start_date <= today) return "Ongoing";
        return "Upcoming";
      };
      const groups = {};
      recentTrips.forEach((t) => {
        const k = bucket(t);
        (groups[k] = groups[k] || []).push(t);
      });
      return groups;
    }
    return { "": recentTrips };
  }, [recentTrips, groupBy]);

  const regions = useMemo(
    () => ["all", ...new Set(popularCities.map((c) => c.region).filter(Boolean))],
    [popularCities]
  );

  const initials = (user.name ?? "T")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  /* ── JSX ── */
  return (
    <div style={styles.root}>
      {/* ── NAVBAR ── */}
      <nav style={styles.navbar}>
        <div style={styles.navBrand}>
          <span style={styles.navLogo}>✈</span>
          <span style={styles.navTitle}>Traveloop</span>
        </div>
        <button
          style={styles.avatar}
          onClick={() => setScreen?.("profile")}
          title={user.name ?? "Profile"}
        >
          {user.photo_url ? (
            <img src={assetUrl(user.photo_url)} alt="avatar" style={styles.avatarImg} />
          ) : (
            initials
          )}
        </button>
      </nav>

      {/* ── HERO BANNER ── */}
      <div style={styles.banner}>
        <img
          src={FALLBACK_BANNER}
          alt="Travel banner"
          style={styles.bannerImg}
          onError={(e) => (e.target.src = FALLBACK_BANNER)}
        />
        <div style={styles.bannerOverlay}>
          <h1 style={styles.bannerHeading}>
            Where to next,&nbsp;
            <span style={styles.bannerName}>{user.first_name ?? user.name ?? "traveler"}</span>?
          </h1>
          <p style={styles.bannerSub}>Your world, perfectly planned.</p>
        </div>
      </div>

      <div style={styles.body}>
        {/* ── SEARCH + CONTROLS ── */}
        <div style={styles.searchRow}>
          <div style={styles.searchWrap}>
            <span style={styles.searchIcon}>🔍</span>
            <input
              style={styles.searchInput}
              placeholder="Search cities, countries, regions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button style={styles.clearBtn} onClick={() => setQuery("")}>✕</button>
            )}
          </div>

          {/* Group by */}
          <div style={styles.controlGroup}>
            <label style={styles.controlLabel}>Group by</label>
            <select
              style={styles.controlSelect}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
            >
              <option value="none">None</option>
              <option value="status">Status</option>
            </select>
          </div>

          {/* Filter */}
          <div style={{ position: "relative" }}>
            <button
              style={{
                ...styles.controlBtn,
                background: filterOpen ? "#1a1a2e" : "#fff",
                color: filterOpen ? "#fff" : "#1a1a2e",
              }}
              onClick={() => setFilterOpen((v) => !v)}
            >
              ⚙ Filter
            </button>
            {filterOpen && (
              <div style={styles.filterDropdown}>
                <p style={styles.filterLabel}>Region</p>
                {regions.map((r) => (
                  <button
                    key={r}
                    style={{
                      ...styles.filterChip,
                      background: regionFilter === r ? "#1a1a2e" : "#f0f0f5",
                      color: regionFilter === r ? "#fff" : "#333",
                    }}
                    onClick={() => { setRegionFilter(r); setFilterOpen(false); }}
                  >
                    {r === "all" ? "All regions" : r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort by */}
          <div style={styles.controlGroup}>
            <label style={styles.controlLabel}>Sort by</label>
            <select
              style={styles.controlSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="date">Popularity</option>
              <option value="cost">Cost</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {/* ── TOP REGIONAL SELECTIONS ── */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Top Regional Selections</h2>
            <div style={styles.sectionLine} />
            <button
              style={styles.seeAll}
              onClick={() => setScreen?.("cities")}
            >
              See all →
            </button>
          </div>
          <div style={styles.cityRow}>
            {filteredCities.length === 0 ? (
              <p style={styles.empty}>No cities match your search.</p>
            ) : (
              filteredCities.slice(0, 5).map((city) => (
                <button
                  key={city.id}
                  style={styles.cityCard}
                  onClick={() => setScreen?.("cities")}
                >
                  <div style={styles.cityImgWrap}>
                    <img
                      src={city.image_url || FALLBACK_CITY}
                      alt={city.name}
                      style={styles.cityImg}
                      onError={(e) => (e.target.src = FALLBACK_CITY)}
                    />
                    <div style={styles.cityImgOverlay} />
                    <span
                      style={{
                        ...styles.costBadge,
                        ...costTone(city.cost_index),
                      }}
                    >
                      ${city.avg_meal_cost ?? "–"}/meal
                    </span>
                  </div>
                  <div style={styles.cityInfo}>
                    <strong style={styles.cityName}>{city.name}</strong>
                    <span style={styles.cityCountry}>{city.country}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* ── PREVIOUS TRIPS ── */}
        <section style={{ ...styles.section, paddingBottom: 80 }}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Previous Trips</h2>
            <div style={styles.sectionLine} />
            <button style={styles.seeAll} onClick={() => setScreen?.("trips")}>
              See all →
            </button>
          </div>

          {Object.entries(displayedTrips).map(([group, list]) => (
            <div key={group}>
              {group ? (
                <p style={styles.groupLabel}>{group}</p>
              ) : null}
              {list.length === 0 ? (
                <p style={styles.empty}>
                  No trips yet. Hit "+ Plan a trip" to get started!
                </p>
              ) : (
                <div style={styles.tripRow}>
                  {list.slice(0, 4).map((trip) => (
                    <button
                      key={trip.id}
                      style={styles.tripCard}
                      onClick={() => selectTrip?.(trip.id, "itinerary")}
                    >
                      <div style={styles.tripImgWrap}>
                        <img
                          src={trip.cover_photo || FALLBACK_TRIP}
                          alt={trip.name}
                          style={styles.tripImg}
                          onError={(e) => (e.target.src = FALLBACK_TRIP)}
                        />
                        <div style={styles.tripImgOverlay} />
                        <div style={styles.tripMeta}>
                          <span style={styles.tripStops}>
                            📍 {trip.destination_count ?? 0} stop
                            {trip.destination_count === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                      <div style={styles.tripInfo}>
                        <strong style={styles.tripName}>{trip.name}</strong>
                        <span style={styles.tripDates}>
                          {formatDateRange(trip.start_date, trip.end_date)}
                        </span>
                        {trip.budget_limit > 0 && (
                          <span style={styles.tripBudget}>
                            Budget: {money(trip.budget_limit)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>

      {/* ── FAB ── */}
      <button style={styles.fab} onClick={() => setScreen?.("create")}>
        <span style={styles.fabPlus}>+</span> Plan a trip
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
   STYLES
───────────────────────────────────────────── */
const styles = {
  root: {
    fontFamily: "'Nunito', 'Segoe UI', sans-serif",
    background: "#f7f7f9",
    minHeight: "100vh",
    position: "relative",
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
  navTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: "#1a1a2e",
    letterSpacing: "-0.5px",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    background: "#1a1a2e",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: 0,
  },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },

  /* Banner */
  banner: {
    position: "relative",
    height: 220,
    overflow: "hidden",
  },
  bannerImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  bannerOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 100%)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "0 32px",
  },
  bannerHeading: {
    margin: 0,
    color: "#fff",
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1.2,
    textShadow: "0 2px 8px rgba(0,0,0,0.3)",
  },
  bannerName: { color: "#ffd166" },
  bannerSub: {
    margin: "6px 0 0",
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontWeight: 400,
  },

  /* Body */
  body: { padding: "0 20px" },

  /* Search row */
  searchRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    margin: "18px 0 24px",
    flexWrap: "wrap",
  },
  searchWrap: {
    flex: 1,
    minWidth: 200,
    display: "flex",
    alignItems: "center",
    background: "#fff",
    border: "1.5px solid #e0e0e8",
    borderRadius: 10,
    padding: "0 12px",
    gap: 8,
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  searchIcon: { fontSize: 14, opacity: 0.5 },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    fontSize: 14,
    padding: "10px 0",
    background: "transparent",
    color: "#1a1a2e",
  },
  clearBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#999",
    fontSize: 13,
    padding: 0,
  },
  controlGroup: { display: "flex", flexDirection: "column", gap: 2 },
  controlLabel: { fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  controlSelect: {
    border: "1.5px solid #e0e0e8",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 13,
    background: "#fff",
    color: "#1a1a2e",
    cursor: "pointer",
    outline: "none",
  },
  controlBtn: {
    border: "1.5px solid #e0e0e8",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: 600,
    transition: "all 0.15s",
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  filterDropdown: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    background: "#fff",
    border: "1.5px solid #e0e0e8",
    borderRadius: 12,
    padding: 14,
    zIndex: 50,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    minWidth: 180,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  filterLabel: { margin: "0 0 4px", fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase" },
  filterChip: {
    border: "none",
    borderRadius: 7,
    padding: "7px 12px",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left",
    fontWeight: 500,
  },

  /* Section header */
  section: { marginBottom: 32 },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 800,
    color: "#1a1a2e",
    whiteSpace: "nowrap",
  },
  sectionLine: {
    flex: 1,
    height: 1,
    background: "linear-gradient(to right, #ddd, transparent)",
  },
  seeAll: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    color: "#5c6bc0",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    margin: "0 0 10px",
  },
  empty: { color: "#aaa", fontSize: 14, padding: "12px 0" },

  /* City cards */
  cityRow: {
    display: "flex",
    gap: 14,
    overflowX: "auto",
    paddingBottom: 8,
    scrollbarWidth: "none",
  },
  cityCard: {
    flex: "0 0 148px",
    background: "#fff",
    border: "none",
    borderRadius: 14,
    overflow: "hidden",
    cursor: "pointer",
    boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
    transition: "transform 0.18s, box-shadow 0.18s",
    textAlign: "left",
    padding: 0,
    display: "flex",
    flexDirection: "column",
  },
  cityImgWrap: {
    position: "relative",
    height: 130,
    overflow: "hidden",
    background: "#eee",
  },
  cityImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  cityImgOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(to top, rgba(0,0,0,0.25), transparent 50%)",
  },
  costBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    borderRadius: 6,
    padding: "2px 7px",
    fontSize: 10,
    fontWeight: 700,
  },
  cityInfo: {
    padding: "10px 10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  cityName: { fontSize: 13, fontWeight: 800, color: "#1a1a2e" },
  cityCountry: { fontSize: 11, color: "#888", fontWeight: 500 },

  /* Trip cards */
  tripRow: {
    display: "flex",
    gap: 16,
    overflowX: "auto",
    paddingBottom: 8,
    scrollbarWidth: "none",
  },
  tripCard: {
    flex: "0 0 200px",
    background: "#fff",
    border: "none",
    borderRadius: 14,
    overflow: "hidden",
    cursor: "pointer",
    boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
    transition: "transform 0.18s, box-shadow 0.18s",
    textAlign: "left",
    padding: 0,
    display: "flex",
    flexDirection: "column",
  },
  tripImgWrap: {
    position: "relative",
    height: 160,
    overflow: "hidden",
    background: "#ddd",
  },
  tripImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  tripImgOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(to top, rgba(0,0,0,0.45), transparent 55%)",
  },
  tripMeta: {
    position: "absolute",
    bottom: 8,
    left: 10,
    right: 10,
  },
  tripStops: {
    fontSize: 11,
    color: "#fff",
    fontWeight: 600,
    textShadow: "0 1px 3px rgba(0,0,0,0.4)",
  },
  tripInfo: {
    padding: "10px 12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  tripName: { fontSize: 14, fontWeight: 800, color: "#1a1a2e", lineHeight: 1.3 },
  tripDates: { fontSize: 12, color: "#888", fontWeight: 500 },
  tripBudget: {
    fontSize: 11,
    color: "#5c6bc0",
    fontWeight: 700,
    marginTop: 2,
  },

  /* FAB */
  fab: {
    position: "fixed",
    bottom: 24,
    right: 24,
    background: "#1a1a2e",
    color: "#fff",
    border: "none",
    borderRadius: 30,
    padding: "12px 22px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 6px 20px rgba(26,26,46,0.35)",
    zIndex: 200,
    letterSpacing: 0.2,
  },
  fabPlus: { fontSize: 20, lineHeight: 1, fontWeight: 300 },
};
