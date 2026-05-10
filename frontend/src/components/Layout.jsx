import { Button, Icons, TripSelect } from "./ui.jsx";

const navItems = [
  ["dashboard", "Home", Icons.Home],
  ["trips", "My Trips", Icons.Plane],
  ["create", "Create Trip", Icons.Plus],
  ["builder", "Builder", Icons.WandSparkles],
  ["itinerary", "Itinerary", Icons.CalendarDays],
  ["cities", "City Search", Icons.Search],
  ["activities", "Activities", Icons.MapPin],
  ["budget", "Budget", Icons.CircleDollarSign],
  ["checklist", "Packing", Icons.Luggage],
  ["community", "Community", Icons.Users],
  ["share", "Share", Icons.Share2],
  ["notes", "Notes", Icons.NotebookText],
  ["profile", "Settings", Icons.Settings],
  ["admin", "Admin", Icons.BarChart3],
];

export default function Layout({ screen, setScreen, trips, selectedTripId, setSelectedTripId, logout, children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Icons.Plane size={26} />
          <span>Traveloop</span>
        </div>
        <nav>
          {navItems.map(([id, label, Icon]) => (
            <button key={id} className={screen === id ? "active" : ""} onClick={() => setScreen(id)}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <TripSelect trips={trips} selectedTripId={selectedTripId} onChange={setSelectedTripId} />
          <Button variant="ghost" icon={Icons.User} onClick={logout}>
            Logout
          </Button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
