import { useCallback, useEffect, useMemo, useState } from "react";
import { api, saveSession, storedSession } from "./api.js";
import Layout from "./components/Layout.jsx";
import AuthScreen from "./screens/AuthScreen.jsx";
import DashboardScreen from "./screens/DashboardScreen.jsx";
import { CreateTripScreen, TripListScreen } from "./screens/TripScreens.jsx";
import { BuilderScreen } from "./screens/ItineraryScreens.jsx";
import { CitySearchScreen } from "./screens/SearchScreens.jsx";

import { TripListingScreen } from "./screens/TripListingScreen.jsx";
import { CommunityScreen } from "./screens/CommunityScreen.jsx";
import { ActivitySearchScreen } from "./screens/ActivitySearchScreen.jsx";
import { ItineraryViewScreen } from "./screens/ItineraryViewScreen.jsx";
import { BuildItineraryScreen } from "./screens/BuildItineraryScreen.jsx";
import { ExpenseInvoiceScreen } from "./screens/ExpenseInvoiceScreen.jsx";
import {
  AdminScreen,
  ChecklistScreen,
  NotesScreen,
  ProfileScreen,
  PublicItinerary,
  ShareScreen,
} from "./screens/UtilityScreens.jsx";

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

  // Bootstrap on login / user change
  useEffect(() => {
    if (!user || publicToken) return;
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, publicToken]);

  // Load trip whenever selectedTripId changes
  useEffect(() => {
    if (!selectedTripId || !user) return;
    loadTrip(selectedTripId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTripId]);

  async function bootstrap() {
    try {
      const [dashboardPayload, tripPayload, cityPayload, savedPayload] = await Promise.all([
        api.dashboard(),
        api.trips(),
        api.cities(),
        api.saved(),
      ]);
      setDashboard(dashboardPayload);
      setTrips(tripPayload.trips ?? []);
      setCities(cityPayload.cities ?? []);
      setSavedCities(savedPayload.cities ?? []);
      const nextTripId = selectedTripId || tripPayload.trips?.[0]?.id;
      if (nextTripId) setSelectedTripId(nextTripId);
    } catch (err) {
      setToast(err.message || "Failed to load data");
      const msg = (err.message || "").toLowerCase();
      if (msg.includes("session") || msg.includes("token") || msg.includes("401")) {
        logout();
      }
    }
  }

  async function loadTrip(id) {
    if (!id) return;
    try {
      const payload = await api.trip(id);
      setTrip(payload.trip);
    } catch (err) {
      setToast(err.message || "Failed to load trip");
    }
  }

  async function refreshTrip() {
    if (selectedTripId) await loadTrip(selectedTripId);
    const payload = await api.trips();
    setTrips(payload.trips ?? []);
  }

  async function createTrip(form) {
    const payload = await api.createTrip(form);
    setTrip(payload.trip);
    setSelectedTripId(payload.trip.id);
    setScreen("builder");
    await bootstrap();
  }

  function selectTrip(id, nextScreen = screen) {
    setSelectedTripId(id);
    setScreen(nextScreen);
  }

  async function removeTrip(id) {
    if (!window.confirm("Delete this trip?")) return;
    await api.deleteTrip(id);
    setSelectedTripId(null);
    setTrip(null);
    await bootstrap();
  }

  async function saveCity(cityId) {
    await api.saveCity(cityId);
    const payload = await api.saved();
    setSavedCities(payload.cities ?? []);
    setToast("Destination saved.");
  }

  async function reloadSaved() {
    const payload = await api.saved();
    setSavedCities(payload.cities ?? []);
  }

  const logout = useCallback(() => {
    saveSession("", null);
    setUser(null);
    setTrip(null);
    setTrips([]);
    setDashboard(null);
    setSavedCities([]);
    setCities([]);
    setSelectedTripId(null);
    setScreen("dashboard");
  }, []);

  // Memoize shared props to avoid unnecessary re-renders in child screens
  const sharedProps = useMemo(() => ({
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, dashboard, trips, trip, cities, savedCities, selectedTripId, logout]);

  const active = useMemo(() => {
    switch (screen) {
      case "dashboard":  return <DashboardScreen {...sharedProps} />;
      case "trips":      return <TripListScreen {...sharedProps} />;
      case "create":     return <CreateTripScreen {...sharedProps} />;
      case "builder":
      return <BuildItineraryScreen {...sharedProps} />;

    // ✅ UPDATED
    case "itinerary":
      return <ItineraryViewScreen {...sharedProps} />;

    case "cities":
      return <CitySearchScreen {...sharedProps} />;

    // ✅ UPDATED
    case "activities":
      return <ActivitySearchScreen {...sharedProps} />;

    // ✅ UPDATED
    case "budget":
      return <ExpenseInvoiceScreen {...sharedProps} />;
    
      case "builder":    return <BuilderScreen {...sharedProps} />;
      case "itinerary":  return <ItineraryViewScreen {...sharedProps} />;
      case "cities":     return <CitySearchScreen {...sharedProps} />;
      case "activities": return <ActivitySearchScreen {...sharedProps} />;
      
      case "checklist":  return <ChecklistScreen {...sharedProps} />;
        // ✅ UPDATED
    case "community":
      return <CommunityScreen {...sharedProps} />;
      case "share":      return <ShareScreen {...sharedProps} />;
      case "notes":      return <NotesScreen {...sharedProps} />;
      case "profile":    return <ProfileScreen {...sharedProps} />;
      case "admin":      return <AdminScreen {...sharedProps} />;
      default:           return <DashboardScreen {...sharedProps} />;
    }
  }, [screen, sharedProps]);

  // Public shared trip view (no auth needed)
  if (publicToken) return <PublicItinerary token={publicToken} />;

  // Not logged in
  if (!user) return <AuthScreen onAuth={setUser} />;

  return (
    <Layout
      screen={screen}
      setScreen={setScreen}
      trips={trips}
      selectedTripId={selectedTripId}
      setSelectedTripId={setSelectedTripId}
      logout={logout}
    >
      {toast && (
        <div className="toast">
          <span>{toast}</span>
          <button onClick={() => setToast("")}>Dismiss</button>
        </div>
      )}
      {active}
    </Layout>
  );
}