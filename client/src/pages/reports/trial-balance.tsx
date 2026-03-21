import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Scale, Printer, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface TBAccount {
  id: string; code: string; name: string; type: string; subtype: string;
  currency: string; totalDebit: number; totalCredit: number; balance: number;
}
interface TrialBalanceData {
  period: { id: string; name: string; status: string } | null;
  accounts: TBAccount[];
  totalDebit: number; totalCredit: number; balanced: boolean;
  generatedAt: string;
}

const TYPE_ORDER = ["asset","liability","equity","revenue","expense"];
const TYPE_LABELS: { [k: string]: { label: string; color: string } } = {
  asset:     { label: "Assets",      color: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20" },
  liability: { label: "Liabilities", color: "text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20" },
  equity:    { label: "Equity",      color: "text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20" },
  revenue:   { label: "Revenue",     color: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20" },
  expense:   { label: "Expenses",    color: "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20" },
};
const DEBIT_NORMAL = new Set(["asset","expense"]);

function fmt(n: number) {
  if (n === 0) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TrialBalance() {
  const { data, isLoading } = useQuery<TrialBalanceData>({ queryKey: ["/api/reports/trial-balance"] });

  const grouped = data?.accounts.reduce((acc, row) => {
    if (!acc[row.type]) acc[row.type] = [];
    acc[row.type].push(row);
    return acc;
  }, {} as { [type: string]: TBAccount[] }) ?? {};

  const subtotals: { [type: string]: { dr: number; cr: number } } = {};
  for (const [type, rows] of Object.entries(grouped)) {
    subtotals[type] = { dr: rows.reduce((s,r) => s+r.totalDebit,0), cr: rows.reduce((s,r) => s+r.totalCredit,0) };
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Trial Balance</h1>
            {data && (
              <Badge className={data.balanced ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                {data.balanced ? <><CheckCircle2 className="w-3 h-3 mr-1" />Balanced</> : <><XCircle className="w-3 h-3 mr-1" />Unbalanced</>}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            All accounts — Debit and Credit totals from posted journal entries
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {data?.period && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {data.period.name}
            </Badge>
          )}
          {data && <span>Generated {format(new Date(data.generatedAt), "MMM d, yyyy HH:mm")}</span>}
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-7 gap-1 print:hidden">
            <Printer className="w-3 h-3" /> Print
          </Button>
        </div>
      </div>

      {/* Totals bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Debits",  value: data?.totalDebit,  color: "text-blue-700 dark:text-blue-300" },
          { label: "Total Credits", value: data?.totalCredit, color: "text-orange-700 dark:text-orange-300" },
          { label: "Difference",   value: data ? Math.abs(data.totalDebit - data.totalCredit) : undefined, color: data?.balanced ? "text-emerald-600" : "text-red-500" },
        ].map((c, i) => (
          <Card key={i} data-testid={`tb-total-${i}`}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
              {isLoading ? <Skeleton className="h-6 w-24" /> : (
                <p className={`text-lg font-bold font-mono ${c.color}`}>
                  ${c.value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "0.00"}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-trial-balance">
              <thead className="bg-muted/60 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold w-16">Code</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Account Name</th>
                  <th className="text-left px-4 py-2.5 font-semibold w-16">Type</th>
                  <th className="text-right px-4 py-2.5 font-semibold w-32 text-blue-700 dark:text-blue-300">Debit (DR)</th>
                  <th className="text-right px-4 py-2.5 font-semibold w-32 text-orange-700 dark:text-orange-300">Credit (CR)</th>
                  <th className="text-right px-4 py-2.5 font-semibold w-32">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  Array(12).fill(0).map((_, i) => (
                    <tr key={i}>
                      {Array(6).fill(0).map((_, j) => (
                        <td key={j} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : (
                  TYPE_ORDER.filter(t => grouped[t]).map(type => {
                    const cfg = TYPE_LABELS[type];
                    const sub = subtotals[type];
                    return [
                      /* Type header row */
                      <tr key={`hdr-${type}`} className="border-t-2 border-border">
                        <td colSpan={6} className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider ${cfg.color}`}>
                          {cfg.label}
                        </td>
                      </tr>,
                      /* Account rows */
                      ...grouped[type].sort((a,b) => a.code.localeCompare(b.code)).map(acc => {
                        const isNormal = DEBIT_NORMAL.has(acc.type);
                        const balPos = acc.balance >= 0;
                        return (
                          <tr key={acc.id} className="hover:bg-muted/30 transition-colors" data-testid={`tb-row-${acc.code}`}>
                            <td className="px-4 py-2 font-mono text-xs font-semibold text-primary">{acc.code}</td>
                            <td className="px-4 py-2">
                              <span className={acc.subtype?.includes("group") ? "text-muted-foreground" : ""}>{acc.name}</span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.color}`}>{isNormal ? "DR" : "CR"}</span>
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-xs text-blue-700 dark:text-blue-300">{fmt(acc.totalDebit)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs text-orange-700 dark:text-orange-300">{fmt(acc.totalCredit)}</td>
                            <td className="px-4 py-2 text-right">
                              <span className={`font-mono text-xs font-semibold ${balPos ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                {fmt(Math.abs(acc.balance))} {isNormal ? "DR" : "CR"}
                              </span>
                            </td>
                          </tr>
                        );
                      }),
                      /* Subtotal row */
                      <tr key={`sub-${type}`} className={`border-t border-dashed border-border/50 ${cfg.color} bg-opacity-5`}>
                        <td className="px-4 py-1.5 font-semibold text-xs" colSpan={3}>Subtotal — {cfg.label}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{sub.dr > 0 ? `$${sub.dr.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-xs font-bold text-orange-700 dark:text-orange-300">{sub.cr > 0 ? `$${sub.cr.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"}</td>
                        <td className="px-4 py-1.5"></td>
                      </tr>,
                    ];
                  })
                )}
              </tbody>
              {/* Grand total footer */}
              {data && (
                <tfoot className="border-t-2 border-border bg-muted/60">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 font-bold text-sm">TOTALS</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-blue-700 dark:text-blue-300">
                      ${data.totalDebit.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-orange-700 dark:text-orange-300">
                      ${data.totalCredit.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {data.balanced
                        ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs flex items-center justify-end gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Balanced</span>
                        : <span className="text-red-500 font-semibold text-xs flex items-center justify-end gap-1"><XCircle className="w-3.5 h-3.5" />OFF by ${Math.abs(data.totalDebit-data.totalCredit).toFixed(2)}</span>
                      }
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {!isLoading && data && data.accounts.every(a => a.totalDebit === 0 && a.totalCredit === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <Scale className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No posted journal entries yet. Approve transactions and generate journal entries to see balances.</p>
        </div>
      )}
    </div>
  );
}
