"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />;
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" };

export function EnrollmentChart({ data }: { data: { month: string; total: number; added: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs><linearGradient id="enr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--brand)" stopOpacity={0} /></linearGradient></defs>
        {grid}
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} formatter={(v, n) => [v, n === "total" ? "Active players" : "New"]} />
        <Area type="monotone" dataKey="total" stroke="var(--brand)" strokeWidth={2} fill="url(#enr)" activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AttendanceChart({ data }: { data: { week: string; rate: number | null; sessions: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        {grid}
        <XAxis dataKey="week" {...axis} />
        <YAxis {...axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} formatter={(v) => [v == null ? "No sessions" : `${v}%`, "Attendance"]} />
        <Line type="monotone" dataKey="rate" stroke="var(--brand)" strokeWidth={2} connectNulls dot={{ r: 3.5, fill: "var(--brand)", stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GroupChart({ data }: { data: { name: string; players: number; capacity: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }} barCategoryGap={8}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" {...axis} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...axis} width={86} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} formatter={(v, _n, p) => [`${v}${(p.payload as { capacity: number | null }).capacity ? ` of ${(p.payload as { capacity: number }).capacity}` : ""}`, "Players"]} />
        <Bar dataKey="players" fill="var(--brand)" radius={[0, 4, 4, 0]} maxBarSize={20} label={{ position: "right", fill: "var(--muted)", fontSize: 11 }} />
      </BarChart>
    </ResponsiveContainer>
  );
}
