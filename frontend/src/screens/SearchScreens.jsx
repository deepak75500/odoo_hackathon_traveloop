import { useEffect, useState, useMemo } from "react";

/* ─── constants ─── */
const API_BASE = "http://localhost:8082";
const FALLBACK = "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600&q=70";
const ACT_FALLBACK = "https://images.unsplash.com/photo-1526772662000-3f88f10405ff?w=600&q=70";

const money = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v ?? 0);

const shortDate = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

/* ─── shared toolbar ─── */
function SearchToolbar({ query, setQuery, placeholder, groupOptions, groupBy, setGroupBy, filterContent, sortOptions, sortBy, setSortBy }) {
  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <div style={s.toolbar}>
      {/* Search input */}
      <div style={s.searchWrap}>
        <span style={s.searchIcon}>🔍</span>
        <input
          style={s.searchInput}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button style={s.clearBtn} onClick={() => setQuery("")}>✕</button>
        )}
      </div>

      {/* Group by */}
      {groupOptions?.length > 0 && (
        <div style={s.controlGroup}>
          <label style={s.controlLabel}>Group by</label>
          <select style={s.controlSelect} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="">None</option>
            {groupOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      {/* Filter */}
      {filterContent && (
        <div style={{ position: "relative" }}>
          <button
            style={{ ...s.controlBtn, background: filterOpen ? "#1a1a2e" : "#fff", color: filterOpen ? "#fff" : "#1a1a2e" }}
            onClick={() => setFilterOpen((v) => !v)}
          >
            ⚙ Filter
          </button>
          {filterOpen && (
            <div style={s.filterDropdown}>
              {filterContent({ close: () => setFilterOpen(false) })}
            </div>
          )}
        </div>
      )}

      {/* Sort by */}
      {sortOptions?.length > 0 && (
        <div style={s.controlGroup}>
          <label style={s.controlLabel}>Sort by</label>
          <select style={s.controlSelect} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   CITY SEARCH
════════════════════════════════════════════ */
export function CitySearchScreen({ trip, cities: propCities = [], setCities, refreshTrip, saveCity, token, user, setScreen }) {
  const [allCities, setAllCities] = useState(propCities);
  const [savedIds, setSavedIds] = useState(new Set());
  const [addedIds, setAddedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);

  /* toolbar state */
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [sortBy, setSortBy] = useState("popularity");
  const [regionFilter, setRegionFilter] = useState("");
  const [maxCost, setMaxCost] = useState("");

  const headers = useMemo(() => token ? { Authorization: `Bearer ${token}` } : {}, [token]);

  /* load cities */
  useEffect(() => {
    if (propCities.length > 0) { setAllCities(propCities); return; }
    setLoading(true);
    fetch(`${API_BASE}/api/cities`, { headers })
      .then((r) => r.json())
      .then((d) => { setAllCities(d.cities ?? []); setCities?.(d.cities ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* load saved city ids */
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/saved`, { headers })
      .then((r) => r.json())
      .then((d) => setSavedIds(new Set((d.cities ?? []).map((c) => c.id))))
      .catch(() => {});
  }, [token]);

  /* add city as stop */
  async function addToTrip(city) {
    if (!trip) return;
    const last = trip.stops?.[trip.stops.length - 1];
    const start = last?.end_date || trip.start_date;
    await fetch(`${API_BASE}/api/trips/${trip.id}/stops`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ city_id: city.id, start_date: start, end_date: start, transport_cost: city.cost_index * 2, notes: city.description }),
    });
    setAddedIds((prev) => new Set([...prev, city.id]));
    refreshTrip?.();
  }

  /* save/unsave city */
  async function toggleSave(cityId) {
    const isSaved = savedIds.has(cityId);
    if (isSaved) {
      await fetch(`${API_BASE}/api/saved/${cityId}`, { method: "DELETE", headers });
      setSavedIds((prev) => { const n = new Set(prev); n.delete(cityId); return n; });
    } else {
      await fetch(`${API_BASE}/api/saved`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ city_id: cityId }),
      });
      setSavedIds((prev) => new Set([...prev, cityId]));
    }
    saveCity?.(cityId);
  }

  /* derived list */
  const regions = useMemo(() => [...new Set(allCities.map((c) => c.region).filter(Boolean))], [allCities]);

  const filtered = useMemo(() => {
    let list = [...allCities];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((c) => c.name?.toLowerCase().includes(q) || c.country?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
    }
    if (regionFilter) list = list.filter((c) => c.region === regionFilter);
    if (maxCost) list = list.filter((c) => (c.cost_index ?? 0) <= parseFloat(maxCost));
    if (sortBy === "name") list.sort((a, b) => a.name?.localeCompare(b.name));
    else if (sortBy === "cost_asc") list.sort((a, b) => (a.cost_index ?? 0) - (b.cost_index ?? 0));
    else if (sortBy === "cost_desc") list.sort((a, b) => (b.cost_index ?? 0) - (a.cost_index ?? 0));
    else list.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    return list;
  }, [allCities, query, regionFilter, maxCost, sortBy]);

  /* grouped */
  const grouped = useMemo(() => {
    if (!groupBy) return { "": filtered };
    const map = {};
    filtered.forEach((c) => {
      const key = groupBy === "region" ? (c.region || "Other") : groupBy === "country" ? c.country : "All";
      (map[key] = map[key] || []).push(c);
    });
    return map;
  }, [filtered, groupBy]);

  const initials = (user?.name ?? "T").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={s.root}>
      <nav style={s.navbar}>
        <div style={s.navBrand}><span style={s.navLogo}>✈</span><span style={s.navTitle}>Traveloop</span></div>
        <button style={s.avatar} onClick={() => setScreen?.("profile")}>
          {user?.photo_url ? <img src={user.photo_url} alt="av" style={s.avatarImg} /> : initials}
        </button>
      </nav>

      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <p style={s.eyebrow}>City Search</p>
            <h1 style={s.pageTitle}>Search places to visit</h1>
          </div>
          {trip && <span style={s.activeTripBadge}>📋 Active: {trip.name}</span>}
        </div>

        <SearchToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search city, country, or description…"
          groupOptions={[{ value: "region", label: "Region" }, { value: "country", label: "Country" }]}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          sortOptions={[
            { value: "popularity", label: "Popularity" },
            { value: "name", label: "Name A–Z" },
            { value: "cost_asc", label: "Cost ↑" },
            { value: "cost_desc", label: "Cost ↓" },
          ]}
          sortBy={sortBy}
          setSortBy={setSortBy}
          filterContent={({ close }) => (
            <>
              <p style={s.filterHeading}>Region</p>
              {["", ...regions].map((r) => (
                <button key={r} style={{ ...s.filterChip, background: regionFilter === r ? "#1a1a2e" : "#f0f0f5", color: regionFilter === r ? "#fff" : "#333" }}
                  onClick={() => { setRegionFilter(r); close(); }}>
                  {r || "All regions"}
                </button>
              ))}
              <p style={{ ...s.filterHeading, marginTop: 12 }}>Max cost index</p>
              <input
                style={{ ...s.searchInput, border: "1.5px solid #e0e0e8", borderRadius: 8, padding: "7px 10px", fontSize: 13 }}
                type="number" min="0" step="0.5" placeholder="e.g. 2.5"
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
              />
            </>
          )}
        />

        {loading ? (
          <div style={s.cityGrid}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} style={s.skeletonCard} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={s.emptyState}><span style={{ fontSize: 40 }}>🗺</span><p>No cities match your search.</p></div>
        ) : (
          Object.entries(grouped).map(([group, list]) => (
            <div key={group}>
              {group && <p style={s.groupLabel}>{group}</p>}
              <div style={s.cityGrid}>
                {list.map((city) => (
                  <article key={city.id} style={s.cityCard}>
                    <div style={s.cityImgWrap}>
                      <img src={city.image_url || FALLBACK} alt={city.name} style={s.cityImg} onError={(e) => (e.target.src = FALLBACK)} />
                      <div style={s.cityImgOverlay} />
                      <span style={s.regionBadge}>{city.region}</span>
                      <span style={{ ...s.costBadge, ...(city.cost_index < 1.5 ? s.cheap : city.cost_index < 2.5 ? s.mid : s.pricey) }}>
                        idx {city.cost_index}
                      </span>
                    </div>
                    <div style={s.cityBody}>
                      <div style={s.cityMeta}>
                        <strong style={s.cityName}>{city.name}</strong>
                        <span style={s.cityCountry}>{city.country}</span>
                      </div>
                      {city.description && <p style={s.cityDesc}>{city.description}</p>}
                      <div style={s.cityStats}>
                        <span style={s.statPill}>🏨 ${city.avg_hotel_cost}/night</span>
                        <span style={s.statPill}>🍽 ${city.avg_meal_cost}/meal</span>
                        <span style={s.statPill}>⭐ {city.popularity}</span>
                      </div>
                    </div>
                    <div style={s.cardActions}>
                      <button style={s.addBtn} disabled={!trip || addedIds.has(city.id)} onClick={() => addToTrip(city)}>
                        {addedIds.has(city.id) ? "✓ Added" : "+ Add to Trip"}
                      </button>
                      <button style={{ ...s.saveBtn, background: savedIds.has(city.id) ? "#e8f5e9" : "#f0f0f5", color: savedIds.has(city.id) ? "#2e7d32" : "#555" }}
                        onClick={() => toggleSave(city.id)}>
                        {savedIds.has(city.id) ? "♥ Saved" : "♡ Save"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   ACTIVITY SEARCH
════════════════════════════════════════════ */
export function ActivitySearchScreen({ trip, refreshTrip, token, user, setScreen }) {
  const stops = trip?.stops || [];
  const [stopId, setStopId] = useState("");
  const [activities, setActivities] = useState([]);
  const [addedIds, setAddedIds] = useState(new Set());
  const [actLoading, setActLoading] = useState(false);

  /* toolbar */
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [sortBy, setSortBy] = useState("cost_asc");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [maxCost, setMaxCost] = useState("");

  const headers = useMemo(() => token ? { Authorization: `Bearer ${token}` } : {}, [token]);
  const stop = stops.find((item) => String(item.id) === String(stopId));

  useEffect(() => { if (!stopId && stops[0]) setStopId(String(stops[0].id)); }, [trip?.id, stops.length]);

  useEffect(() => {
    if (!stop) return;
    setActLoading(true);
    const params = new URLSearchParams({ city_id: stop.city_id });
    if (categoryFilter) params.set("category", categoryFilter);
    if (maxCost) params.set("max_cost", maxCost);
    fetch(`${API_BASE}/api/activities?${params}`, { headers })
      .then((r) => r.json())
      .then((d) => setActivities(d.activities ?? []))
      .catch(() => {})
      .finally(() => setActLoading(false));
  }, [stop?.id, categoryFilter, maxCost]);

  async function addActivity(activity) {
    await fetch(`${API_BASE}/api/stops/${stopId}/activities`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ activity_id: activity.id, activity_date: stop.start_date, start_time: "09:00", custom_cost: activity.cost }),
    });
    setAddedIds((prev) => new Set([...prev, activity.id]));
    refreshTrip?.();
  }

  const CATS = ["Sightseeing", "Culture", "Food", "Adventure", "Entertainment"];

  const filtered = useMemo(() => {
    let list = [...activities];
    if (query) { const q = query.toLowerCase(); list = list.filter((a) => a.name?.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q)); }
    if (sortBy === "cost_asc") list.sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
    else if (sortBy === "cost_desc") list.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
    else if (sortBy === "duration") list.sort((a, b) => (a.duration_hours ?? 0) - (b.duration_hours ?? 0));
    else list.sort((a, b) => a.name?.localeCompare(b.name));
    return list;
  }, [activities, query, sortBy]);

  const grouped = useMemo(() => {
    if (!groupBy) return { "": filtered };
    const map = {};
    filtered.forEach((a) => { const key = a.category || "Other"; (map[key] = map[key] || []).push(a); });
    return map;
  }, [filtered, groupBy]);

  const initials = (user?.name ?? "T").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  if (!trip || !stops.length) {
    return (
      <div style={s.root}>
        <nav style={s.navbar}>
          <div style={s.navBrand}><span style={s.navLogo}>✈</span><span style={s.navTitle}>Traveloop</span></div>
        </nav>
        <div style={{ ...s.emptyState, margin: 40 }}>
          <span style={{ fontSize: 40 }}>📍</span>
          <p style={{ color: "#888", marginTop: 8 }}>Add a trip stop first. Activities are linked to a city stop.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <nav style={s.navbar}>
        <div style={s.navBrand}><span style={s.navLogo}>✈</span><span style={s.navTitle}>Traveloop</span></div>
        <button style={s.avatar} onClick={() => setScreen?.("profile")}>
          {user?.photo_url ? <img src={user.photo_url} alt="av" style={s.avatarImg} /> : initials}
        </button>
      </nav>

      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <p style={s.eyebrow}>Activity Search</p>
            <h1 style={s.pageTitle}>Find things to do</h1>
          </div>
          {/* Stop selector */}
          <select style={s.stopSelect} value={stopId} onChange={(e) => setStopId(e.target.value)}>
            {stops.map((st) => (
              <option key={st.id} value={st.id}>{st.city_name} ({shortDate(st.start_date)})</option>
            ))}
          </select>
        </div>

        <SearchToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search activities…"
          groupOptions={[{ value: "category", label: "Category" }]}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          sortOptions={[
            { value: "cost_asc", label: "Cost ↑" },
            { value: "cost_desc", label: "Cost ↓" },
            { value: "duration", label: "Duration" },
            { value: "name", label: "Name A–Z" },
          ]}
          sortBy={sortBy}
          setSortBy={setSortBy}
          filterContent={({ close }) => (
            <>
              <p style={s.filterHeading}>Category</p>
              {["", ...CATS].map((c) => (
                <button key={c} style={{ ...s.filterChip, background: categoryFilter === c ? "#1a1a2e" : "#f0f0f5", color: categoryFilter === c ? "#fff" : "#333" }}
                  onClick={() => { setCategoryFilter(c); close(); }}>
                  {c || "All categories"}
                </button>
              ))}
              <p style={{ ...s.filterHeading, marginTop: 12 }}>Max cost ($)</p>
              <input style={{ ...s.searchInput, border: "1.5px solid #e0e0e8", borderRadius: 8, padding: "7px 10px", fontSize: 13 }}
                type="number" min="0" placeholder="e.g. 50" value={maxCost} onChange={(e) => setMaxCost(e.target.value)} />
            </>
          )}
        />

        {actLoading ? (
          <div style={s.actGrid}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} style={s.skeletonCard} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={s.emptyState}><span style={{ fontSize: 40 }}>🎯</span><p>No activities found for this stop.</p></div>
        ) : (
          Object.entries(grouped).map(([group, list]) => (
            <div key={group}>
              {group && <p style={s.groupLabel}>{group}</p>}
              <div style={s.actGrid}>
                {list.map((act) => (
                  <article key={act.id} style={s.actCard}>
                    <div style={s.actImgWrap}>
                      <img src={act.image_url || ACT_FALLBACK} alt={act.name} style={s.actImg} onError={(e) => (e.target.src = ACT_FALLBACK)} />
                      <div style={s.cityImgOverlay} />
                      <span style={s.regionBadge}>{act.category}</span>
                    </div>
                    <div style={s.actBody}>
                      <strong style={s.cityName}>{act.name}</strong>
                      <div style={s.cityStats}>
                        <span style={s.statPill}>⏱ {act.duration_hours}h</span>
                        <span style={s.statPill}>📍 {act.city_name}</span>
                      </div>
                      {act.description && <p style={s.cityDesc}>{act.description}</p>}
                    </div>
                    <div style={s.cardActions}>
                      <span style={s.actCost}>{money(act.cost)}</span>
                      <button style={{ ...s.addBtn, opacity: addedIds.has(act.id) ? 0.6 : 1 }}
                        disabled={addedIds.has(act.id)} onClick={() => addActivity(act)}>
                        {addedIds.has(act.id) ? "✓ Added" : "+ Add"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   COMMUNITY
════════════════════════════════════════════ */
export function CommunityScreen({ user, setScreen, token }) {
  const [allTrips, setAllTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  /* toolbar */
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [sortBy, setSortBy] = useState("recent");

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/community`)
      .then((r) => r.json())
      .then((d) => setAllTrips(d.trips ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = [...allTrips];
    if (query) { const q = query.toLowerCase(); list = list.filter((t) => t.name?.toLowerCase().includes(q) || t.owner_name?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)); }
    if (sortBy === "name") list.sort((a, b) => a.name?.localeCompare(b.name));
    else if (sortBy === "stops") list.sort((a, b) => (b.destination_count ?? 0) - (a.destination_count ?? 0));
    return list;
  }, [allTrips, query, sortBy]);

  const grouped = useMemo(() => {
    if (!groupBy) return { "": filtered };
    const map = {};
    filtered.forEach((t) => {
      const key = groupBy === "owner" ? (t.owner_name || "Unknown") : "All";
      (map[key] = map[key] || []).push(t);
    });
    return map;
  }, [filtered, groupBy]);

  const initials = (user?.name ?? "T").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={s.root}>
      <nav style={s.navbar}>
        <div style={s.navBrand}><span style={s.navLogo}>✈</span><span style={s.navTitle}>Traveloop</span></div>
        <button style={s.avatar} onClick={() => setScreen?.("profile")}>
          {user?.photo_url ? <img src={user.photo_url} alt="av" style={s.avatarImg} /> : initials}
        </button>
      </nav>

      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <p style={s.eyebrow}>Community</p>
            <h1 style={s.pageTitle}>Shared trip inspiration</h1>
          </div>
        </div>

        <SearchToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search trips or travelers…"
          groupOptions={[{ value: "owner", label: "Traveler" }]}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          sortOptions={[
            { value: "recent", label: "Most Recent" },
            { value: "stops", label: "Most Stops" },
            { value: "name", label: "Name A–Z" },
          ]}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />

        {loading ? (
          <div style={s.communityGrid}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} style={s.skeletonCard} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={s.emptyState}><span style={{ fontSize: 40 }}>🌍</span><p>No shared trips found.</p></div>
        ) : (
          Object.entries(grouped).map(([group, list]) => (
            <div key={group}>
              {group && <p style={s.groupLabel}>{group}</p>}
              <div style={s.communityGrid}>
                {list.map((trip) => (
                  <article key={trip.id} style={s.communityCard}>
                    <div style={s.cityImgWrap}>
                      <img src={trip.cover_photo || FALLBACK} alt={trip.name} style={s.cityImg} onError={(e) => (e.target.src = FALLBACK)} />
                      <div style={s.cityImgOverlay} />
                      <span style={s.regionBadge}>📍 {trip.destination_count} stops</span>
                    </div>
                    <div style={s.cityBody}>
                      <strong style={s.cityName}>{trip.name}</strong>
                      <span style={s.cityCountry}>by {trip.owner_name}</span>
                      {trip.description && <p style={s.cityDesc}>{trip.description}</p>}
                    </div>
                    <div style={s.cardActions}>
                      <button style={s.addBtn} onClick={() => window.open(`/?public=${trip.public_token}`, "_blank")}>
                        🔗 View Public Plan
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── styles ─── */
const s = {
  root: { fontFamily: "'Nunito','Segoe UI',sans-serif", background: "#f7f7f9", minHeight: "100vh" },

  /* navbar */
  navbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 56, background: "#fff", borderBottom: "1px solid #ececec", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  navBrand: { display: "flex", alignItems: "center", gap: 8 },
  navLogo: { fontSize: 22 },
  navTitle: { fontSize: 20, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.5px" },
  avatar: { width: 38, height: 38, borderRadius: "50%", background: "#1a1a2e", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 0 },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },

  /* body */
  body: { padding: "20px 20px 60px", maxWidth: 960, margin: "0 auto" },

  /* page header */
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  eyebrow: { margin: "0 0 2px", fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8 },
  pageTitle: { margin: 0, fontSize: 24, fontWeight: 800, color: "#1a1a2e" },
  activeTripBadge: { background: "#e8eaf6", color: "#3949ab", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700 },
  stopSelect: { border: "1.5px solid #e0e0e8", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "#fff", color: "#1a1a2e", cursor: "pointer", outline: "none", fontWeight: 600 },

  /* toolbar */
  toolbar: { display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" },
  searchWrap: { flex: 1, minWidth: 200, display: "flex", alignItems: "center", background: "#fff", border: "1.5px solid #e0e0e8", borderRadius: 10, padding: "0 12px", gap: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
  searchIcon: { fontSize: 14, opacity: 0.5 },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 14, padding: "10px 0", background: "transparent", color: "#1a1a2e" },
  clearBtn: { background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 13, padding: 0 },
  controlGroup: { display: "flex", flexDirection: "column", gap: 2 },
  controlLabel: { fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  controlSelect: { border: "1.5px solid #e0e0e8", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff", color: "#1a1a2e", cursor: "pointer", outline: "none" },
  controlBtn: { border: "1.5px solid #e0e0e8", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 },
  filterDropdown: { position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#fff", border: "1.5px solid #e0e0e8", borderRadius: 12, padding: 14, zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 200, display: "flex", flexDirection: "column", gap: 6 },
  filterHeading: { margin: "0 0 4px", fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase" },
  filterChip: { border: "none", borderRadius: 7, padding: "7px 12px", fontSize: 13, cursor: "pointer", textAlign: "left", fontWeight: 500 },

  /* grids */
  cityGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 18, marginBottom: 24 },
  actGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18, marginBottom: 24 },
  communityGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 18, marginBottom: 24 },

  /* cards */
  cityCard: { background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #ececec", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column" },
  actCard: { background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #ececec", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column" },
  communityCard: { background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #ececec", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column" },

  /* image */
  cityImgWrap: { position: "relative", height: 160, overflow: "hidden", background: "#eee" },
  cityImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  cityImgOverlay: { position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent 55%)" },
  actImgWrap: { position: "relative", height: 140, overflow: "hidden", background: "#eee" },
  actImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  regionBadge: { position: "absolute", top: 10, left: 10, background: "rgba(26,26,46,0.78)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, backdropFilter: "blur(4px)" },
  costBadge: { position: "absolute", bottom: 10, right: 10, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20 },
  cheap: { background: "#e8f5e9", color: "#2e7d32" },
  mid: { background: "#fff8e1", color: "#f57f17" },
  pricey: { background: "#fce4ec", color: "#c62828" },

  /* card body */
  cityBody: { padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 },
  actBody: { padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 },
  cityMeta: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  cityName: { fontSize: 15, fontWeight: 800, color: "#1a1a2e" },
  cityCountry: { fontSize: 12, color: "#888" },
  cityDesc: { fontSize: 12, color: "#666", lineHeight: 1.5, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  cityStats: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 },
  statPill: { background: "#f0f0f5", borderRadius: 20, padding: "3px 9px", fontSize: 11, color: "#555", fontWeight: 600 },

  /* actions */
  cardActions: { padding: "10px 14px 14px", borderTop: "1px solid #f0f0f5", display: "flex", gap: 8, alignItems: "center" },
  addBtn: { flex: 1, background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  saveBtn: { borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" },
  actCost: { fontSize: 16, fontWeight: 800, color: "#1a1a2e", marginRight: "auto" },

  /* misc */
  groupLabel: { fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 12px" },
  emptyState: { textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 16, border: "1px solid #ececec", color: "#aaa" },
  skeletonCard: { borderRadius: 14, height: 280, background: "linear-gradient(90deg,#f0f0f5 25%,#e4e4ee 50%,#f0f0f5 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite", border: "1px solid #ececec" },
};