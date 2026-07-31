import Link from "next/link";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-slate-700">{children}</h2>;
}

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "red" | "blue" | "orange" | "green" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
    orange: "bg-orange-50 text-orange-700",
    green: "bg-green-50 text-green-700",
  };
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Button({
  children,
  onClick,
  disabled,
  type = "button",
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-3 py-2 text-sm font-medium transition ${styles[variant]} disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
      />
    </label>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

export function ExternalLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <span>{children}</span>;
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
      {children}
    </Link>
  );
}
