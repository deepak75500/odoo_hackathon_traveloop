import { useEffect, useMemo, useState } from "react";
import { api, saveSession, storedSession } from "./api.js";
import Layout from "./components/Layout.jsx";
import AuthScreen from "./screens/AuthScreen.jsx";
import DashboardScreen from "./screens/DashboardScreen.jsx";
import { CreateTripScreen, TripListScreen } from "./screens/TripScreens.jsx";
import { BuilderScreen, ItineraryViewScreen } from "./screens/ItineraryScreens.jsx";
import { ActivitySearchScreen, CitySearchScreen, CommunityScreen } from "./screens/SearchScreens.jsx";
import BudgetScreen from "./screens/BudgetScreen.jsx";
import { AdminScreen, ChecklistScreen, NotesScreen, ProfileScreen, PublicItinerary, ShareScreen } from "./screens/UtilityScreens.jsx";

export default function App() {
  const publicToken = new URLSearchParams(window.location.search).get("public");
  const initial = storedSession();
  const [user, setUser] = useState(initial.user);
  const [screen, setScreen] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [trips, setTrips] = useState([]);
  const [trip, setTrip] = useState(null);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [cities, setCities] = useState([]);
  const [savedCities, setSavedCities] = useState([]);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!user || publicToken) return;
    bootstrap();
  }, [user?.id, publicToken]);

  useEffect(() => {
    if (!user) return;
    if (!selectedTripId) {
      setTrip(null);
      return;
    }
    loadTrip(selectedTripId);
  }, [selectedTripId, user?.id]);

  async function bootstrap() {
    try {
      const [dashboardPayload, tripPayload, cityPayload, savedPayload] = await Promise.all([
        api.dashboard(),
        api.trips(),
        api.cities(),
        api.saved(),
      ]);
      setDashboard(dashboardPayload);
      if (dashboardPayload.user) {
        setUser(dashboardPayload.user);
        saveSession(localStorage.getItem("traveloop_token"), dashboardPayload.user);
      }
      setTrips(tripPayload.trips);
      setCities(cityPayload.cities);
      setSavedCities(savedPayload.cities);
      const nextTripId = selectedTripId || tripPayload.trips[0]?.id;
      if (nextTripId) setSelectedTripId(nextTripId);
    } catch (err) {
      setToast(err.message);
      if (err.message.toLowerCase().includes("session") || err.message.toLowerCase().includes("token")) logout();
    }
  }

  async function loadTrip(id = selectedTripId) {
    if (!id) return;
    const payload = await api.trip(id);
    setTrip(payload.trip);
  }

  async function refreshTrip() {
    await loadTrip(selectedTripId);
    const payload = await api.trips();
    setTrips(payload.trips);
  }

  async function createTrip(form) {
    const payload = await api.createTrip(form);
    setTrip(payload.trip);
    setSelectedTripId(payload.trip.id);
    setScreen("builder");
    await bootstrap();
  }

  function selectTrip(id, nextScreen = screen) {
    const nextId = Number(id) || null;
    setSelectedTripId(nextId);
    if (!nextId) setTrip(null);
    setScreen(nextScreen);
  }

  async function removeTrip(id) {
    if (!confirm("Delete this trip?")) return;
    await api.deleteTrip(id);
    setSelectedTripId(null);
    setTrip(null);
    await bootstrap();
  }

  async function saveCity(cityId) {
    await api.saveCity(cityId);
    const payload = await api.saved();
    setSavedCities(payload.cities);
    setToast("Destination saved.");
  }

  async function reloadSaved() {
    const payload = await api.saved();
    setSavedCities(payload.cities);
  }

  function logout() {
    saveSession("", null);
    setUser(null);
    setTrip(null);
    setTrips([]);
    setDashboard(null);
  }

  const sharedProps = {
    user,
    setUser,
    dashboard,
    trips,
    trip,
    cities,
    setCities,
    savedCities,
    selectedTripId,
    setSelectedTripId,
    setScreen,
    selectTrip,
    removeTrip,
    onCreate: createTrip,
    refreshTrip,
    saveCity,
    reloadSaved,
    logout,
  };

  const active = useMemo(() => {
    switch (screen) {
      case "dashboard":
        return <DashboardScreen {...sharedProps} />;
      case "trips":
        return <TripListScreen {...sharedProps} />;
      case "create":
        return <CreateTripScreen {...sharedProps} />;
      case "builder":
        return <BuilderScreen {...sharedProps} />;
      case "itinerary":
        return <ItineraryViewScreen {...sharedProps} />;
      case "cities":
        return <CitySearchScreen {...sharedProps} />;
      case "activities":
        return <ActivitySearchScreen {...sharedProps} />;
      case "budget":
        return <BudgetScreen {...sharedProps} />;
      case "checklist":
        return <ChecklistScreen {...sharedProps} />;
      case "community":
        return <CommunityScreen {...sharedProps} />;
      case "share":
        return <ShareScreen {...sharedProps} />;
      case "notes":
        return <NotesScreen {...sharedProps} />;
      case "profile":
        return <ProfileScreen {...sharedProps} />;
      case "admin":
        return <AdminScreen {...sharedProps} />;
      default:
        return <DashboardScreen {...sharedProps} />;
    }
  }, [screen, dashboard, trips, trip, cities, savedCities, selectedTripId, user]);

  if (publicToken) return <PublicItinerary token={publicToken} />;
  if (!user) return <AuthScreen onAuth={setUser} />;

  return (
    <Layout screen={screen} setScreen={setScreen} trips={trips} selectedTripId={selectedTripId} setSelectedTripId={setSelectedTripId} logout={logout}>
      {toast && <div className="toast"><span>{toast}</span><button onClick={() => setToast("")}>Dismiss</button></div>}
      {active}
    </Layout>
  );
}
