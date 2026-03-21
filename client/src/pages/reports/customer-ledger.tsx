import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, Search, ChevronDown, ChevronRight, Printer, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface CustomerAccount {
  accountCode: string; accountName: string; accountType: string;
  totalDebit: number; totalCredit: number; balance: number;
}
interface LedgerCustomer {
  customerId: string; customerName: string;
  customerStatus?: string; riskLevel?: string; phone?: string;
  accounts: CustomerAccount[];
  totalDebit: number; totalCredit: number; balance: number;
}
interface CustomerLedgerData {
  customers: LedgerCustomer[];
  generatedAt: string;
}

interface StatementLine {
  date: string; entryNumber: string; description: string;
  accountCode: string; accountName: string;
  debit: number; credit: number; runningBalance: number | null;
  sourceType: string; sourceId: string;
}
interface CustomerStatement {
  customer: { id: string; full_name: string; phone_primary: string; customer_status: string; risk_level: string; };
  lines: StatementLine[];
  generatedAt: string;
}

const RISK_BADGE: { [k: string]: string } = {
  low:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  high:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};
const STATUS_BADGE: { [k: string]: string } = {
  active:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  inactive:  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  blocked:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  pending:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};

function fmt2(n: number) {
  if (n === 0) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CustomerStatement({ customerId }: { customerId: string }) {
  const { data, isLoading } = useQuery<CustomerStatement>({
    queryKey: ["/api/reports/customer-statement", customerId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/customer-statement/${customerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  if (isLoading) return <div className="p-4 space-y-2">{Array(4).fill(0).map((_,i)=><Skeleton key={i} className="h-6 w-full"/>)}</div>;
  if (!data || data.lines.length === 0) return <p className="p-4 text-sm text-muted-foreground text-center">No posted journal entries for this customer yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" data-testid="statement-table">
        <thead className="bg-muted/60 border-b border-border">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Date</th>
            <th className="text-left px-3 py-2 font-semibold">Entry #</th>
            <th className="text-left px-3 py-2 font-semibold">Account</th>
            <th className="text-left px-3 py-2 font-semibold">Description</th>
            <th className="text-right px-3 py-2 font-semibold text-blue-700 dark:text-blue-300">Debit</th>
            <th className="text-right px-3 py-2 font-semibold text-orange-700 dark:text-orange-300">Credit</th>
            <th className="text-right px-3 py-2 font-semibold text-emerald-700 dark:text-emerald-300">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {data.lines.map((l, i) => (
            <tr key={i} className="hover:bg-muted/30 transition-colors">
              <td className="px-3 py-1.5 font-mono text-muted-foreground">
                {l.date ? format(new Date(l.date), "MMM d, yy") : "—"}
              </td>
              <td className="px-3 py-1.5 font-mono text-primary text-xs">{l.entryNumber}</td>
              <td className="px-3 py-1.5">
                <span className="font-mono text-muted-foreground mr-1">{l.accountCode}</span>
                <span>{l.accountName}</span>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground max-w-xs truncate">{l.description}</td>
              <td className="px-3 py-1.5 text-right font-mono text-blue-700 dark:text-blue-300">{l.debit > 0 ? fmt2(l.debit) : ""}</td>
              <td className="px-3 py-1.5 text-right font-mono text-orange-700 dark:text-orange-300">{l.credit > 0 ? fmt2(l.credit) : ""}</td>
              <td className="px-3 py-1.5 text-right">
                {l.runningBalance !== null ? (
                  <span className={`font-mono font-semibold ${l.runningBalance >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-500"}`}>
                    {fmt2(Math.abs(l.runningBalance))}
                  </span>
                ) : <span className="text-muted-foreground/30 text-xs">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CustomerLedger() {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<{ [id: string]: boolean }>({});
  const [showStatement, setShowStatement] = useState<{ [id: string]: boolean }>({});

  const { data, isLoading } = useQuery<CustomerLedgerData>({ queryKey: ["/api/reports/customer-ledger"] });

  const filtered = (data?.customers ?? []).filter(c =>
    c.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    c.customerId?.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));
  const toggleStmt = (id: string) => setShowStatement(p => ({ ...p, [id]: !p[id] }));

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Customer Ledger</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Per-customer account balances and individual statements
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && <span className="text-xs text-muted-foreground">{data.customers.length} customer{data.customers.length !== 1 ? "s" : ""} with activity</span>}
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-7 gap-1 print:hidden">
            <Printer className="w-3 h-3" /> Print
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Active Customers",   value: data?.customers.filter(c => c.customerStatus === "active").length ?? 0,  color: "text-emerald-600" },
          { label: "With CR Balance",    value: data?.customers.filter(c => c.balance > 0).length ?? 0,                  color: "text-blue-600" },
          { label: "High-Risk Clients",  value: data?.customers.filter(c => c.riskLevel === "high").length ?? 0,          color: "text-red-600" },
        ].map((c, i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground mb-0.5">{c.label}</p>
              {isLoading ? <Skeleton className="h-6 w-12" /> : <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          placeholder="Search customers..."
          className="pl-8 h-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="input-customer-search"
        />
      </div>

      {/* Customer rows */}
      <div className="space-y-2">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>)
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>{search ? "No customers match your search" : "No customer activity yet. Approve transactions to generate journal entries."}</p>
          </div>
        ) : (
          filtered.map(c => (
            <Card key={c.customerId} className="overflow-hidden" data-testid={`customer-row-${c.customerId}`}>
              {/* Customer header row */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => toggle(c.customerId)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${c.riskLevel === "high" ? "bg-red-500" : c.riskLevel === "medium" ? "bg-yellow-500" : "bg-emerald-500"}`}>
                    {c.customerName?.charAt(0) ?? "?"}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{c.customerName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{c.customerId?.substring(0,8)}</p>
                  </div>
                  <div className="hidden sm:flex gap-1.5 items-center">
                    {c.customerStatus && <Badge className={`text-[10px] h-4 px-1.5 ${STATUS_BADGE[c.customerStatus] ?? ""}`}>{c.customerStatus}</Badge>}
                    {c.riskLevel && c.riskLevel !== "low" && (
                      <Badge className={`text-[10px] h-4 px-1.5 flex items-center gap-0.5 ${RISK_BADGE[c.riskLevel] ?? ""}`}>
                        {c.riskLevel === "high" && <AlertTriangle className="w-2.5 h-2.5" />}
                        {c.riskLevel}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] text-muted-foreground">Total DR</p>
                    <p className="font-mono text-xs text-blue-700 dark:text-blue-300">{fmt2(c.totalDebit)}</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] text-muted-foreground">Total CR</p>
                    <p className="font-mono text-xs text-orange-700 dark:text-orange-300">{fmt2(c.totalCredit)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Balance (2101)</p>
                    <p className={`font-mono text-sm font-bold ${c.balance > 0 ? "text-emerald-600" : c.balance < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {c.balance === 0 ? "—" : `$${c.balance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`}
                    </p>
                  </div>
                  {expanded[c.customerId] ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </div>
              </div>

              {/* Expanded: Account breakdown */}
              {expanded[c.customerId] && (
                <div className="border-t border-border">
                  {/* Account balances table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 border-b border-border/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold">Account</th>
                          <th className="text-right px-4 py-2 font-semibold text-blue-700 dark:text-blue-300">Debit</th>
                          <th className="text-right px-4 py-2 font-semibold text-orange-700 dark:text-orange-300">Credit</th>
                          <th className="text-right px-4 py-2 font-semibold">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {c.accounts.map((a, i) => (
                          <tr key={i} className="hover:bg-muted/20">
                            <td className="px-4 py-1.5">
                              <span className="font-mono text-muted-foreground mr-1.5">{a.accountCode}</span>
                              {a.accountName}
                            </td>
                            <td className="px-4 py-1.5 text-right font-mono text-blue-700 dark:text-blue-300">{fmt2(a.totalDebit)}</td>
                            <td className="px-4 py-1.5 text-right font-mono text-orange-700 dark:text-orange-300">{fmt2(a.totalCredit)}</td>
                            <td className="px-4 py-1.5 text-right">
                              <span className={`font-mono font-semibold ${a.balance > 0 ? "text-emerald-600" : a.balance < 0 ? "text-red-500" : "text-muted-foreground/40"}`}>
                                {a.balance === 0 ? "—" : `$${Math.abs(a.balance).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Statement toggle button */}
                  <div className="px-4 py-2.5 border-t border-dashed border-border/60 flex justify-end">
                    <Button
                      size="sm"
                      variant={showStatement[c.customerId] ? "secondary" : "outline"}
                      className="h-7 text-xs gap-1"
                      onClick={() => toggleStmt(c.customerId)}
                      data-testid={`button-statement-${c.customerId}`}
                    >
                      {showStatement[c.customerId] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {showStatement[c.customerId] ? "Hide" : "View"} Full Statement
                    </Button>
                  </div>

                  {/* Full statement */}
                  {showStatement[c.customerId] && (
                    <div className="border-t border-border">
                      <div className="px-4 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Full Journal Entry Statement — {c.customerName}
                      </div>
                      <CustomerStatement customerId={c.customerId} />
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
