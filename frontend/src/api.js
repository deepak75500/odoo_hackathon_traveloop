const API_BASE = "/api";

let token = "";

try {
  token = localStorage.getItem("traveloop_token") || "";
} catch (_) {}

export function storedSession() {
  try {
    const rawUser = localStorage.getItem("traveloop_user");
    return { token, user: rawUser ? JSON.parse(rawUser) : null };
  } catch (_) {
    return { token: "", user: null };
  }
}

export function saveSession(nextToken, user) {
  token = nextToken || "";
  try {
    if (token) localStorage.setItem("traveloop_token", token);
    else localStorage.removeItem("traveloop_token");
    if (user) localStorage.setItem("traveloop_user", JSON.stringify(user));
    else localStorage.removeItem("traveloop_user");
  } catch (_) {}
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || payload.error || "Request failed");
  return payload;
}

export const api = {
  login: (body) => request("/auth/login", { method: "POST", body }),
  signup: (body) => request("/auth/signup", { method: "POST", body }),
  me: () => request("/me"),
  updateMe: (body) => request("/me", { method: "PUT", body }),
  deleteMe: () => request("/me", { method: "DELETE" }),
  dashboard: () => request("/dashboard"),
  trips: () => request("/trips"),
  createTrip: (body) => request("/trips", { method: "POST", body }),
  trip: (id) => request(`/trips/${id}`),
  updateTrip: (id, body) => request(`/trips/${id}`, { method: "PUT", body }),
  deleteTrip: (id) => request(`/trips/${id}`, { method: "DELETE" }),
  addStop: (tripId, body) => request(`/trips/${tripId}/stops`, { method: "POST", body }),
  updateStop: (id, body) => request(`/stops/${id}`, { method: "PUT", body }),
  deleteStop: (id) => request(`/stops/${id}`, { method: "DELETE" }),
  cities: (params = {}) => request(`/cities?${new URLSearchParams(params)}`),
  activities: (params = {}) => request(`/activities?${new URLSearchParams(params)}`),
  addActivity: (stopId, body) => request(`/stops/${stopId}/activities`, { method: "POST", body }),
  deleteActivity: (id) => request(`/planned/${id}`, { method: "DELETE" }),
  budget: (tripId) => request(`/trips/${tripId}/budget`),
  addExpense: (tripId, body) => request(`/trips/${tripId}/expenses`, { method: "POST", body }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: "DELETE" }),
  addChecklist: (tripId, body) => request(`/trips/${tripId}/checklist`, { method: "POST", body }),
  updateChecklist: (id, body) => request(`/checklist/${id}`, { method: "PUT", body }),
  deleteChecklist: (id) => request(`/checklist/${id}`, { method: "DELETE" }),
  addNote: (tripId, body) => request(`/trips/${tripId}/notes`, { method: "POST", body }),
  updateNote: (id, body) => request(`/notes/${id}`, { method: "PUT", body }),
  deleteNote: (id) => request(`/notes/${id}`, { method: "DELETE" }),
  share: (tripId) => request(`/trips/${tripId}/share`, { method: "POST" }),
  publicTrip: (token) => request(`/public/${token}`),
  community: () => request("/community"),
  saved: () => request("/saved"),
  saveCity: (cityId) => request("/saved", { method: "POST", body: { city_id: cityId } }),
  unsaveCity: (cityId) => request(`/saved/${cityId}`, { method: "DELETE" }),
  analytics: () => request("/admin/analytics"),
  adminUpdateUser: (userId, body) => request(`/admin/users/${userId}`, { method: "PUT", body }),
  adminDeleteUser: (userId) => request(`/admin/users/${userId}`, { method: "DELETE" }),
};