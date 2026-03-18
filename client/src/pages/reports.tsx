import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, BarChart2, Users, Repeat, ArrowUpRight,
  ShieldAlert, AlertCircle, CheckCircle2, Clock, ArrowLeftRight, FileBarChart
} from "lucide-react";
import { format } from "date-fns";

interface ReportsData {
  volumeByDay: Array<{ date: string; depositUsd: number; withdrawUsd: number; transferUsd: number; totalUsd: number }>;
  revenueByDay: Array<{ date: string; fee: number; spread: number; net: number }>;
  totalFeeRevenue: number;
  totalSpread: number;
  totalVolume: number;
  txCountByType: { [type: string]: number };
  topCustomers: Array<{ customerId: string; fullName: string; totalTransactions: number; totalVolumeUsd: string }>;
  volumeByCurrency: Array<{ currency: string; inflow: number; outflow: number; netUsd: number; count: number }>;
  recordsStatusSummary: Array<{ stage: string; type: string; count: number; totalAmount: number; currency: string }>;
  spreadAnalysis: Array<{ currency: string; buyRate: number | null; sellRate: number | null; midRate: number; spreadPct: number | null; date: string }>;
  totalRecords: number;
  pendingRecords: number;
  unmatchedRecords: number;
  highRiskCustomers: number;
}

function fmtUsd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 8, border: "1px solid hsl(var(--border))",
    background: "hsl(var(--card))", color: "hsl(var(--foreground))", fontSize: 12
  },
};

const STAGE_LABELS: { [k: string]: { label: string; color: string; icon: any } } = {
  recorded:       { label: "Recorded",     color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",              icon: Clock },
  manual_matched: { label: "Manual Match", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",           icon: CheckCircle2 },
  auto_matched:   { label: "Auto Match",   color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",   icon: CheckCircle2 },
  confirmed:      { label: "Confirmed",    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2 },
  used:           { label: "Used in TX",   color: "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400",          icon: CheckCircle2 },
};

const CURRENCY_COLORS = ["#10b981","#6366f1","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];

export default function Reports() {
  const [days, setDays] = useState("30");

  const { data, isLoading } = useQuery<ReportsData>({
    queryKey: ["/api/reports", days],
    queryFn: async () => {
      const res = await fetch(`/api/reports?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch reports");
      return res.json();
    },
  });

  const totalNet = (data?.totalFeeRevenue ?? 0) + (data?.totalSpread ?? 0);

  return (
    <div className="flex flex-col h-full overflow-auto p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financial Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            P&amp;L · Volume · Spread Analysis · AML Summary — aligned with IFRS &amp; AML standards
          </p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-36" data-testid="select-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Volume",    value: data ? fmtUsd(data.totalVolume)     : null, icon: DollarSign,  color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-900/20" },
          { label: "Fee Revenue",     value: data ? fmtUsd(data.totalFeeRevenue) : null, icon: TrendingUp,  color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
          { label: "Spread Income",   value: data ? fmtUsd(data.totalSpread)     : null, icon: BarChart2,   color: "text-indigo-600",  bg: "bg-indigo-50 dark:bg-indigo-900/20" },
          { label: "Net Income",      value: data ? fmtUsd(totalNet)             : null, icon: ArrowUpRight, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20" },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <Card key={i} className="hover-elevate" data-testid={`report-kpi-${i}`}>
              <CardContent className="p-4">
                <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center mb-2`}>
                  <Icon className={`w-4 h-4 ${card.color}`} />
                </div>
                {isLoading ? <Skeleton className="h-6 w-20 mb-1" /> : (
                  <p className="text-xl font-bold text-foreground">{card.value ?? "—"}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── AML / Compliance Summary ── */}
      <Card className="border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-900/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            AML &amp; Compliance Summary
            <Badge variant="outline" className="ml-auto text-xs font-normal">IFRS / AML</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-16 w-full" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Records",     value: data?.totalRecords,      icon: FileBarChart, color: "text-foreground",     bg: "bg-muted" },
                { label: "Pending Confirmation", value: data?.pendingRecords, icon: Clock,        color: "text-amber-600",      bg: "bg-amber-100 dark:bg-amber-900/30" },
                { label: "Unmatched Records", value: data?.unmatchedRecords,  icon: AlertCircle,  color: "text-red-600",        bg: "bg-red-100 dark:bg-red-900/30" },
                { label: "High-Risk Customers", value: data?.highRiskCustomers, icon: ShieldAlert, color: "text-orange-600",   bg: "bg-orange-100 dark:bg-orange-900/30" },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex items-center gap-3" data-testid={`aml-stat-${i}`}>
                    <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${item.color}`} />
                    </div>
                    <div>
                      <p className={`text-xl font-bold ${item.color}`}>{item.value ?? 0}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Volume Chart ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Repeat className="w-4 h-4 text-muted-foreground" />
            Transaction Volume by Day (USD)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : !data?.volumeByDay.length ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.volumeByDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradDeposit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradWithdraw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => format(new Date(d + "T00:00:00"), "MMM d")} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtUsd(v)} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number, name) => [fmtUsd(v), name]} labelFormatter={d => format(new Date(d + "T00:00:00"), "MMM d, yyyy")} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="depositUsd"  name="Deposits"    stroke="#10b981" fill="url(#gradDeposit)"  strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="withdrawUsd" name="Withdrawals" stroke="#ef4444" fill="url(#gradWithdraw)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="transferUsd" name="Transfers"   stroke="#6366f1" fill="none" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Revenue Chart ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            Revenue by Day — Fee Income vs Spread (USD)
            <Badge variant="outline" className="ml-auto text-xs font-normal">IFRS 4100/4102</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : !data?.revenueByDay.length ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.revenueByDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => format(new Date(d + "T00:00:00"), "MMM d")} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(0)}`} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number, name) => [`$${v.toFixed(2)}`, name]} labelFormatter={d => format(new Date(d + "T00:00:00"), "MMM d, yyyy")} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="fee"    name="Service Fee (4101)" fill="#10b981" radius={[3, 3, 0, 0]} stackId="rev" />
                  <Bar dataKey="spread" name="Spread Income (4102)" fill="#6366f1" radius={[3, 3, 0, 0]} stackId="rev" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Volume by Currency + Spread Analysis ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Volume by Currency */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              Volume by Currency <span className="font-normal text-muted-foreground">(IAS 21)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-32 w-full" /> : !data?.volumeByCurrency.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No records in this period</p>
            ) : (
              <div className="space-y-2.5">
                {data.volumeByCurrency.map((c, i) => {
                  const total = c.inflow + c.outflow;
                  const inPct = total > 0 ? Math.round((c.inflow / total) * 100) : 0;
                  return (
                    <div key={c.currency} data-testid={`volume-currency-${c.currency}`}>
                      <div className="flex justify-between items-center text-sm mb-1">
                        <span className="font-mono font-semibold">{c.currency}</span>
                        <span className="text-xs text-muted-foreground">{c.count} records</span>
                      </div>
                      <div className="h-5 rounded-full bg-muted overflow-hidden flex">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${inPct}%` }}
                          title={`Inflow: ${fmtUsd(c.inflow)}`} />
                        <div className="h-full bg-red-400 flex-1 transition-all"
                          title={`Outflow: ${fmtUsd(c.outflow)}`} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                        <span className="text-emerald-600 dark:text-emerald-400">↑ {fmtUsd(c.inflow)}</span>
                        <span className="text-red-500 dark:text-red-400">↓ {fmtUsd(c.outflow)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Spread Analysis */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
              Buy/Sell Spread Analysis
              <Badge variant="outline" className="ml-auto text-xs font-normal">Revenue from Spread</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-32 w-full" /> : !data?.spreadAnalysis.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No exchange rates configured</p>
            ) : (
              <div className="space-y-2">
                {data.spreadAnalysis.map(s => (
                  <div key={s.currency} className="rounded-lg border border-border p-2.5" data-testid={`spread-${s.currency}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono font-bold text-sm">{s.currency}</span>
                      {s.spreadPct !== null
                        ? <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs">{s.spreadPct.toFixed(2)}% spread</Badge>
                        : <Badge variant="outline" className="text-xs text-muted-foreground">No buy/sell set</Badge>
                      }
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Buy Rate</p>
                        <p className={s.buyRate ? "font-mono text-green-700 dark:text-green-400 font-semibold" : "text-muted-foreground"}>
                          {s.buyRate ? s.buyRate.toFixed(6) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Mid Rate</p>
                        <p className="font-mono font-semibold">{s.midRate.toFixed(6)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Sell Rate</p>
                        <p className={s.sellRate ? "font-mono text-blue-700 dark:text-blue-400 font-semibold" : "text-muted-foreground"}>
                          {s.sellRate ? s.sellRate.toFixed(6) : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Records Status + Tx Count + Top Customers ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Records Status Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Records Processing Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? <Skeleton className="h-24 w-full" /> : !data?.recordsStatusSummary.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No records in this period</p>
            ) : (
              <>
                {Object.entries(
                  data.recordsStatusSummary.reduce((acc, r) => {
                    acc[r.stage] = (acc[r.stage] ?? 0) + r.count;
                    return acc;
                  }, {} as { [k: string]: number })
                ).map(([stage, count]) => {
                  const cfg = STAGE_LABELS[stage];
                  const Icon = cfg?.icon ?? Clock;
                  const total = data.recordsStatusSummary.reduce((s, r) => s + r.count, 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={stage} className="space-y-1" data-testid={`stage-${stage}`}>
                      <div className="flex justify-between items-center text-sm">
                        <Badge className={`text-xs ${cfg?.color ?? "bg-muted"}`}>{cfg?.label ?? stage}</Badge>
                        <span className="font-semibold">{count} <span className="text-xs text-muted-foreground">({pct}%)</span></span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </CardContent>
        </Card>

        {/* Transaction Count by Type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Transaction Count by Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <Skeleton className="h-24 w-full" /> : (
              <>
                {[
                  { label: "Deposits",    key: "deposit",  color: "bg-emerald-500" },
                  { label: "Withdrawals", key: "withdraw", color: "bg-red-500"     },
                  { label: "Transfers",   key: "transfer", color: "bg-indigo-500"  },
                ].map(item => {
                  const count = (data?.txCountByType as any)?.[item.key] ?? 0;
                  const total = Object.values(data?.txCountByType ?? {}).reduce((s: number, v: any) => s + v, 0) as number;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={item.key} className="space-y-1" data-testid={`tx-type-${item.key}`}>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-semibold">{count} <span className="text-xs text-muted-foreground">({pct}%)</span></span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {(!data || Object.values(data.txCountByType).every(v => v === 0)) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No transactions in this period</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Top Customers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              Top Customers by Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-24 w-full" /> : !data?.topCustomers.length ? (
              <div className="text-sm text-muted-foreground text-center py-6">No customer data yet</div>
            ) : (
              <div className="space-y-2">
                {data.topCustomers.slice(0, 6).map((c, i) => (
                  <div key={c.customerId} className="flex items-center gap-3" data-testid={`top-customer-${c.customerId}`}>
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.fullName}</p>
                      <p className="text-xs text-muted-foreground">{c.customerId} · {c.totalTransactions} tx</p>
                    </div>
                    <span className="text-sm font-semibold text-primary shrink-0">
                      {fmtUsd(parseFloat(c.totalVolumeUsd || "0"))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Currency Volume Pie ── */}
      {data?.volumeByCurrency && data.volumeByCurrency.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-muted-foreground" />
              Volume Distribution by Currency
              <Badge variant="outline" className="ml-auto text-xs font-normal">IAS 21 — FX Exposure</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <div className="w-full lg:w-56 h-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.volumeByCurrency}
                      dataKey="inflow"
                      nameKey="currency"
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={90}
                      paddingAngle={2}
                    >
                      {data.volumeByCurrency.map((_, i) => (
                        <Cell key={i} fill={CURRENCY_COLORS[i % CURRENCY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number) => [fmtUsd(v), "Inflow"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {data.volumeByCurrency.map((c, i) => (
                  <div key={c.currency} className="flex items-center gap-2" data-testid={`pie-currency-${c.currency}`}>
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: CURRENCY_COLORS[i % CURRENCY_COLORS.length] }} />
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-sm">{c.currency}</p>
                      <p className="text-xs text-muted-foreground">{c.count} records</p>
                      <p className="text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400">↑ {fmtUsd(c.inflow)}</span>
                        {" · "}
                        <span className="text-red-500">↓ {fmtUsd(c.outflow)}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
