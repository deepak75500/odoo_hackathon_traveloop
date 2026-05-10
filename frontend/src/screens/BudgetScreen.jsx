/**
 * BudgetScreen.jsx  —  Traveloop  Screen 14: Expense Invoice / Billing
 *
 * Real-time data sources:
 *   • Transport cost  → OSRM (free, no key) + Nominatim geocoding
 *   • Food cost       → city avg_meal_cost × days (from DB via /api/trips/:id)
 *   • Manual expenses → POST /api/trips/:id/expenses  (stored in SQLite)
 *   • Budget totals   → GET  /api/trips/:id/budget    (auto-calculated by backend)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api.js";

// ─── Formatting helpers ──────────────────────────────────────────────────────
const money = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(v || 0)
  );

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

const daysBetween = (a, b) =>
  Math.max(
    1,
    Math.round((new Date(b) - new Date(a)) / 86_400_000)
  );

// ─── Real-time transport via OSRM + Nominatim (both free, no API key) ────────
const geocodeCache = {};
async function geocodeCity(city, country) {
  const key = `${city},${country}`;
  if (geocodeCache[key]) return geocodeCache[key];
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        city + " " + country
      )}&format=json&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await r.json();
    if (data[0]) {
      const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      geocodeCache[key] = coords;
      return coords;
    }
  } catch (_) {}
  return null;
}

async function fetchRouteCost(fromCity, fromCountry, toCity, toCountry) {
  try {
    const [from, to] = await Promise.all([
      geocodeCity(fromCity, fromCountry),
      geocodeCity(toCity, toCountry),
    ]);
    if (!from || !to) return null;
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`
    );
    const data = await r.json();
    if (data.routes?.[0]) {
      const km = data.routes[0].distance / 1000;
      // Budget air/rail estimate: ~$0.18/km (covers mixed transport)
      return Math.round(km * 0.18);
    }
  } catch (_) {}
  return null;
}

// ─── SVG Donut Chart ─────────────────────────────────────────────────────────
function DonutChart({ segments, size = 140 }) {
  const r = 52;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const COLORS = {
    transport:  "#3B82F6",
    stay:       "#8B5CF6",
    activities: "#F59E0B",
    meals:      "#10B981",
    extras:     "#EF4444",
  };
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="20" />
      {segments.map((seg) => {
        const pct = seg.value / total;
        const dash = pct * circ;
        const gap = circ - dash;
        const el = (
          <circle
            key={seg.key}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={COLORS[seg.key] || "#94A3B8"}
            strokeWidth="20"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset * circ}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        );
        offset += pct;
        return el;
      })}
    </svg>
  );
}

// ─── Legend row ───────────────────────────────────────────────────────────────
const CAT_COLORS = {
  transport:  "#3B82F6",
  stay:       "#8B5CF6",
  activities: "#F59E0B",
  meals:      "#10B981",
  extras:     "#EF4444",
};

// ─── Main Component ──────────────────────────────────────────────────────────
export default function BudgetScreen({ trip, refreshTrip }) {
  // ── form state
  const [form, setForm] = useState({
    category: "extras",
    label: "",
    amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ── real-time transport
  const [rtTransport, setRtTransport] = useState({}); // stopId → {cost, loading, label}

  // ── budget from API
  const [budget, setBudget] = useState(null);
  const [loadingBudget, setLoadingBudget] = useState(false);

  // ── misc
  const [tax, setTax] = useState(5);
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const invoiceRef = useRef();

  // ── load budget whenever trip changes
  useEffect(() => {
    if (!trip?.id) return;
    setLoadingBudget(true);
    api
      .budget(trip.id)
      .then((res) => setBudget(res.budget))
      .catch(() => {})
      .finally(() => setLoadingBudget(false));
  }, [trip?.id, trip?.expenses?.length, trip?.stops?.length]);

  // ── fetch real-time route costs for each stop pair
  useEffect(() => {
    if (!trip?.stops?.length) return;
    const stops = trip.stops;
    stops.forEach((stop, i) => {
      if (i === 0) return; // first stop — no "from" leg
      const prev = stops[i - 1];
      const key = `${prev.id}-${stop.id}`;
      setRtTransport((old) => ({ ...old, [key]: { loading: true, cost: null } }));
      fetchRouteCost(
        prev.city_name,
        prev.country,
        stop.city_name,
        stop.country
      ).then((cost) => {
        setRtTransport((old) => ({
          ...old,
          [key]: {
            loading: false,
            cost,
            label: `${prev.city_name} → ${stop.city_name}`,
          },
        }));
      });
    });
  }, [trip?.id]);

  if (!trip) {
    return (
      <div className="budget-empty">
        <div className="budget-empty__icon">💰</div>
        <h2>No trip selected</h2>
        <p>Select a trip from the sidebar to see its invoice and budget breakdown.</p>
      </div>
    );
  }

  // ── derived numbers
  const cats = budget?.categories || {};
  const expenses = trip.expenses || [];
  const stops = trip.stops || [];

  const subtotal = budget?.total ?? 0;
  const taxAmount = (subtotal * tax) / 100;
  const grandTotal = subtotal + taxAmount - discount;
  const budgetLimit = budget?.budgetLimit || trip.budget_limit || 0;
  const remaining = budgetLimit - subtotal;

  // ── line items for invoice table
  const lineItems = [
    // Auto stops
    ...stops.map((s) => {
      const nights = daysBetween(s.start_date, s.end_date);
      return {
        id: `stop-stay-${s.id}`,
        category: "stay",
        description: `Hotel — ${s.city_name}`,
        qty: `${nights} night${nights !== 1 ? "s" : ""}`,
        unitCost: s.avg_hotel_cost,
        amount: nights * (s.avg_hotel_cost || 0),
        auto: true,
      };
    }),
    // Meals per stop
    ...stops.map((s) => {
      const days = daysBetween(s.start_date, s.end_date) + 1;
      return {
        id: `stop-meals-${s.id}`,
        category: "meals",
        description: `Meals — ${s.city_name}`,
        qty: `${days} day${days !== 1 ? "s" : ""}`,
        unitCost: s.avg_meal_cost,
        amount: days * (s.avg_meal_cost || 0),
        auto: true,
      };
    }),
    // Activities per stop
    ...stops.flatMap((s) =>
      (s.activities || []).map((a) => ({
        id: `act-${a.id}`,
        category: "activities",
        description: `${a.name} (${s.city_name})`,
        qty: `${a.duration_hours}h`,
        unitCost: a.custom_cost ?? a.cost,
        amount: a.custom_cost ?? a.cost,
        auto: true,
      }))
    ),
    // Transport from stops DB
    ...stops
      .filter((s) => s.transport_cost > 0)
      .map((s) => ({
        id: `transport-${s.id}`,
        category: "transport",
        description: `Transport to ${s.city_name}`,
        qty: "1",
        unitCost: s.transport_cost,
        amount: s.transport_cost,
        auto: true,
      })),
    // Manual expenses
    ...expenses.map((e) => ({
      id: `exp-${e.id}`,
      category: e.category,
      description: e.label,
      qty: e.expense_date ? fmtDate(e.expense_date) : "—",
      unitCost: e.amount,
      amount: e.amount,
      auto: false,
      expenseId: e.id,
    })),
  ];

  // ── chart segments
  const chartSegments = Object.entries(cats)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ key, value }));

  // ── add expense
  async function handleAddExpense(e) {
    e.preventDefault();
    if (!form.label.trim() || !form.amount) {
      setError("Label and amount are required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.addExpense(trip.id, {
        category: form.category,
        label: form.label.trim(),
        amount: parseFloat(form.amount),
        expense_date: form.expense_date,
      });
      setForm({ category: "extras", label: "", amount: "", expense_date: new Date().toISOString().slice(0, 10) });
      setSuccess("Expense added and saved to database ✓");
      setShowAddForm(false);
      setTimeout(() => setSuccess(""), 3000);
      await refreshTrip();
    } catch (err) {
      setError(err.message || "Failed to add expense");
    } finally {
      setSaving(false);
    }
  }

  // ── delete expense
  async function handleDelete(expenseId) {
    if (!window.confirm("Remove this expense?")) return;
    try {
      await api.deleteExpense(expenseId);
      await refreshTrip();
    } catch (err) {
      setError(err.message || "Failed to delete");
    }
  }

  // ── PDF export via browser print
  function handlePrint() {
    window.print();
  }

  const invoiceId = `TL-${String(trip.id).padStart(5, "0")}`;
  const generatedDate = fmtDate(new Date().toISOString());

  return (
    <>
      {/* ─────────── Print styles injected inline ─────────── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .invoice-printable, .invoice-printable * { visibility: visible !important; }
          .invoice-printable { position: fixed; inset: 0; z-index: 9999; background: white; padding: 24px; }
          .no-print { display: none !important; }
        }

        .budget-screen {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 20px 24px 40px;
          background: #F8FAFC;
          min-height: 100%;
          font-family: 'Segoe UI', system-ui, sans-serif;
        }

        /* ── Top bar ── */
        .bs-topbar {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .bs-back {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #6366F1;
          background: none;
          border: none;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          text-decoration: none;
        }
        .bs-back:hover { text-decoration: underline; }
        .bs-title {
          font-size: 22px;
          font-weight: 700;
          color: #1E293B;
          margin: 0;
        }
        .bs-subtitle { font-size: 13px; color: #64748B; margin: 0; }

        /* ── Top row: invoice card + budget insights ── */
        .bs-top-row {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 768px) {
          .bs-top-row { grid-template-columns: 1fr; }
        }

        /* ── Invoice card ── */
        .invoice-card {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          gap: 16px;
        }
        .invoice-card__img {
          width: 110px;
          height: 90px;
          object-fit: cover;
          border-radius: 8px;
          flex-shrink: 0;
          background: #E2E8F0;
        }
        .invoice-card__body { flex: 1; min-width: 0; }
        .invoice-card__tripname {
          font-size: 15px;
          font-weight: 700;
          color: #1E293B;
          margin: 0 0 2px;
        }
        .invoice-card__dates { font-size: 12px; color: #64748B; margin: 0 0 10px; }
        .invoice-card__meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 20px;
        }
        .invoice-card__field label {
          display: block;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94A3B8;
          margin-bottom: 2px;
        }
        .invoice-card__field span {
          font-size: 13px;
          color: #1E293B;
          font-weight: 500;
        }
        .badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 99px;
          font-size: 11px;
          font-weight: 600;
        }
        .badge--pending { background: #FEF9C3; color: #92400E; }
        .badge--paid    { background: #DCFCE7; color: #166534; }

        /* ── Budget insights panel ── */
        .insights-panel {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 18px;
        }
        .insights-panel__title {
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #64748B;
          margin: 0 0 14px;
        }
        .insights-panel__chart-wrap {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 14px;
        }
        .insights-panel__numbers { flex: 1; }
        .insights-number {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 5px;
          color: #475569;
        }
        .insights-number strong { color: #1E293B; font-weight: 600; }
        .insights-number.remaining strong { color: #10B981; }
        .insights-number.over strong { color: #EF4444; }
        .legend { margin-top: 10px; }
        .legend-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #475569;
          margin-bottom: 4px;
        }
        .legend-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .insights-panel__btn {
          width: 100%;
          padding: 8px;
          background: #6366F1;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 12px;
        }
        .insights-panel__btn:hover { background: #4F46E5; }

        /* ── Add expense form ── */
        .add-expense-bar {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          overflow: hidden;
        }
        .add-expense-bar__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          cursor: pointer;
          user-select: none;
        }
        .add-expense-bar__header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          color: #1E293B;
        }
        .add-expense-bar__toggle {
          background: #6366F1;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 4px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .expense-form {
          padding: 0 20px 20px;
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr auto;
          gap: 10px;
          align-items: end;
          border-top: 1px solid #F1F5F9;
        }
        @media (max-width: 768px) {
          .expense-form { grid-template-columns: 1fr 1fr; }
        }
        .ef-field label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: #64748B;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .ef-field input,
        .ef-field select {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid #CBD5E1;
          border-radius: 7px;
          font-size: 13px;
          color: #1E293B;
          background: white;
          box-sizing: border-box;
        }
        .ef-field input:focus,
        .ef-field select:focus {
          outline: none;
          border-color: #6366F1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }
        .ef-submit {
          padding: 9px 18px;
          background: #10B981;
          color: white;
          border: none;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .ef-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .ef-submit:hover:not(:disabled) { background: #059669; }

        /* ── Real-time transport panel ── */
        .rt-panel {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 16px 20px;
        }
        .rt-panel__title {
          font-size: 13px;
          font-weight: 700;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin: 0 0 10px;
        }
        .rt-rows { display: flex; flex-direction: column; gap: 6px; }
        .rt-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 7px 12px;
          background: #F8FAFC;
          border-radius: 8px;
          font-size: 13px;
        }
        .rt-row__label { color: #475569; }
        .rt-row__cost { font-weight: 600; color: #1E293B; }
        .rt-row__loading { color: #94A3B8; font-size: 12px; font-style: italic; }
        .rt-row__note { font-size: 11px; color: #94A3B8; margin-top: 2px; }

        /* ── Invoice table ── */
        .invoice-section {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          overflow: hidden;
        }
        .invoice-section__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px 12px;
          border-bottom: 1px solid #F1F5F9;
        }
        .invoice-section__head h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          color: #1E293B;
        }
        .invoice-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .invoice-table th {
          text-align: left;
          padding: 10px 16px;
          background: #F8FAFC;
          font-size: 11px;
          font-weight: 700;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #E2E8F0;
        }
        .invoice-table td {
          padding: 11px 16px;
          border-bottom: 1px solid #F1F5F9;
          color: #1E293B;
          vertical-align: middle;
        }
        .invoice-table tr:last-child td { border-bottom: none; }
        .invoice-table tr:hover td { background: #FAFBFF; }
        .invoice-table .num { text-align: right; font-variant-numeric: tabular-nums; }
        .cat-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .cat-transport  { background: #DBEAFE; color: #1D4ED8; }
        .cat-stay       { background: #EDE9FE; color: #6D28D9; }
        .cat-activities { background: #FEF3C7; color: #92400E; }
        .cat-meals      { background: #D1FAE5; color: #065F46; }
        .cat-extras     { background: #FEE2E2; color: #991B1B; }
        .auto-tag {
          display: inline-block;
          margin-left: 6px;
          font-size: 10px;
          color: #94A3B8;
          font-style: italic;
        }
        .del-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #CBD5E1;
          font-size: 16px;
          padding: 2px 6px;
          border-radius: 4px;
          transition: color 0.15s, background 0.15s;
        }
        .del-btn:hover { color: #EF4444; background: #FEF2F2; }

        /* ── Totals ── */
        .totals-section {
          padding: 16px 20px;
          border-top: 2px solid #E2E8F0;
          display: flex;
          justify-content: flex-end;
        }
        .totals-box { min-width: 280px; }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 5px 0;
          font-size: 13px;
          color: #475569;
        }
        .totals-row.grand {
          border-top: 2px solid #1E293B;
          margin-top: 6px;
          padding-top: 10px;
          font-size: 16px;
          font-weight: 700;
          color: #1E293B;
        }
        .totals-input {
          width: 60px;
          padding: 2px 6px;
          border: 1px solid #CBD5E1;
          border-radius: 4px;
          font-size: 13px;
          text-align: right;
        }

        /* ── Footer buttons ── */
        .bs-footer {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          padding: 4px 0;
        }
        .btn { 
          padding: 9px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
        }
        .btn-outline {
          background: white;
          border: 1.5px solid #CBD5E1;
          color: #1E293B;
        }
        .btn-outline:hover { border-color: #6366F1; color: #6366F1; }
        .btn-primary { background: #6366F1; color: white; }
        .btn-primary:hover { background: #4F46E5; }
        .btn-success { background: #10B981; color: white; }
        .btn-success:hover { background: #059669; }
        .btn-paid { background: #DCFCE7; color: #166534; border: 1.5px solid #A7F3D0; }

        /* ── Alert ── */
        .bs-alert {
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
        }
        .bs-alert--error { background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; }
        .bs-alert--success { background: #F0FDF4; color: #166534; border: 1px solid #A7F3D0; }

        /* ── Loading ── */
        .bs-loading { text-align: center; padding: 60px; color: #94A3B8; font-size: 15px; }

        /* ── Empty ── */
        .budget-empty { 
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; height: 300px; color: #94A3B8; text-align: center;
        }
        .budget-empty__icon { font-size: 40px; margin-bottom: 12px; }
        .budget-empty h2 { margin: 0 0 6px; color: #475569; font-size: 18px; }
      `}</style>

      <div className="budget-screen invoice-printable" ref={invoiceRef}>

        {/* ── Topbar ── */}
        <div className="bs-topbar no-print">
          <div>
            <h1 className="bs-title">📄 Expense Invoice</h1>
            <p className="bs-subtitle">Screen 14 · All data stored in database · Real-time costs</p>
          </div>
        </div>

        {/* ── Alerts ── */}
        {error   && <div className="bs-alert bs-alert--error">{error}</div>}
        {success && <div className="bs-alert bs-alert--success">{success}</div>}

        {/* ── Top row: invoice card + insights ── */}
        <div className="bs-top-row">

          {/* Invoice card */}
          <div className="invoice-card">
            {trip.cover_photo ? (
              <img
                className="invoice-card__img"
                src={trip.cover_photo}
                alt={trip.name}
                onError={(e) => (e.target.style.display = "none")}
              />
            ) : (
              <div className="invoice-card__img" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🧳</div>
            )}
            <div className="invoice-card__body">
              <p className="invoice-card__tripname">{trip.name}</p>
              <p className="invoice-card__dates">
                {fmtDate(trip.start_date)} — {fmtDate(trip.end_date)} ·{" "}
                {stops.length} destination{stops.length !== 1 ? "s" : ""}
              </p>
              <div className="invoice-card__meta">
                <div className="invoice-card__field">
                  <label>Invoice ID</label>
                  <span>{invoiceId}</span>
                </div>
                <div className="invoice-card__field">
                  <label>Generated Date</label>
                  <span>{generatedDate}</span>
                </div>
                <div className="invoice-card__field">
                  <label>Traveler</label>
                  <span>{trip.user_name || "You"}</span>
                </div>
                <div className="invoice-card__field">
                  <label>Payment Status</label>
                  <span>
                    <span className={`badge ${paid ? "badge--paid" : "badge--pending"}`}>
                      {paid ? "✓ Paid" : "Pending"}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Budget Insights */}
          <div className="insights-panel">
            <p className="insights-panel__title">Budget Insights</p>
            {loadingBudget ? (
              <p style={{ fontSize: 12, color: "#94A3B8" }}>Loading…</p>
            ) : (
              <>
                <div className="insights-panel__chart-wrap">
                  <DonutChart segments={chartSegments} />
                  <div className="insights-panel__numbers">
                    <div className="insights-number">
                      <span>Total Budget</span>
                      <strong>{money(budgetLimit)}</strong>
                    </div>
                    <div className="insights-number">
                      <span>Total Spent</span>
                      <strong>{money(subtotal)}</strong>
                    </div>
                    <div className={`insights-number ${remaining >= 0 ? "remaining" : "over"}`}>
                      <span>{remaining >= 0 ? "Remaining" : "Over Budget"}</span>
                      <strong>{money(Math.abs(remaining))}</strong>
                    </div>
                    <div className="legend">
                      {chartSegments.map((seg) => (
                        <div className="legend-row" key={seg.key}>
                          <span className="legend-dot" style={{ background: CAT_COLORS[seg.key] || "#94A3B8" }} />
                          <span style={{ flex: 1, textTransform: "capitalize" }}>{seg.key}</span>
                          <strong style={{ fontSize: 11 }}>{money(seg.value)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            <button className="insights-panel__btn" onClick={() => document.getElementById("invoice-table-section")?.scrollIntoView({ behavior: "smooth" })}>
              View Full Budget ↓
            </button>
          </div>
        </div>

        {/* ── Real-time transport estimates ── */}
        {Object.keys(rtTransport).length > 0 && (
          <div className="rt-panel no-print">
            <p className="rt-panel__title">🛤 Real-Time Route Cost Estimates (OSRM)</p>
            <div className="rt-rows">
              {Object.entries(rtTransport).map(([key, val]) => (
                <div className="rt-row" key={key}>
                  <div>
                    <div className="rt-row__label">{val.label || key}</div>
                    <div className="rt-row__note">Via OSRM distance model · ~$0.18/km estimate</div>
                  </div>
                  {val.loading ? (
                    <span className="rt-row__loading">Calculating…</span>
                  ) : val.cost != null ? (
                    <span className="rt-row__cost">≈ {money(val.cost)}</span>
                  ) : (
                    <span className="rt-row__loading">N/A</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Add expense ── */}
        <div className="add-expense-bar no-print">
          <div className="add-expense-bar__header" onClick={() => setShowAddForm((v) => !v)}>
            <h3>➕ Add Manual Expense</h3>
            <button className="add-expense-bar__toggle">
              {showAddForm ? "▲ Close" : "▼ Open"}
            </button>
          </div>
          {showAddForm && (
            <form className="expense-form" onSubmit={handleAddExpense}>
              <div className="ef-field">
                <label>Description</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Museum ticket"
                  required
                />
              </div>
              <div className="ef-field">
                <label>Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {["transport", "stay", "activities", "meals", "extras"].map((c) => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="ef-field">
                <label>Amount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="ef-field">
                <label>Date</label>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                />
              </div>
              <button className="ef-submit" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Add & Save"}
              </button>
            </form>
          )}
        </div>

        {/* ── Invoice table ── */}
        <div className="invoice-section" id="invoice-table-section">
          <div className="invoice-section__head">
            <h3>Invoice Line Items</h3>
            <span style={{ fontSize: 12, color: "#94A3B8" }}>
              Auto-calculated + {expenses.length} manual expense{expenses.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="invoice-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Qty / Details</th>
                  <th className="num">Unit Cost</th>
                  <th className="num">Amount</th>
                  <th style={{ width: 36 }} className="no-print" />
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#94A3B8", padding: "24px" }}>
                      No line items yet. Add stops to your trip or manually add expenses above.
                    </td>
                  </tr>
                )}
                {lineItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td style={{ color: "#94A3B8", fontWeight: 600 }}>{idx + 1}</td>
                    <td>
                      <span className={`cat-badge cat-${item.category}`}>
                        {item.category}
                      </span>
                    </td>
                    <td>
                      {item.description}
                      {item.auto && <span className="auto-tag">auto</span>}
                    </td>
                    <td style={{ color: "#64748B" }}>{item.qty}</td>
                    <td className="num">{money(item.unitCost)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{money(item.amount)}</td>
                    <td className="no-print">
                      {!item.auto && item.expenseId && (
                        <button
                          className="del-btn"
                          title="Delete expense"
                          onClick={() => handleDelete(item.expenseId)}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="totals-section">
            <div className="totals-box">
              <div className="totals-row">
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <div className="totals-row">
                <span>
                  Tax (
                  <input
                    className="totals-input no-print"
                    type="number"
                    min="0"
                    max="50"
                    value={tax}
                    onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                  />
                  <span className="invoice-printable" style={{ display: "none" }}>{tax}</span>
                  %)
                </span>
                <strong>{money(taxAmount)}</strong>
              </div>
              <div className="totals-row">
                <span>
                  Discount ($
                  <input
                    className="totals-input no-print"
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  />
                  )
                </span>
                <strong style={{ color: "#10B981" }}>− {money(discount)}</strong>
              </div>
              <div className="totals-row grand">
                <span>Grand Total</span>
                <span>{money(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="bs-footer no-print">
          <button className="btn btn-outline" onClick={handlePrint}>
            🖨 Download Invoice
          </button>
          <button className="btn btn-outline" onClick={handlePrint}>
            📄 Export as PDF
          </button>
          <button
            className={`btn ${paid ? "btn-paid" : "btn-success"}`}
            onClick={() => setPaid((v) => !v)}
          >
            {paid ? "✓ Marked as Paid" : "Mark as Paid"}
          </button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#94A3B8" }}>
            {budget?.averagePerDay ? `≈ ${money(budget.averagePerDay)}/day average` : ""}
          </span>
        </div>

      </div>
    </>
  );
}