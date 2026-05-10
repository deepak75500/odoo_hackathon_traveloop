import { useState } from "react";
import { Icons, PageHeader, EmptyState, ImageBlock } from "../components/ui.jsx";

// Groups trips by status: ongoing, upcoming, completed
function groupTrips(trips) {
  const today = new Date().toISOString().slice(0, 10);
  const ongoing = [];
  const upcoming = [];
  const completed = [];

  for (const trip of trips || []) {
    if (trip.end_date < today) completed.push(trip);
    else if (trip.start_date <= today && trip.end_date >= today) ongoing.push(trip);
    else upcoming.push(trip);
  }

  return { ongoing, upcoming, completed };
}

function TripCard({ trip, onSelect }) {
  const nights =
    trip.start_date && trip.end_date
      ? Math.max(
          0,
          Math.round(
            (new Date(trip.end_date) - new Date(trip.start_date)) / 86400000
          )
        )
      : 0;

  const cityNames = trip.stops?.map((s) => s.city_name).join(" → ") || "No stops yet";

  return (
    <div className="trip-list-card" onClick={() => onSelect(trip)}>
      {trip.cover_photo && (
        <div className="trip-list-cover">
          <img src={trip.cover_photo} alt={trip.name} />
        </div>
      )}
      <div className="trip-list-body">
        <strong className="trip-list-name">{trip.name}</strong>
        <p className="trip-list-route">
          <Icons.MapPin size={13} /> {cityNames}
        </p>
        <div className="trip-list-meta">
          <span>
            <Icons.Calendar size={13} /> {trip.start_date} → {trip.end_date}
          </span>
          <span>
            <Icons.Moon size={13} /> {nights} nights
          </span>
          {trip.budget_limit > 0 && (
            <span>
              <Icons.Wallet size={13} /> ${trip.budget_limit.toLocaleString()}
            </span>
          )}
        </div>
        {trip.description && (
          <p className="trip-list-desc">{trip.description}</p>
        )}
      </div>
      <div className="trip-list-arrow">
        <Icons.ChevronRight size={20} />
      </div>
    </div>
  );
}

function TripGroup({ label, trips, onSelect }) {
  if (!trips.length) return null;
  return (
    <section className="trip-group">
      <h3 className="trip-group-label">{label}</h3>
      {trips.map((trip) => (
        <TripCard key={trip.id} trip={trip} onSelect={onSelect} />
      ))}
    </section>
  );
}

export function TripListingScreen({ trips, onSelectTrip, onCreateTrip }) {
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("status");
  const [filterBy, setFilterBy] = useState("all");
  const [sortBy, setSortBy] = useState("date");

  const filtered = (trips || []).filter((t) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      t.name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.stops?.some((s) => s.city_name?.toLowerCase().includes(q));

    const matchFilter =
      filterBy === "all" ||
      (filterBy === "public" && t.is_public) ||
      (filterBy === "private" && !t.is_public);

    return matchSearch && matchFilter;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "date") return (b.start_date || "").localeCompare(a.start_date || "");
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "budget") return (b.budget_limit || 0) - (a.budget_limit || 0);
    return 0;
  });

  const { ongoing, upcoming, completed } = groupTrips(sorted);

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="My Trips"
        title="Your travel history"
        subtitle="View ongoing, upcoming, and completed trips."
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
          <option value="status">Group by</option>
          <option value="none">None</option>
        </select>
        <select value={filterBy} onChange={(e) => setFilterBy(e.target.value)}>
          <option value="all">Filter</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="date">Sort by: Date</option>
          <option value="name">Name</option>
          <option value="budget">Budget</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="listing-empty">
          <Icons.Plane size={40} />
          <p>No trips found. Start planning!</p>
          <button className="btn btn-primary" onClick={onCreateTrip}>
            <Icons.Plus size={16} /> Plan a trip
          </button>
        </div>
      ) : groupBy === "status" ? (
        <>
          <TripGroup label="Ongoing" trips={ongoing} onSelect={onSelectTrip} />
          <TripGroup label="Up-coming" trips={upcoming} onSelect={onSelectTrip} />
          <TripGroup label="Completed" trips={completed} onSelect={onSelectTrip} />
        </>
      ) : (
        sorted.map((trip) => (
          <TripCard key={trip.id} trip={trip} onSelect={onSelectTrip} />
        ))
      )}

      <div className="listing-footer-cta">
        <button className="btn btn-secondary" onClick={onCreateTrip}>
          <Icons.Plus size={16} /> Plan a trip
        </button>
      </div>
    </div>
  );
}
