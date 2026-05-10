import { useRef, useState } from "react";
import { api } from "../api.js";
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Icons,
  PageHeader,
  Panel,
  money,
  shortDate,
} from "../components/ui.jsx";

// ── Category badge colours ────────────────────
const CATEGORY_COLORS = {
  transport: "#4f8ef7",
  stay: "#7c5cbf",
  food: "#f7a94f",
  extras: "#4fc78e",
  activities: "#e06060",
};

function categoryColor(cat) {
  return CATEGORY_COLORS[cat?.toLowerCase()] || "#888";
}

// ── Donut / pie stand-in (pure CSS) ─────────
function BudgetDonut({ trip }) {
  const expenses = trip.expenses || [];
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const actCost = (trip.stops || []).reduce(
    (s, stop) =>
      s +
      (stop.activities || []).reduce(
        (a, act) => a + (act.custom_cost ?? act.cost ?? 0),
        0
      ),
    0
  );
  const transport = (trip.stops || []).reduce(
    (s, stop) => s + (stop.transport_cost || 0),
    0
  );
  const total = totalExpenses + actCost + transport;
  const limit = trip.budget_limit || 0;
  const remaining = Math.max(0, limit - total);
  const pct = limit > 0 ? Math.min(100, (total / limit) * 100) : 0;

  return (
    <div className="budget-donut-card">
      <h4>Budget Summary</h4>
      <div className="budget-donut-ring-wrap">
        <svg viewBox="0 0 80 80" className="budget-donut-svg">
          <circle cx="40" cy="40" r="32" fill="none" stroke="#f0f0f0" strokeWidth="12" />
          <circle
            cx="40" cy="40" r="32"
            fill="none"
            stroke={pct > 90 ? "#e06060" : pct > 70 ? "#f7a94f" : "#4fc78e"}
            strokeWidth="12"
            strokeDasharray={`${pct * 2.01} ${200 - pct * 2.01}`}
            strokeDashoffset="50"
            strokeLinecap="round"
          />
        </svg>
        <div className="budget-donut-label">
          <strong>{pct.toFixed(0)}%</strong>
          <span>used</span>
        </div>
      </div>
      <div className="budget-donut-stats">
        <div className="bds-row"><span>Total Budget</span><strong>{money(limit)}</strong></div>
        <div className="bds-row"><span>Total Spent</span><strong>{money(total)}</strong></div>
        <div className="bds-row" style={{ color: remaining === 0 ? "#e06060" : "#4fc78e" }}>
          <span>Remaining</span><strong>{money(remaining)}</strong>
        </div>
      </div>
    </div>
  );
}

// ── Add Expense Form ─────────────────────────
function AddExpenseForm({ tripId, onAdded }) {
  const [form, setForm] = useState({
    category: "transport",
    label: "",
    amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.addExpense(tripId, {
        ...form,
        amount: parseFloat(form.amount),
      });
      setForm({ category: "transport", label: "", amount: "", expense_date: new Date().toISOString().slice(0, 10) });
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <Field label="Category">
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          {["transport", "stay", "food", "extras", "activities"].map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </Field>
      <Field label="Description">
        <input
          placeholder="e.g. Initial booking parts"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          required
        />
      </Field>
      <Field label="Amount ($)">
        <input
          type="number"
          step="0.01"
          placeholder="0.00"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          required
        />
      </Field>
      <Field label="Date">
        <input
          type="date"
          value={form.expense_date}
          onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
        />
      </Field>
      <div className="wide form-actions">
        <Button icon={Icons.Plus} disabled={saving}>
          {saving ? "Adding…" : "Add Expense"}
        </Button>
      </div>
    </form>
  );
}

// ── Invoice Table ─────────────────────────────
function InvoiceTable({ trip, onDelete }) {
  const rows = trip.expenses || [];

  const byCategory = rows.reduce((acc, row) => {
    acc[row.category] = (acc[row.category] || 0) + (row.amount || 0);
    return acc;
  }, {});

  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="invoice-wrap">
      {/* Invoice Header */}
      <div className="invoice-header">
        <div className="invoice-brand">
          <div className="invoice-logo">
            <Icons.Plane size={24} />
          </div>
          <div>
            <strong>{trip.name}</strong>
            <p className="subtle">{trip.description}</p>
          </div>
        </div>
        <div className="invoice-meta">
          <div><span>Invoice ID:</span> <strong>TRP-{trip.id}</strong></div>
          <div><span>Travel dates:</span> <strong>{shortDate(trip.start_date)} – {shortDate(trip.end_date)}</strong></div>
          <div><span>Payment status:</span> <span className="status-pill status-pending">Pending · activity</span></div>
          <div className="invoice-detail-sub">
            <small>Travel details</small>
            {(trip.stops || []).map((s) => (
              <span key={s.id} className="invoice-stop-tag">{s.city_name}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Line items table */}
      <div className="table-wrap">
        <table className="invoice-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Category</th>
              <th>Description</th>
              <th>Qty / Nights</th>
              <th>Unit Cost</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="subtle" style={{ textAlign: "center", padding: "1.5rem" }}>
                  No expenses added yet.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.id}>
                <td>{i + 1}</td>
                <td>
                  <span
                    className="category-pill"
                    style={{ background: categoryColor(row.category) }}
                  >
                    {row.category}
                  </span>
                </td>
                <td>{row.label}</td>
                <td>1</td>
                <td>{money(row.amount)}</td>
                <td><strong>{money(row.amount)}</strong></td>
                <td>
                  <IconButton
                    icon={Icons.Trash2}
                    label="Delete expense"
                    variant="danger"
                    onClick={() => onDelete(row.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {Object.entries(byCategory).map(([cat, amt]) => (
              <tr key={cat} className="subtotal-row">
                <td colSpan={4}></td>
                <td className="subtle">{cat.charAt(0).toUpperCase() + cat.slice(1)}</td>
                <td><strong>{money(amt)}</strong></td>
                <td></td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={4}></td>
              <td>Grand Total</td>
              <td><strong>{money(total)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────
export function ExpenseInvoiceScreen({ trip, refreshTrip }) {
  const [tab, setTab] = useState("invoice"); // 'invoice' | 'add'

  if (!trip)
    return (
      <EmptyState title="Select a trip">
        Expense invoices and billing are stored per trip.
      </EmptyState>
    );

  async function deleteExpense(id) {
    if (!confirm("Delete this expense?")) return;
    await api.deleteExpense(id);
    refreshTrip();
  }

  function downloadInvoice() {
    const rows = (trip.expenses || [])
      .map((e, i) => `${i + 1},${e.category},${e.label},1,${e.amount},${e.amount}`)
      .join("\n");
    const csv =
      "#,Category,Description,Qty,Unit Cost,Amount\n" +
      rows +
      `\n,,,,Grand Total,${(trip.expenses || []).reduce((s, e) => s + e.amount, 0)}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `invoice-${trip.id}.csv`;
    a.click();
  }

  async function markAsPaid() {
    // Placeholder – extend your API to support trip status updates
    alert("Trip marked as paid (implement api.markPaid in your backend).");
  }

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Expense Invoice / Billing"
        title={trip.name}
        subtitle="Track and export all trip expenses with a detailed invoice breakdown."
      />

      {/* Back to trip button */}
      <div className="listing-toolbar">
        <button
          className={`btn ${tab === "invoice" ? "btn-primary" : "btn-outline"}`}
          onClick={() => setTab("invoice")}
        >
          <Icons.FileText size={14} /> Invoice
        </button>
        <button
          className={`btn ${tab === "add" ? "btn-primary" : "btn-outline"}`}
          onClick={() => setTab("add")}
        >
          <Icons.Plus size={14} /> Add Expense
        </button>
      </div>

      <div className="invoice-layout">
        {/* Left: invoice or add form */}
        <div className="invoice-main">
          {tab === "invoice" ? (
            <Panel>
              <InvoiceTable trip={trip} onDelete={deleteExpense} />
            </Panel>
          ) : (
            <Panel title="Add New Expense">
              <AddExpenseForm
                tripId={trip.id}
                onAdded={() => { setTab("invoice"); refreshTrip(); }}
              />
            </Panel>
          )}
        </div>

        {/* Right: budget donut */}
        <div className="invoice-sidebar">
          <BudgetDonut trip={trip} />

          <div className="invoice-action-buttons">
            <button className="btn btn-outline" onClick={downloadInvoice}>
              <Icons.Download size={14} /> Download Invoice
            </button>
            <button className="btn btn-outline" onClick={() => window.print()}>
              <Icons.Printer size={14} /> Export as PDF
            </button>
            <button className="btn btn-primary" onClick={markAsPaid}>
              <Icons.Check size={14} /> Mark as Paid
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
