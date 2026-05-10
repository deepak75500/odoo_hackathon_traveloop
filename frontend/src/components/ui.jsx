import {
  BarChart3,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Home,
  Luggage,
  Map,
  MapPin,
  NotebookText,
  Pencil,
  Plane,
  Plus,
  Search,
  Settings,
  Share2,
  Trash2,
  User,
  Users,
  WandSparkles,
} from "lucide-react";

export const Icons = {
  BarChart3,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Home,
  Luggage,
  Map,
  MapPin,
  NotebookText,
  Pencil,
  Plane,
  Plus,
  Search,
  Settings,
  Share2,
  Trash2,
  User,
  Users,
  WandSparkles,
};

export function Button({ children, icon: Icon, variant = "primary", ...props }) {
  return (
    <button type="button" className={`btn btn-${variant}`} {...props}>
      {Icon && <Icon size={17} />}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({ icon: Icon, label, variant = "ghost", ...props }) {
  return (
    <button className={`icon-btn icon-${variant}`} title={label} aria-label={label} {...props}>
      <Icon size={18} />
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="subtle">{subtitle}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}

export function Panel({ title, actions, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          {title ? <h2>{title}</h2> : <span />}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Plane size={26} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Stat({ label, value, icon: Icon, tone = "green" }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-icon">{Icon && <Icon size={21} />}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export function TripSelect({ trips, selectedTripId, onChange }) {
  return (
    <div className="trip-select">
      <CalendarDays size={17} />
      <select
        value={selectedTripId || ""}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value ? Number(value) : null);
        }}
      >
        <option value="" disabled>
          Select trip
        </option>
        {trips.map((trip) => (
          <option key={trip.id} value={trip.id}>
            {trip.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ImageBlock({ src, label }) {
  return <div className="image-block" style={{ backgroundImage: `url(${src || ""})` }} role="img" aria-label={label} />;
}

export function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function shortDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
