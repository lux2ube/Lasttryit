import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Loader2, DollarSign, Link2, TrendingUp, Building2, Clock, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

interface Currency {
  code: string;
  name: string;
  symbol: string;
  type: string;
  isBaseCurrency: boolean;
  isActive: boolean;
  decimalPlaces: number;
}

interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  buyRate: string | null;
  sellRate: string | null;
  effectiveDate: string;
}

const formSchema = z.object({
  code:           z.string().min(1).max(10).toUpperCase(),
  name:           z.string().min(1, "Name required"),
  symbol:         z.string().min(1, "Symbol required").max(10),
  type:           z.enum(["fiat", "crypto"]).default("fiat"),
  isBaseCurrency: z.boolean().default(false),
  isActive:       z.boolean().default(true),
  decimalPlaces:  z.number().int().min(0).max(8).default(2),
});
type CurrencyForm = z.infer<typeof formSchema>;

function rateAge(effectiveDate: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (effectiveDate === today) return { label: "Today", stale: false };
  const days = Math.floor((new Date(today).getTime() - new Date(effectiveDate).getTime()) / 86400000);
  if (days <= 1) return { label: "Yesterday", stale: false };
  if (days <= 7) return { label: `${days}d ago`, stale: false };
  return { label: `${days}d ago`, stale: true };
}

function CurrencyDialog({ open, onClose, edit }: { open: boolean; onClose: () => void; edit?: Currency }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const form = useForm<CurrencyForm>({
    resolver: zodResolver(formSchema),
    defaultValues: edit
      ? { ...edit, decimalPlaces: edit.decimalPlaces ?? 2 }
      : { code: "", name: "", symbol: "", type: "fiat", isBaseCurrency: false, isActive: true, decimalPlaces: 2 },
  });

  const mutation = useMutation({
    mutationFn: (data: CurrencyForm) =>
      edit
        ? apiRequest("PUT", `/api/accounting/currencies/${edit.code}`, data)
        : apiRequest("POST", "/api/accounting/currencies", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounting/currencies"] });
      toast({ title: edit ? "Currency updated" : "Currency created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? "Edit Currency" : "New Currency"}</DialogTitle>
          <DialogDescription className="sr-only">Currency settings</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel>Code *</FormLabel>
                  <FormControl><Input {...field} placeholder="YER" className="font-mono uppercase" disabled={!!edit} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="symbol" render={({ field }) => (
                <FormItem>
                  <FormLabel>Symbol *</FormLabel>
                  <FormControl><Input {...field} placeholder="﷼" className="font-mono" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name *</FormLabel>
                <FormControl><Input {...field} placeholder="Yemeni Rial" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="fiat">Fiat</SelectItem>
                      <SelectItem value="crypto">Crypto</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="decimalPlaces" render={({ field }) => (
                <FormItem>
                  <FormLabel>Decimal Places</FormLabel>
                  <FormControl><Input type="number" min={0} max={8} {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl>
                </FormItem>
              )} />
            </div>
            <div className="flex gap-6">
              <FormField control={form.control} name="isBaseCurrency" render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                  <FormLabel className="mb-0">Base Currency</FormLabel>
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                  <FormLabel className="mb-0">Active</FormLabel>
                </FormItem>
              )} />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : (edit ? "Save" : "Create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Currencies() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Currency | undefined>();

  const { data: currencies = [], isLoading } = useQuery<Currency[]>({ queryKey: ["/api/accounting/currencies"] });
  const { data: rates = [] }       = useQuery<ExchangeRate[]>({ queryKey: ["/api/accounting/exchange-rates"] });
  const { data: coaAccounts = [] } = useQuery<any[]>({ queryKey: ["/api/accounting/accounts"] });

  const deleteMutation = useMutation({
    mutationFn: (code: string) => apiRequest("DELETE", `/api/accounting/currencies/${code}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/accounting/currencies"] }); toast({ title: "Currency deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Latest rate per currency pair
  const latestRateMap = rates.reduce<Record<string, ExchangeRate>>((m, r) => {
    const key = `${r.fromCurrency}→${r.toCurrency}`;
    if (!m[key] || r.effectiveDate > m[key].effectiveDate) m[key] = r;
    return m;
  }, {});

  // CoA account count per currency
  const coaCountByCurrency = coaAccounts.reduce<Record<string, number>>((m, a) => {
    if (a.currency) m[a.currency] = (m[a.currency] ?? 0) + 1;
    return m;
  }, {});

  const fiat   = currencies.filter(c => c.type === "fiat");
  const crypto = currencies.filter(c => c.type === "crypto");
  const missingRateCount = currencies.filter(c => !c.isBaseCurrency && c.isActive && !latestRateMap[`${c.code}→USD`]).length;

  function openEdit(c: Currency) { setEditItem(c); setDialogOpen(true); }
  function handleClose() { setDialogOpen(false); setEditItem(undefined); }

  function renderGroup(title: string, list: Currency[], icon: React.ReactNode) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          {icon}
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">{title}</h2>
          <span className="text-xs text-muted-foreground">({list.length})</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {list.map(c => {
            const rateKey  = `${c.code}→USD`;
            const rate     = latestRateMap[rateKey];
            const mid      = rate ? parseFloat(rate.rate) : null;
            const buy      = rate?.buyRate  ? parseFloat(rate.buyRate)  : null;
            const sell     = rate?.sellRate ? parseFloat(rate.sellRate) : null;
            const isCrypto = c.type === "crypto";
            const dp       = isCrypto ? 2 : 0;
            const age      = rate ? rateAge(rate.effectiveDate) : null;
            const coaCount = coaCountByCurrency[c.code] ?? 0;
            const spread   = buy && sell && mid
              ? (Math.abs(buy - sell) / mid * 100).toFixed(2)
              : null;

            return (
              <Card key={c.code}
                className={`hover-elevate ${!c.isActive ? "opacity-50" : ""} ${age?.stale ? "border-amber-300 dark:border-amber-600" : ""}`}
                data-testid={`card-currency-${c.code}`}>
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary font-mono text-sm">
                        {c.symbol}
                      </div>
                      <div>
                        <div className="font-bold font-mono text-sm">{c.code}</div>
                        <div className="text-xs text-muted-foreground">{c.name}</div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {c.isBaseCurrency && <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">BASE</Badge>}
                      {c.type === "crypto" && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700">Crypto</Badge>}
                      {!c.isActive && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inactive</Badge>}
                    </div>
                  </div>

                  {/* Rate panel */}
                  {rate && !c.isBaseCurrency && (
                    <div className="rounded-lg bg-muted/40 p-2.5 text-xs space-y-1 mb-2">
                      {/* Rate format header */}
                      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
                        {isCrypto ? `1 ${c.code} = ? USD` : `1 USD = ? ${c.code}`}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Mid</span>
                        <span className="font-mono font-semibold">
                          {mid?.toLocaleString(undefined, { maximumFractionDigits: isCrypto ? 2 : 0 })}
                        </span>
                      </div>
                      {buy && (
                        <div className="flex justify-between items-center">
                          <span className="text-emerald-600 dark:text-emerald-400">Buy ↑</span>
                          <span className="font-mono text-emerald-700 dark:text-emerald-300">
                            {buy.toLocaleString(undefined, { maximumFractionDigits: isCrypto ? 2 : 0 })}
                          </span>
                        </div>
                      )}
                      {sell && (
                        <div className="flex justify-between items-center">
                          <span className="text-blue-600 dark:text-blue-400">Sell ↓</span>
                          <span className="font-mono text-blue-700 dark:text-blue-300">
                            {sell.toLocaleString(undefined, { maximumFractionDigits: isCrypto ? 2 : 0 })}
                          </span>
                        </div>
                      )}
                      {spread && (
                        <div className="flex justify-between items-center pt-0.5 border-t border-border">
                          <span className="text-muted-foreground">Spread</span>
                          <span className="font-mono text-foreground">{spread}%</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 border-t border-border">
                        <span className={`flex items-center gap-0.5 ${age?.stale ? "text-amber-600 dark:text-amber-400" : ""}`}>
                          <Clock className="w-2.5 h-2.5" />
                          {age?.stale && <AlertTriangle className="w-2.5 h-2.5" />}
                          {age?.label}
                        </span>
                        <Link href="/accounting/exchange-rates">
                          <span className="text-primary hover:underline cursor-pointer">update rate →</span>
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* No rate warning */}
                  {!c.isBaseCurrency && !rate && (
                    <Link href="/accounting/exchange-rates">
                      <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:underline cursor-pointer rounded-lg bg-amber-50 dark:bg-amber-900/20 p-2">
                        <Link2 className="w-3 h-3" />No exchange rate set — click to add
                      </div>
                    </Link>
                  )}

                  {/* Base currency info */}
                  {c.isBaseCurrency && (
                    <div className="mb-2 text-xs text-muted-foreground rounded-lg bg-muted/30 p-2">
                      Base currency — all monetary values stored in {c.code}. Rate = 1:1 by definition.
                    </div>
                  )}

                  {/* System linkage: CoA accounts */}
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-3">
                    <Building2 className="w-3 h-3" />
                    {coaCount > 0
                      ? <span>{coaCount} CoA account{coaCount !== 1 ? "s" : ""} using this currency</span>
                      : <span className="italic">No CoA accounts linked yet</span>}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 pt-2 border-t border-border">
                    <Button size="sm" variant="ghost" className="h-7 text-xs flex-1" onClick={() => openEdit(c)}>
                      <Edit2 className="w-3 h-3 mr-1" />Edit
                    </Button>
                    {!c.isBaseCurrency && !rate && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-primary" asChild>
                        <Link href="/accounting/exchange-rates">
                          <TrendingUp className="w-3 h-3 mr-1" />Add Rate
                        </Link>
                      </Button>
                    )}
                    {!c.isBaseCurrency && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                        data-testid={`button-delete-${c.code}`}
                        onClick={() => { if (confirm(`Delete ${c.code}?`)) deleteMutation.mutate(c.code); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Currencies</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Fiat and crypto currencies — linked to exchange rates, CoA accounts, and records
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/accounting/exchange-rates">
              <TrendingUp className="w-4 h-4 mr-2" />Exchange Rates
            </Link>
          </Button>
          <Button onClick={() => setDialogOpen(true)} data-testid="button-new-currency">
            <Plus className="w-4 h-4 mr-2" />New Currency
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl sm:text-2xl font-bold">{currencies.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Fiat</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-600">{fiat.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Crypto</p>
          <p className="text-xl sm:text-2xl font-bold text-purple-600">{crypto.length}</p>
        </CardContent></Card>
        <Card className={missingRateCount > 0 ? "border-amber-300 dark:border-amber-600" : ""}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Missing Rates</p>
            <p className={`text-xl sm:text-2xl font-bold ${missingRateCount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
              {missingRateCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* System linkage explanation */}
      <div className="rounded-lg border border-border bg-muted/20 p-3 mb-6 text-xs text-muted-foreground">
        <div className="font-semibold text-foreground mb-1.5 text-sm">How currencies connect to the financial system</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <span className="font-medium text-foreground">1. Exchange Rates</span>
            <p>Each non-base currency has a <strong>buy rate</strong> (system rate auto-filled on cash inflow records) and a <strong>sell rate</strong> (auto-filled on outflow records). Mid rate is optional — reference only, not used in calculations.</p>
          </div>
          <div>
            <span className="font-medium text-foreground">2. CoA Accounts</span>
            <p>Each bank account (e.g. Kuraimi Bank YER) has its <strong>own buy/sell rate</strong> — the actual rate the bank gives us. This becomes the <strong>bankRate locked on each record</strong> at creation time.</p>
          </div>
          <div>
            <span className="font-medium text-foreground">3. Records &amp; Spread</span>
            <p>When a record is created, the bankRate is locked from the CoA account. Staff can then set a system (execution) rate. The difference becomes spread income posted to account 4201.</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-52 w-full" />)}
        </div>
      ) : (
        <div className="space-y-8">
          {fiat.length > 0   && renderGroup("Fiat Currencies",   fiat,   <DollarSign className="w-4 h-4 text-blue-500" />)}
          {crypto.length > 0 && renderGroup("Crypto Currencies", crypto, <span className="text-purple-500 font-bold text-sm">₿</span>)}
          {currencies.length === 0 && (
            <Card>
              <div className="flex flex-col items-center py-16">
                <DollarSign className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-medium">No currencies yet</p>
                <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />Add First Currency
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      <CurrencyDialog open={dialogOpen} onClose={handleClose} edit={editItem} />
    </div>
  );
}
