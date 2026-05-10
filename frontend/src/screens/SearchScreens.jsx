import { useEffect, useState, useMemo } from "react";
import { api, assetUrl } from "../api.js";

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
          {user?.photo_url ? <img src={assetUrl(user.photo_url)} alt="av" style={s.avatarImg} /> : initials}
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
          {user?.photo_url ? <img src={assetUrl(user.photo_url)} alt="av" style={s.avatarImg} /> : initials}
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
export function CommunityScreen({ user, setScreen }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [compose, setCompose] = useState({ body: "", category: "General" });
  const [editingPostId, setEditingPostId] = useState(null);
  const [editPost, setEditPost] = useState({ body: "", category: "General" });
  const [commentDrafts, setCommentDrafts] = useState({});
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentBody, setEditCommentBody] = useState("");

  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");

  const categories = ["General", "Trip Tips", "Questions", "Food", "Budget", "Safety"];

  useEffect(() => {
    loadCommunity();
  }, []);

  async function loadCommunity() {
    setLoading(true);
    setNotice("");
    try {
      const payload = await api.community();
      setPosts(payload.posts ?? []);
    } catch (err) {
      setNotice(err.message || "Could not load community posts.");
    } finally {
      setLoading(false);
    }
  }

  function replacePost(nextPost) {
    setPosts((current) => current.map((post) => (post.id === nextPost.id ? nextPost : post)));
  }

  async function createPost(event) {
    event.preventDefault();
    const body = compose.body.trim();
    if (!body) return;
    try {
      const payload = await api.createCommunityPost({ body, category: compose.category });
      setPosts((current) => [payload.post, ...current]);
      setCompose({ body: "", category: "General" });
      setNotice("");
    } catch (err) {
      setNotice(err.message || "Post failed.");
    }
  }

  function startPostEdit(post) {
    setEditingPostId(post.id);
    setEditPost({ body: post.body, category: post.category || "General" });
  }

  async function savePostEdit(postId) {
    try {
      const payload = await api.updateCommunityPost(postId, editPost);
      replacePost(payload.post);
      setEditingPostId(null);
      setNotice("");
    } catch (err) {
      setNotice(err.message || "Could not update post.");
    }
  }

  async function removePost(postId) {
    if (!confirm("Delete this community post?")) return;
    try {
      await api.deleteCommunityPost(postId);
      setPosts((current) => current.filter((post) => post.id !== postId));
    } catch (err) {
      setNotice(err.message || "Could not delete post.");
    }
  }

  async function toggleLike(postId) {
    try {
      const payload = await api.toggleCommunityLike(postId);
      replacePost(payload.post);
    } catch (err) {
      setNotice(err.message || "Could not update like.");
    }
  }

  async function addComment(postId) {
    const body = (commentDrafts[postId] || "").trim();
    if (!body) return;
    try {
      const payload = await api.createCommunityComment(postId, { body });
      replacePost(payload.post);
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setNotice("");
    } catch (err) {
      setNotice(err.message || "Could not add comment.");
    }
  }

  function startCommentEdit(comment) {
    setEditingCommentId(comment.id);
    setEditCommentBody(comment.body);
  }

  async function saveCommentEdit(commentId) {
    const body = editCommentBody.trim();
    if (!body) return;
    try {
      const payload = await api.updateCommunityComment(commentId, { body });
      replacePost(payload.post);
      setEditingCommentId(null);
      setEditCommentBody("");
    } catch (err) {
      setNotice(err.message || "Could not update comment.");
    }
  }

  async function removeComment(commentId) {
    try {
      const payload = await api.deleteCommunityComment(commentId);
      replacePost(payload.post);
    } catch (err) {
      setNotice(err.message || "Could not delete comment.");
    }
  }

  const filtered = useMemo(() => {
    let list = [...posts];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((post) =>
        post.body?.toLowerCase().includes(q) ||
        post.owner_name?.toLowerCase().includes(q) ||
        post.category?.toLowerCase().includes(q) ||
        post.comments?.some((comment) => comment.body?.toLowerCase().includes(q) || comment.owner_name?.toLowerCase().includes(q))
      );
    }
    if (categoryFilter) list = list.filter((post) => post.category === categoryFilter);
    if (activityFilter === "mine") list = list.filter((post) => post.user_id === user?.id);
    if (activityFilter === "liked") list = list.filter((post) => post.liked_by_me);
    if (activityFilter === "commented") list = list.filter((post) => post.comments?.some((comment) => comment.user_id === user?.id));

    if (sortBy === "oldest") list.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    else if (sortBy === "likes") list.sort((a, b) => (b.likes_count ?? 0) - (a.likes_count ?? 0));
    else if (sortBy === "comments") list.sort((a, b) => (b.comments_count ?? 0) - (a.comments_count ?? 0));
    else if (sortBy === "author") list.sort((a, b) => (a.owner_name || "").localeCompare(b.owner_name || ""));
    else list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return list;
  }, [posts, query, categoryFilter, activityFilter, sortBy, user?.id]);

  const grouped = useMemo(() => {
    if (!groupBy) return { "": filtered };
    const map = {};
    filtered.forEach((post) => {
      let key = "All";
      if (groupBy === "owner") key = post.owner_name || "Unknown";
      if (groupBy === "category") key = post.category || "General";
      if (groupBy === "date") key = post.created_at?.slice(0, 10) || "Unknown date";
      (map[key] = map[key] || []).push(post);
    });
    return map;
  }, [filtered, groupBy]);

  const initials = (user?.name ?? "T").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarFor = (name = "U", photo = "") => {
    const letters = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    return photo ? <img src={assetUrl(photo)} alt={name} style={s.avatarImg} /> : letters;
  };
  const dateLabel = (value) => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div style={s.root}>
      <nav style={s.navbar}>
        <div style={s.navBrand}><span style={s.navLogo}>T</span><span style={s.navTitle}>Traveloop</span></div>
        <button style={s.avatar} onClick={() => setScreen?.("profile")}>
          {user?.photo_url ? <img src={assetUrl(user.photo_url)} alt="av" style={s.avatarImg} /> : initials}
        </button>
      </nav>

      <div style={s.body}>
        <div style={s.pageHeader}>
          <div>
            <p style={s.eyebrow}>Community Tab Screen</p>
            <h1 style={s.pageTitle}>Community tab</h1>
          </div>
        </div>

        <SearchToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search posts, users, or comments..."
          groupOptions={[
            { value: "owner", label: "Traveler" },
            { value: "category", label: "Category" },
            { value: "date", label: "Date" },
          ]}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          sortOptions={[
            { value: "recent", label: "Most Recent" },
            { value: "oldest", label: "Oldest" },
            { value: "likes", label: "Most Likes" },
            { value: "comments", label: "Most Comments" },
            { value: "author", label: "Author A-Z" },
          ]}
          sortBy={sortBy}
          setSortBy={setSortBy}
          filterContent={({ close }) => (
            <>
              <p style={s.filterHeading}>Category</p>
              {["", ...categories].map((category) => (
                <button
                  key={category || "all"}
                  style={{ ...s.filterChip, background: categoryFilter === category ? "#1a1a2e" : "#f0f0f5", color: categoryFilter === category ? "#fff" : "#333" }}
                  onClick={() => { setCategoryFilter(category); close(); }}
                >
                  {category || "All categories"}
                </button>
              ))}
              <p style={{ ...s.filterHeading, marginTop: 12 }}>Activity</p>
              {[
                ["all", "All posts"],
                ["mine", "My posts"],
                ["liked", "Liked by me"],
                ["commented", "Commented by me"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  style={{ ...s.filterChip, background: activityFilter === value ? "#1a1a2e" : "#f0f0f5", color: activityFilter === value ? "#fff" : "#333" }}
                  onClick={() => { setActivityFilter(value); close(); }}
                >
                  {label}
                </button>
              ))}
            </>
          )}
        />

        <form style={s.communityComposer} onSubmit={createPost}>
          <button type="button" style={s.avatar} onClick={() => setScreen?.("profile")} title={user?.name}>
            {avatarFor(user?.name, user?.photo_url)}
          </button>
          <div style={s.composerBody}>
            <textarea
              style={s.postTextarea}
              rows={3}
              placeholder="Share your trip experience, tip, question, or update..."
              value={compose.body}
              onChange={(e) => setCompose((current) => ({ ...current, body: e.target.value }))}
            />
            <div style={s.composerActions}>
              <select
                style={s.controlSelect}
                value={compose.category}
                onChange={(e) => setCompose((current) => ({ ...current, category: e.target.value }))}
              >
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select>
              <button style={s.postBtn} disabled={!compose.body.trim()}>Post</button>
            </div>
          </div>
        </form>

        {notice && <div style={s.communityNotice}>{notice}</div>}

        {loading ? (
          <div style={s.communityFeed}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} style={s.communitySkeleton} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={s.emptyState}><span style={{ fontSize: 40 }}>+</span><p>No community posts found.</p></div>
        ) : (
          Object.entries(grouped).map(([group, list]) => (
            <div key={group}>
              {group && <p style={s.groupLabel}>{group}</p>}
              <div style={s.communityFeed}>
                {list.map((post) => (
                  <article key={post.id} style={s.feedPost}>
                    <div style={s.feedAvatar}>{avatarFor(post.owner_name, post.owner_photo)}</div>
                    <div style={s.postCard}>
                      <div style={s.postHeader}>
                        <div>
                          <strong style={s.postAuthor}>{post.owner_name}</strong>
                          <span style={s.postMeta}>{post.category || "General"} | {dateLabel(post.created_at)}</span>
                        </div>
                        {post.can_edit && (
                          <div style={s.ownerActions}>
                            <button type="button" style={s.textBtn} onClick={() => startPostEdit(post)}>Edit</button>
                            <button type="button" style={s.dangerTextBtn} onClick={() => removePost(post.id)}>Delete</button>
                          </div>
                        )}
                      </div>

                      {editingPostId === post.id ? (
                        <div style={s.editBox}>
                          <textarea
                            style={s.postTextarea}
                            rows={3}
                            value={editPost.body}
                            onChange={(e) => setEditPost((current) => ({ ...current, body: e.target.value }))}
                          />
                          <div style={s.composerActions}>
                            <select
                              style={s.controlSelect}
                              value={editPost.category}
                              onChange={(e) => setEditPost((current) => ({ ...current, category: e.target.value }))}
                            >
                              {categories.map((category) => <option key={category}>{category}</option>)}
                            </select>
                            <button type="button" style={s.saveBtnDark} onClick={() => savePostEdit(post.id)}>Save</button>
                            <button type="button" style={s.saveBtn} onClick={() => setEditingPostId(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <p style={s.postBodyText}>{post.body}</p>
                      )}

                      <div style={s.postStats}>
                        <button
                          type="button"
                          style={{ ...s.likeBtn, ...(post.liked_by_me ? s.likeBtnActive : {}) }}
                          onClick={() => toggleLike(post.id)}
                        >
                          Like {post.likes_count ? `(${post.likes_count})` : ""}
                        </button>
                        <span>{post.comments_count || 0} comments</span>
                      </div>

                      <div style={s.commentsList}>
                        {post.comments?.map((comment) => (
                          <div key={comment.id} style={s.commentRow}>
                            <div style={s.commentAvatar}>{avatarFor(comment.owner_name, comment.owner_photo)}</div>
                            <div style={s.commentBubble}>
                              <div style={s.commentHead}>
                                <strong>{comment.owner_name}</strong>
                                <span>{dateLabel(comment.created_at)}</span>
                              </div>
                              {editingCommentId === comment.id ? (
                                <div style={s.commentEdit}>
                                  <input
                                    style={s.commentInput}
                                    value={editCommentBody}
                                    onChange={(e) => setEditCommentBody(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && saveCommentEdit(comment.id)}
                                  />
                                  <button type="button" style={s.textBtn} onClick={() => saveCommentEdit(comment.id)}>Save</button>
                                  <button type="button" style={s.textBtn} onClick={() => setEditingCommentId(null)}>Cancel</button>
                                </div>
                              ) : (
                                <p>{comment.body}</p>
                              )}
                              {comment.can_edit && editingCommentId !== comment.id && (
                                <div style={s.commentActions}>
                                  <button type="button" style={s.textBtn} onClick={() => startCommentEdit(comment)}>Edit</button>
                                  <button type="button" style={s.dangerTextBtn} onClick={() => removeComment(comment.id)}>Delete</button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={s.commentComposer}>
                        <div style={s.commentAvatar}>{avatarFor(user?.name, user?.photo_url)}</div>
                        <input
                          style={s.commentInput}
                          placeholder="Add a comment..."
                          value={commentDrafts[post.id] || ""}
                          onChange={(e) => setCommentDrafts((current) => ({ ...current, [post.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && addComment(post.id)}
                        />
                        <button
                          type="button"
                          style={s.commentBtn}
                          disabled={!(commentDrafts[post.id] || "").trim()}
                          onClick={() => addComment(post.id)}
                        >
                          Comment
                        </button>
                      </div>
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
  communityFeed: { display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 },

  /* cards */
  cityCard: { background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #ececec", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column" },
  actCard: { background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #ececec", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column" },
  communityComposer: { background: "#fff", border: "1px solid #ececec", borderRadius: 12, padding: 14, display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" },
  composerBody: { flex: 1, display: "flex", flexDirection: "column", gap: 10 },
  composerActions: { display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" },
  postTextarea: { width: "100%", boxSizing: "border-box", resize: "vertical", border: "1.5px solid #e0e0e8", borderRadius: 10, padding: "10px 12px", fontSize: 14, lineHeight: 1.5, color: "#1a1a2e", outline: "none", fontFamily: "inherit", background: "#fff" },
  postBtn: { background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  communityNotice: { background: "#fff8e1", border: "1px solid #f3d37a", color: "#7a5b00", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 13, fontWeight: 700 },
  feedPost: { display: "grid", gridTemplateColumns: "42px minmax(0, 1fr)", gap: 10, alignItems: "start" },
  feedAvatar: { width: 38, height: 38, borderRadius: "50%", background: "#1a1a2e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontWeight: 800, fontSize: 13 },
  postCard: { background: "#fff", border: "1px solid #e7e7ef", borderRadius: 10, padding: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" },
  postHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 8 },
  postAuthor: { display: "block", color: "#1a1a2e", fontSize: 14, fontWeight: 900 },
  postMeta: { display: "block", color: "#7b7b8d", fontSize: 11, fontWeight: 700, marginTop: 2 },
  ownerActions: { display: "flex", gap: 8, alignItems: "center", flexShrink: 0 },
  textBtn: { border: "none", background: "transparent", color: "#3949ab", fontWeight: 800, fontSize: 12, cursor: "pointer", padding: "2px 0" },
  dangerTextBtn: { border: "none", background: "transparent", color: "#c62828", fontWeight: 800, fontSize: 12, cursor: "pointer", padding: "2px 0" },
  editBox: { display: "flex", flexDirection: "column", gap: 8 },
  saveBtnDark: { border: "none", borderRadius: 8, padding: "8px 14px", background: "#1a1a2e", color: "#fff", fontWeight: 800, cursor: "pointer" },
  postBodyText: { margin: "8px 0 10px", color: "#2b2b3b", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" },
  postStats: { borderTop: "1px solid #f0f0f5", borderBottom: "1px solid #f0f0f5", padding: "8px 0", display: "flex", gap: 14, alignItems: "center", color: "#6f6f80", fontSize: 12, fontWeight: 800 },
  likeBtn: { border: "none", background: "transparent", color: "#55566a", fontSize: 12, fontWeight: 900, cursor: "pointer", padding: 0 },
  likeBtnActive: { color: "#c62828" },
  commentsList: { display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 },
  commentRow: { display: "grid", gridTemplateColumns: "30px minmax(0, 1fr)", gap: 8, alignItems: "start" },
  commentAvatar: { width: 28, height: 28, borderRadius: "50%", background: "#e8eaf6", color: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontSize: 10, fontWeight: 900, flexShrink: 0 },
  commentBubble: { background: "#f6f6fa", borderRadius: 10, padding: "8px 10px", minWidth: 0 },
  commentHead: { display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 3 },
  commentEdit: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  commentActions: { display: "flex", gap: 8, marginTop: 4 },
  commentComposer: { display: "grid", gridTemplateColumns: "30px minmax(0, 1fr) auto", gap: 8, alignItems: "center", marginTop: 12 },
  commentInput: { border: "1.5px solid #e0e0e8", borderRadius: 18, padding: "8px 12px", outline: "none", fontSize: 13, minWidth: 0, fontFamily: "inherit" },
  commentBtn: { border: "none", borderRadius: 18, padding: "8px 12px", background: "#1a1a2e", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" },
  communitySkeleton: { borderRadius: 10, height: 170, background: "linear-gradient(90deg,#f0f0f5 25%,#e4e4ee 50%,#f0f0f5 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite", border: "1px solid #ececec" },

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
