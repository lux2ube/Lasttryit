import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadialBarChart, RadialBar,
  ComposedChart, Line, Legend,
} from "recharts";
import {
  Users, FileText, AlertTriangle, Activity, ArrowUpRight, ArrowDownRight,
  DollarSign, TrendingUp, TrendingDown, Droplets, CheckCircle, Zap,
  Calendar, BarChart2, Receipt,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format, parseISO } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalCustomers: number;
  activeCustomers: number;
  totalRecords: number;
  pendingRecords: number;
  totalVolumeUsd: number;
  todayRevenue: number;
  blacklistedCount: number;
  highRiskCount: number;
  cashInflowCount: number;
  cashOutflowCount: number;
  cryptoInflowCount: number;
  cryptoOutflowCount: number;
  recordsByStage: Record<string, number>;
  recentActivity: Array<{
    id: string;
    entityType: string;
    action: string;
    actorName: string | null;
    createdAt: string;
  }>;
}

interface ReportsData {
  volumeByDay:          Array<{ date: string; cashInflowUsd: number; cashOutflowUsd: number; cryptoInflowUsd: number; cryptoOutflowUsd: number; totalUsd: number }>;
  revenueByDay:         Array<{ date: string; fee: number; spread: number; net: number }>;
  volumeByCurrency:     Array<{ currency: string; inflow: number; outflow: number; netUsd: number; count: number }>;
  recordsStatusSummary: Array<{ stage: string; type: string; count: number; totalAmount: number; currency: string }>;
  totalFeeRevenue:      number;
  totalSpread:          number;
  totalVolume:          number;
}

interface LiquidityStatus {
  pendingOutflowUsd: number;
  estimatedBalanceUsd: number;
  coverageRatio: number;
  status: "safe" | "warning" | "critical";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usd(n: number | undefined | null, digits = 0) {
  if (n == null) return "—";
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function num(n: number | undefined | null) {
  if (n == null) return "—";
  return n.toLocaleString();
}

const fmtDay = (d: string) => {
  try { return format(parseISO(d), "MMM d"); } catch { return d; }
};

const actionColors: Record<string, string> = {
  created:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  updated:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  deleted:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  confirmed:"bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

// Custom gradient tooltip
function ChartTooltip({ active, payload, label, prefix = "$" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-xl shadow-xl px-4 py-3 text-xs min-w-[140px]">
      <p className="font-bold text-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mt-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground capitalize">{p.name}</span>
          </span>
          <span className="font-bold tabular-nums" style={{ color: p.color }}>
            {prefix}{Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Mini KPI ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, gradient, trend }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; gradient: string; trend?: "up" | "down" | "neutral";
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : null;
  return (
    <Card className="hover-elevate overflow-hidden relative">
      <div className={`absolute inset-0 opacity-[0.06] ${gradient}`} />
      <CardContent className="p-5 relative">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-2xl ${gradient} flex items-center justify-center shadow-sm`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          {TrendIcon && (
            <TrendIcon className={`w-4 h-4 ${trend === "up" ? "text-emerald-500" : "text-red-400"}`} />
          )}
        </div>
        <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
        <p className="text-xs font-medium text-foreground/70 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, right }: { icon: React.ElementType; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-semibold text-sm text-foreground">{title}</h2>
      </div>
      {right}
    </div>
  );
}

// ─── Period Toggle ────────────────────────────────────────────────────────────

function PeriodToggle({ value, onChange }: { value: 7 | 30; onChange: (v: 7 | 30) => void }) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden text-xs">
      {([7, 30] as const).map(d => (
        <button key={d}
          onClick={() => onChange(d)}
          className={`px-3 py-1.5 font-medium transition-colors ${value === d ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
          {d === 7 ? "7D" : "30D"}
        </button>
      ))}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const [days, setDays] = useState<7 | 30>(7);

  const { data: stats, isLoading } = useQuery<DashboardStats>({ queryKey: ["/api/dashboard/stats"] });
  const { data: reports, isLoading: rLoading } = useQuery<ReportsData>({
    queryKey: ["/api/reports", days],
    queryFn: () => fetch(`/api/reports?days=${days}`, { credentials: "include" }).then(r => r.json()),
  });
  const { data: liquidity } = useQuery<LiquidityStatus>({
    queryKey: ["/api/compliance/liquidity-status"],
    refetchInterval: 120_000,
  });

  // ── Derived chart data ───────────────────────────────────────────────────

  // Volume area chart: 4 record types per day
  const volumeCurve = (reports?.volumeByDay ?? []).map(d => ({
    date: fmtDay(d.date),
    "Cash Inflow":    d.cashInflowUsd,
    "Cash Outflow":   d.cashOutflowUsd,
    "Crypto Inflow":  d.cryptoInflowUsd,
    "Crypto Outflow": d.cryptoOutflowUsd,
  }));

  // Revenue curve: fee, spread, net per day
  const revenueCurve = (reports?.revenueByDay ?? []).map(d => ({
    date:   fmtDay(d.date),
    Fee:    d.fee,
    Spread: d.spread,
    Net:    d.net,
  }));

  // Currency volume bars (top 6)
  const currencyBars = (reports?.volumeByCurrency ?? [])
    .sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow))
    .slice(0, 6)
    .map(c => ({ name: c.currency, Inflow: c.inflow, Outflow: c.outflow }));

  // Record type volume donut — derived from volumeByDay USD fields (always USD, never raw native)
  const _vd = reports?.volumeByDay ?? [];
  const typeDonut = [
    { name: "Cash Inflow",    value: _vd.reduce((s, d) => s + d.cashInflowUsd,    0) },
    { name: "Cash Outflow",   value: _vd.reduce((s, d) => s + d.cashOutflowUsd,   0) },
    { name: "Crypto Inflow",  value: _vd.reduce((s, d) => s + d.cryptoInflowUsd,  0) },
    { name: "Crypto Outflow", value: _vd.reduce((s, d) => s + d.cryptoOutflowUsd, 0) },
  ].filter(d => d.value > 0);

  // Revenue vs Expense summary bars
  const revTotal = (reports?.totalFeeRevenue ?? 0) + (reports?.totalSpread ?? 0);
  const revBars = [
    { name: "Fee Revenue",    value: reports?.totalFeeRevenue ?? 0, color: "#6366f1" },
    { name: "Spread Revenue", value: reports?.totalSpread ?? 0,     color: "#10b981" },
  ];


  // ── Liquidity ────────────────────────────────────────────────────────────

  const ratio  = liquidity?.coverageRatio ?? 0;
  const status = liquidity?.status ?? "safe";
  const liquidityCfg = {
    safe:     { label: "Safe",     bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800/50", bg: "bg-emerald-50 dark:bg-emerald-900/10", icon: CheckCircle },
    warning:  { label: "Warning",  bar: "bg-amber-500",   text: "text-amber-600 dark:text-amber-400",     border: "border-amber-200 dark:border-amber-800/50",     bg: "bg-amber-50 dark:bg-amber-900/10",     icon: AlertTriangle },
    critical: { label: "Critical", bar: "bg-red-500",     text: "text-red-600 dark:text-red-400",         border: "border-red-200 dark:border-red-800/50",         bg: "bg-red-50 dark:bg-red-900/10",         icon: Zap },
  }[status];
  const LiqIcon = liquidityCfg.icon;

  // Donut colors aligned with VOL_COLORS order: Cash Inflow, Cash Outflow, Crypto Inflow, Crypto Outflow
  const DONUT_COLORS = ["#10b981", "#f59e0b", "#6366f1", "#ef4444"];
  const VOL_COLORS: Record<string, string> = {
    "Cash Inflow":    "#10b981",
    "Cash Outflow":   "#f59e0b",
    "Crypto Inflow":  "#6366f1",
    "Crypto Outflow": "#ef4444",
  };
  const REV_COLORS   = { Fee: "#6366f1", Spread: "#10b981", Net: "#f59e0b" };

  const noData = (arr: any[]) => arr.every(d => Object.values(d).slice(1).every(v => !v));

  return (
    <div className="flex flex-col h-full overflow-auto bg-muted/20">
      <div className="p-3 sm:p-6 space-y-6 sm:space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome back, <span className="font-medium text-foreground">{user?.fullName?.split(" ")[0]}</span> — here's your operations snapshot.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-background border border-border rounded-xl px-3 py-2">
            <Calendar className="w-3.5 h-3.5" />
            {format(new Date(), "EEEE, MMMM d yyyy")}
          </div>
        </div>

        {/* ── KPI Row ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard label="Total Customers"  icon={Users}         gradient="bg-gradient-to-br from-blue-500 to-blue-600"     value={isLoading ? "…" : num(stats?.totalCustomers)}    sub={`${stats?.activeCustomers ?? 0} active`}           trend="up" />
          <KpiCard label="Total Records"    icon={FileText}      gradient="bg-gradient-to-br from-emerald-500 to-teal-600"  value={isLoading ? "…" : num(stats?.totalRecords)}      sub={`${stats?.pendingRecords ?? 0} pending`}           trend="neutral" />
          <KpiCard label="Total Volume"     icon={DollarSign}    gradient="bg-gradient-to-br from-indigo-500 to-violet-600" value={isLoading ? "…" : usd(stats?.totalVolumeUsd)}    sub="all-time USD"                                      trend="up" />
          <KpiCard label="Today Revenue"    icon={Receipt}       gradient="bg-gradient-to-br from-amber-500 to-orange-500"  value={isLoading ? "…" : usd(stats?.todayRevenue, 2)}   sub="fees (confirmed today)"                            trend="up" />
          <KpiCard label="Cash Inflow"      icon={ArrowUpRight}  gradient="bg-gradient-to-br from-green-500 to-emerald-600" value={isLoading ? "…" : num(stats?.cashInflowCount)}   sub="cash inflow records"                               trend="up" />
          <KpiCard label="High Risk"        icon={AlertTriangle} gradient="bg-gradient-to-br from-red-500 to-rose-600"      value={isLoading ? "…" : num(stats?.highRiskCount)}     sub={`${stats?.blacklistedCount ?? 0} blacklisted`}     trend="down" />
        </div>

        {/* ── Volume Curves ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-0">
            <SectionHeader
              icon={BarChart2}
              title="Record Volume by Type"
              right={
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">USD equivalent</span>
                  <PeriodToggle value={days} onChange={setDays} />
                </div>
              }
            />
          </CardHeader>
          <CardContent>
            {rLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : volumeCurve.length === 0 || noData(volumeCurve) ? (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">No data for selected period</div>
            ) : (
              <>
                {/* Legend */}
                <div className="flex flex-wrap gap-4 mb-4">
                  {Object.entries(VOL_COLORS).map(([k, c]) => (
                    <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c + "50", border: `2px solid ${c}` }} />
                      {k}
                    </div>
                  ))}
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={volumeCurve} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        {Object.entries(VOL_COLORS).map(([k, c]) => (
                          <linearGradient key={k} id={`grad-vol-${k}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={c} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={c} stopOpacity={0.02} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={45} />
                      <Tooltip content={<ChartTooltip />} />
                      {Object.entries(VOL_COLORS).map(([k, c]) => (
                        <Area key={k} type="monotone" dataKey={k} name={k} stroke={c} strokeWidth={2.5}
                          fill={`url(#grad-vol-${k})`} dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Revenue & Expense Curves ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-0">
            <SectionHeader
              icon={TrendingUp}
              title="Revenue & Net P&L"
              right={
                <div className="flex items-center gap-3">
                  <div className="flex gap-4 text-xs">
                    <span className="text-muted-foreground">Total Rev: <strong className="text-foreground">{usd(revTotal)}</strong></span>
                  </div>
                  <PeriodToggle value={days} onChange={setDays} />
                </div>
              }
            />
          </CardHeader>
          <CardContent>
            {rLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : revenueCurve.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">No revenue data</div>
            ) : (
              <>
                {/* Summary chips */}
                <div className="flex flex-wrap gap-3 mb-4">
                  {revBars.map(r => (
                    <div key={r.name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border text-xs">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="text-muted-foreground">{r.name}:</span>
                      <span className="font-bold text-foreground">{usd(r.value)}</span>
                    </div>
                  ))}
                </div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={revenueCurve} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        {Object.entries(REV_COLORS).map(([k, c]) => (
                          <linearGradient key={k} id={`grad-rev-${k}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={c} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={c} stopOpacity={0.02} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={45} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="Fee" name="Fee" stroke={REV_COLORS.Fee} strokeWidth={2} fill={`url(#grad-rev-Fee)`} dot={false} />
                      <Area type="monotone" dataKey="Spread" name="Spread" stroke={REV_COLORS.Spread} strokeWidth={2} fill={`url(#grad-rev-Spread)`} dot={false} />
                      <Line type="monotone" dataKey="Net" name="Net P&L" stroke={REV_COLORS.Net} strokeWidth={2.5} dot={false} strokeDasharray="4 2" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Mid row: Currency Volume + Type donut ────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Currency inflow vs outflow bar chart */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-0">
              <SectionHeader
                icon={DollarSign}
                title="Volume by Currency"
                right={<span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">USD equivalent</span>}
              />
            </CardHeader>
            <CardContent>
              {rLoading ? <Skeleton className="h-48 w-full" /> : currencyBars.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data</div>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={currencyBars} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: "hsl(var(--foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} width={44} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="Inflow"  name="Inflow USD"  fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Outflow" name="Outflow USD" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm bg-emerald-500" />Inflow (USD eq.)</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm bg-red-500" />Outflow (USD eq.)</div>
              </div>
            </CardContent>
          </Card>

          {/* Record type donut */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-0">
              <SectionHeader icon={FileText} title="Volume by Type"
                right={<span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">USD equivalent</span>}
              />
            </CardHeader>
            <CardContent>
              {rLoading || typeDonut.length === 0 ? (
                <div className="h-52 flex flex-col items-center justify-center gap-3">
                  {rLoading ? <Skeleton className="h-40 w-40 rounded-full" /> : (
                    <p className="text-sm text-muted-foreground">No data</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <defs>
                          {typeDonut.map((_, i) => (
                            <radialGradient key={i} id={`rad-${i}`} cx="50%" cy="50%" r="50%">
                              <stop offset="0%" stopColor={DONUT_COLORS[i]} stopOpacity={1} />
                              <stop offset="100%" stopColor={DONUT_COLORS[i]} stopOpacity={0.7} />
                            </radialGradient>
                          ))}
                        </defs>
                        <Pie data={typeDonut} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          innerRadius={50} outerRadius={76} paddingAngle={4} strokeWidth={0}>
                          {typeDonut.map((_, i) => (
                            <Cell key={i} fill={`url(#rad-${i})`} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, ""]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-2 w-full mt-1">
                    {typeDonut.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DONUT_COLORS[i] }} />
                          <span className="text-muted-foreground">{d.name}</span>
                        </span>
                        <span className="font-bold tabular-nums">{usd(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Record Type Breakdown Row ────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Cash Inflow",    val: stats?.cashInflowCount,    icon: ArrowUpRight,   g: "from-emerald-500 to-green-600",  tag: "Cash received" },
            { label: "Cash Outflow",   val: stats?.cashOutflowCount,   icon: ArrowDownRight, g: "from-orange-500 to-red-500",     tag: "Cash sent" },
            { label: "Crypto Inflow",  val: stats?.cryptoInflowCount,  icon: TrendingUp,     g: "from-indigo-500 to-violet-600",  tag: "Crypto received" },
            { label: "Crypto Outflow", val: stats?.cryptoOutflowCount, icon: TrendingDown,   g: "from-amber-500 to-yellow-500",   tag: "Crypto sent" },
          ].map(({ label, val, icon: Icon, g, tag }) => (
            <Card key={label} className="hover-elevate overflow-hidden">
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${g} flex items-center justify-center mb-3 shadow-sm`}>
                  <Icon className="w-4.5 h-4.5 text-white" />
                </div>
                <p className="text-xl font-bold text-foreground">{isLoading ? "…" : num(val)}</p>
                <p className="text-xs font-medium text-foreground/70 mt-0.5">{label}</p>
                <Badge variant="secondary" className="text-[10px] mt-2 px-1.5">{tag}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Liquidity Monitor ────────────────────────────────────────────── */}
        <Card className={`border ${liquidityCfg.border} ${liquidityCfg.bg}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${liquidityCfg.text}`}>
              <Droplets className="w-4 h-4" />
              Liquidity Monitor
              <Badge className={`ml-auto text-xs ${liquidityCfg.bg} ${liquidityCfg.text} border ${liquidityCfg.border}`}>
                <LiqIcon className="w-3 h-3 mr-1" />{liquidityCfg.label}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-center shrink-0">
                <p className={`text-4xl font-black tabular-nums ${liquidityCfg.text}`}>
                  {liquidity ? `${ratio.toFixed(2)}×` : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Coverage Ratio</p>
              </div>
              <div className="flex-1 space-y-3">
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${liquidityCfg.bar}`}
                    style={{ width: `${Math.min(100, Math.round(ratio * 50))}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Wallet Balance</p><p className="font-bold">{liquidity ? usd(liquidity.estimatedBalanceUsd) : "—"}</p></div>
                  <div><p className="text-muted-foreground">Pending Outflows</p><p className="font-bold">{liquidity ? usd(liquidity.pendingOutflowUsd) : "—"}</p></div>
                  <div><p className="text-muted-foreground">Threshold</p><p className="font-bold text-amber-600 dark:text-amber-400">1.5× warn · 1.0× crit</p></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Recent Activity ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <SectionHeader icon={Activity} title="Recent Activity"
              right={<Badge variant="secondary" className="text-xs">{stats?.recentActivity?.length ?? 0} events</Badge>} />
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : !stats?.recentActivity?.length ? (
              <div className="text-center py-10">
                <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No recent activity</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {stats.recentActivity.map((event) => (
                  <div key={event.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover-elevate" data-testid={`activity-${event.id}`}>
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground capitalize">
                        {event.entityType.replace(/_/g, " ")} {event.action}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {event.actorName ?? "System"} · {format(new Date(event.createdAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-xs shrink-0 ${actionColors[event.action] ?? ""}`}>
                      {event.action}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
