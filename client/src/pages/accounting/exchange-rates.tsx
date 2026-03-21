import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ExchangeRate, Currency } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Building2, FileText, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// ─── Rate format note ─────────────────────────────────────────────────────────
// All rates are stored as "units of fromCurrency per 1 USD" for fiat (e.g. YER=536 means 1 USD=536 YER).
// For crypto pegged to USD (USDT), rate = 1. For other crypto (BNB), rate = USD price per token.
// The "inverse" column always shows the human-readable "1 USD = X fiat" or "1 token = X USD".

const formSchema = z.object({
  fromCurrency: z.string().min(1, "Currency required"),
  buyRate:      z.coerce.number().positive("Required"),
  sellRate:     z.coerce.number().positive("Required"),
});
type FormValues = z.infer<typeof formSchema>;

// ─── Staleness helper ─────────────────────────────────────────────────────────
function rateAgeLabel(effectiveDate: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (effectiveDate === today) return { label: "Today", urgent: false };
  const days = Math.floor((new Date(today).getTime() - new Date(effectiveDate).getTime()) / 86400000);
  if (days <= 1) return { label: "Yesterday", urgent: false };
  if (days <= 7) return { label: `${days}d ago`, urgent: false };
  return { label: `${days}d ago`, urgent: true };
}

// ─── Form Dialog ──────────────────────────────────────────────────────────────
function RateFormDialog({
  open, onClose, initial, currencies,
}: { open: boolean; onClose: () => void; initial?: ExchangeRate; currencies: Currency[] }) {
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fromCurrency: initial?.fromCurrency ?? "",
      buyRate:      initial?.buyRate  ? parseFloat(initial.buyRate)  : undefined,
      sellRate:     initial?.sellRate ? parseFloat(initial.sellRate) : undefined,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) => {
      const today = new Date().toISOString().slice(0, 10);
      const payload = {
        fromCurrency:  data.fromCurrency,
        toCurrency:    "USD",
        buyRate:       String(data.buyRate),
        sellRate:      String(data.sellRate),
        rate:          null,
        effectiveDate: today,
        source:        "manual",
      };
      return initial
        ? apiRequest("PUT",  `/api/accounting/exchange-rates/${initial.id}`, payload)
        : apiRequest("POST", "/api/accounting/exchange-rates", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/exchange-rates"] });
      toast({ title: initial ? "Rate updated" : "Rate saved" });
      form.reset();
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isCrypto = currencies.find(c => c.code === form.watch("fromCurrency"))?.type === "crypto";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Rate" : "Add Rate"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-3">
            <FormField control={form.control} name="fromCurrency" render={({ field }) => (
              <FormItem>
                <FormLabel>Currency *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-from-currency">
                      <SelectValue placeholder="Select currency…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {currencies.filter(c => !c.isBaseCurrency).map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField control={form.control} name="buyRate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-emerald-700 dark:text-emerald-400">Buy Rate *</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.000001"
                      placeholder={isCrypto ? "e.g. 352" : "e.g. 540"}
                      {...field} value={field.value ?? ""}
                      data-testid="input-buy-rate" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="sellRate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-blue-700 dark:text-blue-400">Sell Rate *</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.000001"
                      placeholder={isCrypto ? "e.g. 348" : "e.g. 530"}
                      {...field} value={field.value ?? ""}
                      data-testid="input-sell-rate" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="submit" size="sm" disabled={mutation.isPending} data-testid="button-save-rate">
                {mutation.isPending ? "Saving…" : "Save Rate"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ExchangeRatesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExchangeRate | undefined>();
  const [filterCurrency, setFilterCurrency] = useState("all");

  const { data: rates = [], isLoading } = useQuery<ExchangeRate[]>({
    queryKey: ["/api/accounting/exchange-rates"],
  });
  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ["/api/accounting/currencies"],
  });
  const { data: coaAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/accounting/accounts"],
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/accounting/exchange-rates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/exchange-rates"] });
      toast({ title: "Rate deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canEdit = user?.role === "admin" || user?.role === "finance_officer";
  const baseCurrency = currencies.find(c => c.isBaseCurrency);
  const nonBaseCurrencies = currencies.filter(c => !c.isBaseCurrency && c.isActive);

  // Latest rate per currency
  const latestByCode = useMemo(() => {
    const map: Record<string, ExchangeRate> = {};
    for (const r of rates) {
      if (!map[r.fromCurrency] || r.effectiveDate > map[r.fromCurrency].effectiveDate) {
        map[r.fromCurrency] = r;
      }
    }
    return map;
  }, [rates]);

  // CoA account count per currency
  const coaCountByCurrency = useMemo(() => {
    const map: Record<string, number> = {};
    for (const acct of coaAccounts) {
      if (acct.currency) map[acct.currency] = (map[acct.currency] ?? 0) + 1;
    }
    return map;
  }, [coaAccounts]);

  const filtered = filterCurrency === "all" ? rates : rates.filter(r => r.fromCurrency === filterCurrency);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-border bg-background/95 flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">Exchange Rates</h1>
          <p className="text-sm text-muted-foreground">
            System buy/sell rates — auto-filled on new cash records, editable per record. Base: <strong>{baseCurrency?.code ?? "USD"}</strong>
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => { setEditTarget(undefined); setFormOpen(true); }} data-testid="button-add-rate">
            <Plus className="w-4 h-4 mr-2" />Add Rate
          </Button>
        )}
      </div>

      {/* How rates connect to the system */}
      <div className="px-3 sm:px-6 pt-4 pb-2 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">Buy Rate — System Rate</span>
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Auto-filled as the <strong>system/execution rate</strong> when a cash inflow record is created. Staff can override it per record.
              On confirmation: client is credited at this rate. e.g. 540 YER/$ → client pays 540 YER to receive $1 credit.
            </p>
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-500">
              <FileText className="w-3 h-3" /> Auto-fills record system rate → client credit on confirmation
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center">
                <TrendingDown className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide">Sell Rate — System Rate</span>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Auto-filled as the <strong>system/execution rate</strong> when a cash outflow record is created. Staff can override it per record.
              On confirmation: client is debited at this rate. e.g. 530 YER/$ → client receives 530 YER per $1 debit.
            </p>
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-500">
              <FileText className="w-3 h-3" /> Auto-fills record system rate → client debit on confirmation
            </div>
          </CardContent>
        </Card>
        <Card className="border-muted bg-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded bg-muted-foreground flex items-center justify-center">
                <Building2 className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Bank Rate — CoA Account</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Separate from this table. Each CoA bank account (e.g. Kuraimi Bank YER) has its <strong>own buy/sell rate</strong> (e.g. 535 YER/$).
              That becomes the <strong>bankRate locked on the record</strong> at creation. The spread income = bankRate value − system rate value.
            </p>
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Building2 className="w-3 h-3" /> CoA account → bankRate on record → 4201 spread on confirmation
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Latest rates grid */}
      <div className="px-6 pt-3 pb-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Current Rates — Active Currencies</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {nonBaseCurrencies.map(c => {
            const latest  = latestByCode[c.code];
            const mid     = latest ? parseFloat(latest.rate)    : null;
            const buy     = latest?.buyRate  ? parseFloat(latest.buyRate)  : null;
            const sell    = latest?.sellRate ? parseFloat(latest.sellRate) : null;
            const dp      = c.type === "crypto" ? 2 : 0;
            const base    = mid ?? buy;
            const spread  = buy && sell && base
              ? (Math.abs(buy - sell) / base * 100).toFixed(2)
              : null;
            const age     = latest ? rateAgeLabel(latest.effectiveDate) : null;
            const coaCount = coaCountByCurrency[c.code] ?? 0;
            return (
              <div key={c.code}
                className={`border rounded-lg p-3 bg-card space-y-1.5 ${age?.urgent ? "border-amber-300 dark:border-amber-600" : "border-border"}`}
                data-testid={`rate-card-${c.code}`}>
                <div className="flex items-center justify-between">
                  <div className="font-mono font-bold text-sm">{c.code}</div>
                  <div className="flex items-center gap-1">
                    {spread && <Badge variant="outline" className="text-[10px] px-1 py-0">{spread}%</Badge>}
                    {age?.urgent && <Badge className="text-[10px] px-1 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Stale</Badge>}
                  </div>
                </div>
                {latest ? (
                  <div className="space-y-0.5">
                    {mid ? (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Mid</span>
                        <span className="font-mono tabular-nums">{mid.toLocaleString(undefined, { maximumFractionDigits: dp > 0 ? 2 : 0 })}</span>
                      </div>
                    ) : null}
                    {buy && (
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400">Buy ↑</span>
                        <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-300">{buy.toLocaleString(undefined, { maximumFractionDigits: dp > 0 ? 2 : 0 })}</span>
                      </div>
                    )}
                    {sell && (
                      <div className="flex justify-between text-xs">
                        <span className="text-blue-600 dark:text-blue-400">Sell ↓</span>
                        <span className="font-mono tabular-nums text-blue-700 dark:text-blue-300">{sell.toLocaleString(undefined, { maximumFractionDigits: dp > 0 ? 2 : 0 })}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 border-t border-border">
                      <span className={`flex items-center gap-0.5 ${age?.urgent ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        <Clock className="w-2.5 h-2.5" />{age?.label}
                      </span>
                      {coaCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Building2 className="w-2.5 h-2.5" />{coaCount} accts
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-amber-600 dark:text-amber-400 italic">No rate set</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter and history table */}
      <div className="flex items-center gap-3 px-6 py-2">
        <Select value={filterCurrency} onValueChange={setFilterCurrency}>
          <SelectTrigger className="w-44 h-9" data-testid="select-rate-filter">
            <SelectValue placeholder="All Currencies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Currencies</SelectItem>
            {nonBaseCurrencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} rate entries</span>
      </div>

      <div className="flex-1 overflow-auto px-3 sm:px-6 pb-3 sm:pb-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading rates…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No exchange rates found</div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Currency</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-amber-700 dark:text-amber-400">Mid Rate</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-emerald-700 dark:text-emerald-400">Buy Rate ↑</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-blue-700 dark:text-blue-400">Sell Rate ↓</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Spread</th>
                  <th className="text-left px-4 py-2.5 font-semibold">1 USD =</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Source</th>
                  {canEdit && <th className="w-20"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(r => {
                  const mid    = r.rate ? parseFloat(r.rate) : null;
                  const buy    = r.buyRate  ? parseFloat(r.buyRate)  : null;
                  const sell   = r.sellRate ? parseFloat(r.sellRate) : null;
                  const curr   = currencies.find(c => c.code === r.fromCurrency);
                  const isCrypto = curr?.type === "crypto";
                  const dp     = isCrypto ? 2 : 0;
                  const base   = mid ?? buy;
                  // For fiat: rate is "fiat per USD" → 1 USD = rate fiat
                  // For crypto: rate is "USD per token" → 1 USD = 1/rate tokens
                  const usdInverse = buy
                    ? (isCrypto
                        ? `${(1 / buy).toFixed(4)} ${r.fromCurrency}`
                        : `${buy.toLocaleString(undefined, { maximumFractionDigits: dp })} ${r.fromCurrency}`)
                    : "—";
                  const spread = buy && sell && base
                    ? (Math.abs(buy - sell) / base * 100).toFixed(3) + "%"
                    : "—";
                  const isLatest = latestByCode[r.fromCurrency]?.id === r.id;
                  const age = rateAgeLabel(r.effectiveDate);
                  return (
                    <tr key={r.id} className={`hover:bg-muted/30 transition-colors ${age.urgent && isLatest ? "bg-amber-50/30 dark:bg-amber-900/10" : ""}`}
                      data-testid={`row-rate-${r.id}`}>
                      <td className="px-4 py-2.5 font-mono text-sm">
                        <div className="flex items-center gap-1.5">
                          {r.effectiveDate}
                          {isLatest && <span className="text-[10px] bg-primary/10 text-primary px-1 rounded font-semibold">latest</span>}
                          {age.urgent && isLatest && <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1 rounded">stale</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold">{r.fromCurrency}</span>
                          <span className="text-muted-foreground text-xs">→ {r.toCurrency}</span>
                          {isCrypto && <Badge variant="outline" className="text-[9px] px-1 py-0">crypto</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400 font-semibold">
                        {mid ? mid.toLocaleString(undefined, { maximumFractionDigits: isCrypto ? 2 : 0 }) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {buy ? (
                          <span className="flex items-center justify-end gap-1">
                            <TrendingUp className="w-3 h-3" />{buy.toLocaleString(undefined, { maximumFractionDigits: isCrypto ? 2 : 0 })}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-700 dark:text-blue-400">
                        {sell ? (
                          <span className="flex items-center justify-end gap-1">
                            <TrendingDown className="w-3 h-3" />{sell.toLocaleString(undefined, { maximumFractionDigits: isCrypto ? 2 : 0 })}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-mono">{spread}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">{usdInverse}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.source}</span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              data-testid={`button-edit-rate-${r.id}`}
                              onClick={() => { setEditTarget(r); setFormOpen(true); }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                              data-testid={`button-delete-rate-${r.id}`}
                              onClick={() => { if (confirm("Delete this rate entry?")) deleteMut.mutate(r.id); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RateFormDialog key={editTarget?.id ?? "new"} open={formOpen} onClose={() => setFormOpen(false)} initial={editTarget} currencies={currencies} />
    </div>
  );
}
