import { useEffect, useState } from "react";
import { api } from "../api.js";
import { EmptyState, Icons, ImageBlock, PageHeader } from "../components/ui.jsx";

// ── Post Card ────────────────────────────────
function CommunityPost({ post, onView }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="community-post">
      {/* Avatar */}
      <div className="post-avatar">
        {post.owner_photo ? (
          <img src={post.owner_photo} alt={post.owner_name} />
        ) : (
          <span className="post-avatar-initials">
            {(post.owner_name || "?")[0].toUpperCase()}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="post-body">
        <div className="post-meta">
          <strong className="post-author">{post.owner_name}</strong>
          <span className="post-date">{post.start_date} – {post.end_date}</span>
        </div>

        <h3 className="post-title">{post.name}</h3>
        <p className="post-route">
          <Icons.MapPin size={13} />
          {(post.stops || []).map((s) => s.city_name).join(" → ") || "No stops"}
        </p>

        {post.description && (
          <p className={`post-desc ${expanded ? "expanded" : ""}`}>
            {post.description}
          </p>
        )}

        <div className="post-footer">
          <div className="post-stats">
            <span>
              <Icons.MapPin size={13} /> {(post.stops || []).length} stops
            </span>
            {post.budget_limit > 0 && (
              <span>
                <Icons.Wallet size={13} /> ${post.budget_limit.toLocaleString()}
              </span>
            )}
          </div>
          <div className="post-actions">
            {post.description && post.description.length > 120 && (
              <button
                className="link-btn"
                onClick={() => setExpanded((x) => !x)}
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => onView(post)}>
              <Icons.Eye size={13} /> View Trip
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ── Main Screen ───────────────────────────────
export function CommunityScreen({ onViewTrip }) {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .publicTrips?.()
      .then((payload) => setPosts(payload.trips || []))
      .catch((err) => setError(err.message || "Could not load community trips."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = posts.filter((p) => {
    const q = search.toLowerCase();
    return (
      !q ||
      p.name?.toLowerCase().includes(q) ||
      p.owner_name?.toLowerCase().includes(q) ||
      (p.stops || []).some((s) => s.city_name?.toLowerCase().includes(q))
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "recent") return (b.updated_at || "").localeCompare(a.updated_at || "");
    if (sortBy === "budget") return (b.budget_limit || 0) - (a.budget_limit || 0);
    if (sortBy === "stops") return (b.stops?.length || 0) - (a.stops?.length || 0);
    return 0;
  });

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Community Tab"
        title="Explore shared trips"
        subtitle="Community section where all the users can share their experience about a certain trip or activity. Using the search, groupby or filter and sorting option, the user can narrow down the result they're looking for."
      />

      {/* Toolbar */}
      <div className="listing-toolbar">
        <input
          className="listing-search"
          placeholder="Search for..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          <option value="all">Group by</option>
          <option value="city">City</option>
          <option value="region">Region</option>
        </select>
        <select>
          <option>Filter</option>
          <option>Budget trips</option>
          <option>Long trips</option>
          <option>Short trips</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="recent">Sort by: Recent</option>
          <option value="budget">Budget</option>
          <option value="stops">Stops</option>
        </select>
      </div>

      {/* Feed */}
      <div className="community-feed">
        {loading && (
          <div className="community-loading">
            <Icons.Loader size={28} className="spin" />
            <p>Loading community trips…</p>
          </div>
        )}

        {!loading && error && (
          <EmptyState title="Couldn't load community">{error}</EmptyState>
        )}

        {!loading && !error && sorted.length === 0 && (
          <EmptyState title="No shared trips yet">
            Be the first to share your trip! Use the Share screen on any trip.
          </EmptyState>
        )}

        {!loading &&
          sorted.map((post) => (
            <CommunityPost key={post.id} post={post} onView={onViewTrip} />
          ))}
      </div>
    </div>
  );
}
