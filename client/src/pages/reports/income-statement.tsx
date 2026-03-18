import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign, Printer, Calendar, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface ISLine { code: string; name: string; subtype: string; balance: number; }
interface IncomeStatementData {
  period: { id: string; name: string; status: string } | null;
  revenues: ISLine[]; expenses: ISLine[];
  totalRevenue: number; totalExpenses: number; netIncome: number;
  generatedAt: string;
}

const SUBTYPE_LABELS: { [k: string]: string } = {
  operating: "Operating Revenue", fee: "Fee Income", spread: "Spread Income",
  premium: "Premium Fee", fx_gain: "FX Gain", non_operating: "Other Income",
  penalty: "Penalty Income", cogs: "Cost of Exchange", direct: "Direct Costs",
  discount: "Discounts Given", fx_loss: "FX Losses", operating_exp: "Operating Costs",
  payroll: "Payroll", overhead: "Overhead", compliance: "Compliance & Legal",
  bank: "Bank Charges", commission: "Agent Commissions",
};

function fmt2(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function LineGroup({ title, items, total, colorAccent, borderColor, testId }: {
  title: string; items: ISLine[]; total: number; colorAccent: string; borderColor: string; testId: string;
}) {
  const active = items.filter(i => i.balance > 0);
  return (
    <div data-testid={testId}>
      <div className={`flex items-center justify-between px-4 py-2 rounded-t-md font-bold text-sm uppercase tracking-wider ${colorAccent}`}>
        <span>{title}</span>
        <span className="font-mono">${fmt2(total)}</span>
      </div>
      <div className={`border ${borderColor} border-t-0 rounded-b-md divide-y divide-border/50 overflow-hidden`}>
        {active.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground text-center">No entries posted yet</div>
        ) : (
          active.map((item, i) => (
            <div key={i} className="flex justify-between items-center px-4 py-2 hover:bg-muted/30 text-sm" data-testid={`is-line-${item.code}`}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground w-10">{item.code}</span>
                <div>
                  <p>{item.name}</p>
                  {item.subtype && SUBTYPE_LABELS[item.subtype] && (
                    <p className="text-xs text-muted-foreground">{SUBTYPE_LABELS[item.subtype]}</p>
                  )}
                </div>
              </div>
              <span className="font-mono font-semibold">${fmt2(item.balance)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function IncomeStatement() {
  const { data, isLoading } = useQuery<IncomeStatementData>({ queryKey: ["/api/reports/income-statement"] });

  const netPositive = (data?.netIncome ?? 0) >= 0;

  return (
    <div className="flex flex-col h-full overflow-auto p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Income Statement</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Profit &amp; Loss — Revenue vs Expenses for the current accounting period
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {data?.period && <Badge variant="outline" className="flex items-center gap-1"><Calendar className="w-3 h-3" />{data.period.name}</Badge>}
          {data && <span>{format(new Date(data.generatedAt), "MMM d, yyyy")}</span>}
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-7 gap-1 print:hidden">
            <Printer className="w-3 h-3" /> Print
          </Button>
        </div>
      </div>

      {/* KPI summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Revenue",  value: data?.totalRevenue,  icon: TrendingUp,   color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
          { label: "Total Expenses", value: data?.totalExpenses, icon: TrendingDown,  color: "text-red-600",     bg: "bg-red-50 dark:bg-red-900/20" },
          { label: "Net Income",     value: data?.netIncome,     icon: netPositive ? DollarSign : Minus, color: netPositive ? "text-blue-600" : "text-red-600", bg: netPositive ? "bg-blue-50 dark:bg-blue-900/20" : "bg-red-50 dark:bg-red-900/20" },
        ].map((c, i) => {
          const Icon = c.icon;
          return (
            <Card key={i} data-testid={`is-kpi-${i}`}>
              <CardContent className="p-4">
                <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center mb-2`}>
                  <Icon className={`w-4 h-4 ${c.color}`} />
                </div>
                {isLoading ? <Skeleton className="h-6 w-20 mb-1" /> : (
                  <p className={`text-xl font-bold font-mono ${c.color}`}>${fmt2(c.value ?? 0)}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[0,1].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>)}
        </div>
      ) : data ? (
        <div className="space-y-4 max-w-2xl">
          <LineGroup
            title="Revenue"
            items={data.revenues}
            total={data.totalRevenue}
            colorAccent="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200"
            borderColor="border-emerald-200 dark:border-emerald-800/50"
            testId="section-revenue"
          />

          <LineGroup
            title="Expenses"
            items={data.expenses}
            total={data.totalExpenses}
            colorAccent="bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
            borderColor="border-red-200 dark:border-red-800/50"
            testId="section-expenses"
          />

          {/* Net Income result */}
          <div className={`rounded-lg border-2 p-4 flex items-center justify-between ${netPositive ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20" : "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20"}`} data-testid="net-income-row">
            <div>
              <p className="font-bold text-base">Net Income / (Loss)</p>
              <p className="text-xs text-muted-foreground">Total Revenue − Total Expenses</p>
            </div>
            <div className="text-right">
              <p className={`font-mono text-2xl font-bold ${netPositive ? "text-blue-700 dark:text-blue-300" : "text-red-600"}`}>
                {netPositive ? "" : "("}${fmt2(Math.abs(data.netIncome))}{netPositive ? "" : ")"}
              </p>
              <Badge className={netPositive ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"}>
                {netPositive ? "Profitable" : "Net Loss"}
              </Badge>
            </div>
          </div>

          {/* Profitability breakdown */}
          {data.totalRevenue > 0 && (
            <div className="rounded-lg border border-border p-4 text-sm space-y-2">
              <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Profitability Ratios</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Net Margin</p>
                  <p className="font-mono font-bold text-lg text-foreground">
                    {((data.netIncome / data.totalRevenue) * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expense Ratio</p>
                  <p className="font-mono font-bold text-lg text-foreground">
                    {data.totalRevenue > 0 ? ((data.totalExpenses / data.totalRevenue) * 100).toFixed(1) : "0.0"}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
