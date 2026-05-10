import { useState } from "react";
import { api } from "../api.js";
import { Button, EmptyState, Field, IconButton, Icons, PageHeader, Panel, money, shortDate } from "../components/ui.jsx";

export default function BudgetScreen({ trip, refreshTrip }) {
  const [expense, setExpense] = useState({ category: "extras", label: "", amount: "", expense_date: "" });
  if (!trip) return <EmptyState title="Select a trip">Budget is calculated from stops, activities, meals, stays, transport, and manual expenses.</EmptyState>;

  const budget = trip.budget || {};
  const categories = budget.categories || {};
  const total = budget.total || 0;

  async function addExpense(event) {
    event.preventDefault();
    await api.addExpense(trip.id, expense);
    setExpense({ category: "extras", label: "", amount: "", expense_date: "" });
    refreshTrip();
  }

  async function removeExpense(id) {
    await api.deleteExpense(id);
    refreshTrip();
  }

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Budget" title="Itinerary View with Budget Section" subtitle={`${money(total)} estimated total | ${money(budget.averagePerDay)} average per day`} />
      <div className="budget-layout">
        <Panel title="Cost breakdown">
          <div className="donut" style={{ "--pct": `${Math.min(100, total / Math.max(1, budget.budgetLimit || total) * 100)}%` }}>
            <strong>{money(total)}</strong>
            <span>of {money(budget.budgetLimit)}</span>
          </div>
          <div className="bar-list">
            {Object.entries(categories).map(([key, value]) => (
              <div className="bar-row" key={key}>
                <span>{key}</span>
                <div><i style={{ width: `${Math.min(100, value / Math.max(1, total) * 100)}%` }} /></div>
                <strong>{money(value)}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Over-budget days">
          {budget.overBudgetDays?.length ? budget.overBudgetDays.map((day) => (
            <div className="simple-row" key={day.date}><span>{shortDate(day.date)}</span><strong>{money(day.amount)}</strong></div>
          )) : <p className="subtle">No day is above the daily target.</p>}
        </Panel>
      </div>
      <Panel title="Expense insertion / billing">
        <form className="expense-form" onSubmit={addExpense}>
          <Field label="Label"><input value={expense.label} onChange={(e) => setExpense({ ...expense, label: e.target.value })} required /></Field>
          <Field label="Category">
            <select value={expense.category} onChange={(e) => setExpense({ ...expense, category: e.target.value })}>
              {["transport", "stay", "activities", "meals", "extras"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Amount"><input type="number" min="0" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} required /></Field>
          <Field label="Date"><input type="date" value={expense.expense_date} onChange={(e) => setExpense({ ...expense, expense_date: e.target.value })} /></Field>
          <Button icon={Icons.Plus}>Add Expense</Button>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>Label</th><th>Date</th><th>Amount</th><th /></tr></thead>
            <tbody>
              {(trip.expenses || []).map((item) => (
                <tr key={item.id}>
                  <td>{item.category}</td><td>{item.label}</td><td>{item.expense_date || "-"}</td><td>{money(item.amount)}</td>
                  <td><IconButton icon={Icons.Trash2} label="Delete expense" variant="danger" onClick={() => removeExpense(item.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
