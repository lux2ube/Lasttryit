import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Building2, Printer, Calendar, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface BSLine { code: string; name: string; subtype: string; balance: number; }
interface BalanceSheetData {
  period: { id: string; name: string; status: string } | null;
  assets: BSLine[]; liabilities: BSLine[]; equity: BSLine[];
  totalAssets: number; totalLiabilities: number; totalEquity: number;
  totalLiabilitiesEquity: number; balanced: boolean; generatedAt: string;
}

function fmt2(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Section({ title, items, total, colorClass, testId }: {
  title: string; items: BSLine[]; total: number; colorClass: string; testId: string;
}) {
  return (
    <div data-testid={testId}>
      <div className={`px-4 py-2 font-bold text-sm uppercase tracking-wider rounded-t-md ${colorClass}`}>{title}</div>
      <div className="divide-y divide-border/50 border border-t-0 border-border rounded-b-md overflow-hidden">
        {items.filter(i => i.balance !== 0 || true).map((item, idx) => (
          <div key={idx} className="flex justify-between items-center px-4 py-2 hover:bg-muted/30 text-sm" data-testid={`bs-line-${item.code}`}>
            <div>
              <span className="font-mono text-xs text-muted-foreground mr-2">{item.code}</span>
              <span className={item.balance === 0 ? "text-muted-foreground" : ""}>{item.name}</span>
            </div>
            <span className={`font-mono text-sm font-semibold ${item.balance > 0 ? "text-foreground" : item.balance < 0 ? "text-red-500" : "text-muted-foreground/40"}`}>
              {item.balance === 0 ? "—" : `$${fmt2(Math.abs(item.balance))}`}
            </span>
          </div>
        ))}
        <div className={`flex justify-between items-center px-4 py-2.5 font-bold text-sm ${colorClass}`}>
          <span>Total {title}</span>
          <span className="font-mono">${fmt2(total)}</span>
        </div>
      </div>
    </div>
  );
}

export default function BalanceSheet() {
  const { data, isLoading } = useQuery<BalanceSheetData>({ queryKey: ["/api/reports/balance-sheet"] });

  return (
    <div className="flex flex-col h-full overflow-auto p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Balance Sheet</h1>
            {data && (
              <Badge className={data.balanced ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                {data.balanced ? <><CheckCircle2 className="w-3 h-3 mr-1" />Balanced</> : <><XCircle className="w-3 h-3 mr-1" />Imbalanced</>}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Statement of Financial Position — Assets = Liabilities + Equity</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {data?.period && <Badge variant="outline" className="flex items-center gap-1"><Calendar className="w-3 h-3" />{data.period.name}</Badge>}
          {data && <span>As of {format(new Date(data.generatedAt), "MMM d, yyyy")}</span>}
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-7 gap-1 print:hidden">
            <Printer className="w-3 h-3" /> Print
          </Button>
        </div>
      </div>

      {/* Equation check banner */}
      {data && (
        <div className={`rounded-lg border px-4 py-2.5 flex items-center justify-between text-sm ${data.balanced ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800" : "border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800"}`}>
          <span className="font-medium">
            Assets (${fmt2(data.totalAssets)}) = Liabilities (${fmt2(data.totalLiabilities)}) + Equity (${fmt2(data.totalEquity)})
          </span>
          {data.balanced
            ? <span className="text-emerald-600 flex items-center gap-1 text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />Equation holds</span>
            : <span className="text-red-500 flex items-center gap-1 text-xs font-semibold"><XCircle className="w-3.5 h-3.5" />Off by ${fmt2(Math.abs(data.totalAssets - data.totalLiabilitiesEquity))}</span>
          }
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0,1].map(i => <Card key={i}><CardContent className="p-4 space-y-2">{Array(6).fill(0).map((_,j) => <Skeleton key={j} className="h-8 w-full" />)}</CardContent></Card>)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: Assets */}
          <div className="space-y-4">
            <Section
              title="Assets"
              items={data.assets}
              total={data.totalAssets}
              colorClass="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200"
              testId="section-assets"
            />
          </div>

          {/* RIGHT: Liabilities + Equity */}
          <div className="space-y-4">
            <Section
              title="Liabilities"
              items={data.liabilities}
              total={data.totalLiabilities}
              colorClass="bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200"
              testId="section-liabilities"
            />
            <Section
              title="Equity"
              items={data.equity}
              total={data.totalEquity}
              colorClass="bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200"
              testId="section-equity"
            />
            {/* Total L+E */}
            <div className="flex justify-between items-center px-4 py-3 rounded-lg bg-muted border border-border font-bold text-sm" data-testid="total-liabilities-equity">
              <span>Total Liabilities + Equity</span>
              <span className="font-mono text-primary">${fmt2(data.totalLiabilitiesEquity)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
