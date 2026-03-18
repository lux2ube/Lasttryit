import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertChartOfAccountsSchema } from "@shared/schema";
import type { ChartOfAccount, Provider, Currency } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Pencil, Trash2, Lock, Building2, TrendingUp, TrendingDown } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";

// Debit-normal: Asset(1xxx), Expense(5xxx) — balance = DR - CR, positive = healthy
// Credit-normal: Liability(2xxx), Equity(3xxx), Revenue(4xxx) — balance = CR - DR, positive = healthy
const DEBIT_NORMAL = new Set(["asset", "expense"]);

function computeBalance(type: string, totalDebit: number, totalCredit: number) {
  if (DEBIT_NORMAL.has(type)) return totalDebit - totalCredit;
  return totalCredit - totalDebit;
}

const ACCOUNT_TYPE_COLORS: { [k: string]: string } = {
  asset:     "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  liability: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  equity:    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  revenue:   "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  expense:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};
const TYPE_LABEL: { [k: string]: string } = {
  asset: "Asset", liability: "Liability", equity: "Equity", revenue: "Revenue", expense: "Expense",
};
const TYPE_RANGE: { [k: string]: string } = {
  asset: "1000–1999", liability: "2000–2999", equity: "3000–3999", revenue: "4000–4999", expense: "5000–5999",
};

const formSchema = insertChartOfAccountsSchema.extend({
  code: z.string().min(2, "Account code required"),
  name: z.string().min(2, "Account name required"),
});

function AccountFormDialog({
  open, onClose, initial,
}: { open: boolean; onClose: () => void; initial?: ChartOfAccount }) {
  const { toast } = useToast();
  const { data: allAccounts = [] } = useQuery<ChartOfAccount[]>({ queryKey: ["/api/accounting/accounts"] });
  const { data: providerList = [] } = useQuery<Provider[]>({ queryKey: ["/api/accounting/providers"] });
  const { data: currencies = [] } = useQuery<Currency[]>({ queryKey: ["/api/accounting/currencies"] });

  const SUBTYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
    asset:     [
      { value: "cash",             label: "Cash on Hand" },
      { value: "bank",             label: "Bank Account" },
      { value: "cash_wallet",      label: "Cash Mobile Wallet" },
      { value: "crypto_wallet",    label: "Crypto Wallet" },
      { value: "crypto_platform",  label: "Crypto Platform / Exchange" },
      { value: "broker",           label: "Forex Broker" },
      { value: "cash_remittance",  label: "Cash Remittance Agent" },
      { value: "receivable",       label: "Receivable" },
      { value: "parent",           label: "Parent / Control Account" },
    ],
    liability: [
      { value: "suspense",   label: "Suspense / Unidentified" },
      { value: "liability",  label: "Customer Liability" },
      { value: "payable",    label: "Customer Payable" },
      { value: "parent",     label: "Parent / Control Account" },
    ],
    equity:    [
      { value: "capital",      label: "Owner Capital" },
      { value: "retained",     label: "Retained Earnings" },
      { value: "current_pnl",  label: "Current Period Net Income" },
      { value: "parent",       label: "Parent / Control Account" },
    ],
    revenue:   [
      { value: "fee",        label: "Service Fee Income" },
      { value: "spread",     label: "FX Spread Income" },
      { value: "network",    label: "Network Fee Recovery" },
      { value: "parent",     label: "Parent / Control Account" },
    ],
    expense:   [
      { value: "network",      label: "Blockchain Gas / Network Fee" },
      { value: "bank",         label: "Bank Charges" },
      { value: "supplier",     label: "Supplier / Exchange Expense" },
      { value: "operational",  label: "Operational Expense" },
      { value: "parent",       label: "Parent / Control Account" },
    ],
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code:        initial?.code         ?? "",
      name:        initial?.name         ?? "",
      type:        (initial?.type as any) ?? "asset",
      subtype:     initial?.subtype      ?? "",
      parentCode:  initial?.parentCode   ?? "",
      currency:    initial?.currency     ?? "USD",
      description: initial?.description  ?? "",
      isActive:    initial?.isActive     ?? true,
      providerId:  initial?.providerId   ?? "",
      buyRate:     initial?.buyRate      ?? "",
      sellRate:    initial?.sellRate     ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: any) =>
      initial
        ? apiRequest("PUT", `/api/accounting/accounts/${initial.id}`, data)
        : apiRequest("POST", "/api/accounting/accounts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/accounts"] });
      toast({ title: initial ? "Account updated" : "Account created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const watchType = form.watch("type");
  const watchProviderId = form.watch("providerId");
  const parentOptions = allAccounts.filter(a => a.subtype === "parent" && a.code !== initial?.code);
  const selectedProvider = providerList.find(p => p.id === watchProviderId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Account" : "New Account"}</DialogTitle>
          <DialogDescription className="sr-only">Account form</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-3">

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Code * <InfoTip text="1xxx Asset · 2xxx Liability · 3xxx Equity · 4xxx Revenue · 5xxx Expense" /></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 1201" {...field} data-testid="input-account-code" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-account-type"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(TYPE_LABEL).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l} ({TYPE_RANGE[v]})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Trust Wallet – USDT BEP20" {...field} data-testid="input-account-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="subtype" render={({ field }) => (
                <FormItem>
                  <FormLabel>Subtype</FormLabel>
                  <Select onValueChange={v => field.onChange(v === "none" ? "" : v)} value={field.value || "none"}>
                    <FormControl>
                      <SelectTrigger data-testid="select-account-subtype"><SelectValue placeholder="Select subtype…" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">— (none)</SelectItem>
                      {(SUBTYPE_OPTIONS[watchType] ?? []).map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="currency" render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-account-currency"><SelectValue placeholder="Select currency…" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {currencies.map(c => (
                        <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="parentCode" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Parent <InfoTip text="Only parent/control accounts shown" /></FormLabel>
                  <Select onValueChange={v => field.onChange(v === "none" ? "" : v)} value={field.value || "none"}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="(none)" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">(none — top level)</SelectItem>
                      {parentOptions.map(a => (
                        <SelectItem key={a.code} value={a.code}>{a.code} – {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="providerId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Provider <InfoTip text="Links to a payment gateway for transaction routing" /></FormLabel>
                  <Select onValueChange={v => field.onChange(v === "none" ? "" : v)} value={field.value || "none"}>
                    <FormControl>
                      <SelectTrigger data-testid="select-account-provider">
                        <SelectValue placeholder="(none)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">(none — internal)</SelectItem>
                      {providerList.filter(p => p.isActive).map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {(p as any).networkCode && (
                            <span className="ml-1.5 text-xs text-muted-foreground">· {(p as any).networkCode}</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="buyRate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Buy Rate <InfoTip text="Rate when we buy from customer. Leave blank for crypto/USD." /></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} type="number" step="0.000001"
                      placeholder="e.g. 535" data-testid="input-buy-rate" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="sellRate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Sell Rate <InfoTip text="Rate when we sell to customer. Spread = System − Account rate." /></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} type="number" step="0.000001"
                      placeholder="e.g. 533" data-testid="input-sell-rate" />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} placeholder="Optional description" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0 pb-1">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-account-active" />
                  </FormControl>
                  <FormLabel className="!mt-0">Active</FormLabel>
                </FormItem>
              )} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-account">
                {mutation.isPending ? "Saving…" : "Save Account"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ChartOfAccountsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChartOfAccount | undefined>();

  const { data: accounts = [], isLoading } = useQuery<ChartOfAccount[]>({
    queryKey: ["/api/accounting/accounts"],
  });
  const { data: balances = {} } = useQuery<{ [id: string]: { totalDebit: number; totalCredit: number } }>({
    queryKey: ["/api/accounting/accounts/balances"],
  });
  const { data: providerList = [] } = useQuery<Provider[]>({
    queryKey: ["/api/accounting/providers"],
  });
  const providerMap = Object.fromEntries(providerList.map(p => [String(p.id), p]));

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/accounting/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/accounts"] });
      toast({ title: "Account deleted" });
    },
    onError: (e: any) => toast({ title: "Cannot delete", description: e.message, variant: "destructive" }),
  });

  const filtered = accounts.filter(a => {
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    if (search && !a.code.includes(search) && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by type prefix for display
  const grouped: { [key: string]: ChartOfAccount[] } = {};
  for (const a of filtered) {
    const t = a.type;
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(a);
  }
  const typeOrder = ["asset", "liability", "equity", "revenue", "expense"];

  const summary = { asset: 0, liability: 0, equity: 0, revenue: 0, expense: 0 };
  for (const a of accounts) if (a.type in summary) (summary as any)[a.type]++;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/95">
        <div>
          <h1 className="text-xl font-bold">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">Double-entry accounting backbone — all accounts classified by type</p>
        </div>
        <Button onClick={() => { setEditTarget(undefined); setFormOpen(true); }} data-testid="button-new-account">
          <Plus className="w-4 h-4 mr-2" />New Account
        </Button>
      </div>

      {/* Summary bars */}
      <div className="grid grid-cols-5 gap-3 px-6 pt-4 pb-2">
        {typeOrder.map(t => (
          <div key={t} className={`rounded-lg p-3 ${ACCOUNT_TYPE_COLORS[t]}`}>
            <div className="text-lg font-bold">{(summary as any)[t]}</div>
            <div className="text-xs font-medium">{TYPE_LABEL[t]}s</div>
            <div className="text-xs opacity-70">{TYPE_RANGE[t]}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search code or name…" className="pl-9 h-9" value={search}
            onChange={e => setSearch(e.target.value)} data-testid="input-search-accounts" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 h-9" data-testid="select-type-filter">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {typeOrder.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} accounts</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading chart of accounts…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No accounts found</div>
        ) : (
          typeOrder.filter(t => grouped[t]?.length > 0).map(t => (
            <div key={t} className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${ACCOUNT_TYPE_COLORS[t]}`}>
                  {TYPE_LABEL[t].toUpperCase()} — {TYPE_RANGE[t]}
                </span>
                <span className="text-xs text-muted-foreground">{grouped[t].length} accounts</span>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold w-20">Code</th>
                      <th className="text-left px-4 py-2.5 font-semibold">Account Name</th>
                      <th className="text-left px-4 py-2.5 font-semibold w-36">Provider</th>
                      <th className="text-left px-4 py-2.5 font-semibold w-16">Curr.</th>
                      <th className="text-right px-4 py-2.5 font-semibold w-24 text-green-700 dark:text-green-400">Buy Rate</th>
                      <th className="text-right px-4 py-2.5 font-semibold w-24 text-amber-700 dark:text-amber-400">Sell Rate</th>
                      <th className="text-right px-4 py-2.5 font-semibold w-28 text-blue-700 dark:text-blue-300">Total DR</th>
                      <th className="text-right px-4 py-2.5 font-semibold w-28 text-orange-700 dark:text-orange-300">Total CR</th>
                      <th className="text-right px-4 py-2.5 font-semibold w-28">Balance</th>
                      <th className="text-left px-4 py-2.5 font-semibold w-20">Status</th>
                      <th className="w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {grouped[t].map(acc => {
                      const prov = acc.providerId ? providerMap[acc.providerId] : undefined;
                      const bal = balances[acc.id];
                      const dr  = bal?.totalDebit  ?? 0;
                      const cr  = bal?.totalCredit ?? 0;
                      const balance = computeBalance(acc.type, dr, cr);
                      const balPositive = balance >= 0;
                      const hasActivity = dr > 0 || cr > 0;
                      const normalSide  = DEBIT_NORMAL.has(acc.type) ? "DR" : "CR";
                      return (
                        <tr key={acc.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-account-${acc.code}`}>
                        <td className="px-4 py-2.5 font-mono font-semibold text-primary">{acc.code}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className={acc.parentCode ? "text-muted-foreground" : "font-medium"}>{acc.name}</span>
                            {acc.isSystemAcc && <Lock className="w-3 h-3 text-muted-foreground" title="System account" />}
                          </div>
                          {acc.description && <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">{acc.description}</div>}
                        </td>
                        <td className="px-4 py-2.5">
                          {prov ? (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="w-3 h-3 text-primary shrink-0" />
                              <div>
                                <div className="text-xs font-medium text-foreground">{prov.name}</div>
                                <div className="text-xs text-muted-foreground">{prov.fieldName}</div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{acc.currency}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {acc.buyRate ? <span className="text-green-700 dark:text-green-400">{Number(acc.buyRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {acc.sellRate ? <span className="text-amber-700 dark:text-amber-400">{Number(acc.sellRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        {/* Total DR */}
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {hasActivity || dr > 0
                            ? <span className="text-blue-700 dark:text-blue-300">{dr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        {/* Total CR */}
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {hasActivity || cr > 0
                            ? <span className="text-orange-700 dark:text-orange-300">{cr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        {/* Balance */}
                        <td className="px-4 py-2.5 text-right" data-testid={`balance-${acc.code}`}>
                          {hasActivity ? (
                            <div className="flex items-center justify-end gap-1">
                              {balPositive
                                ? <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
                                : <TrendingDown className="w-3 h-3 text-red-500 shrink-0" />}
                              <span className={`font-mono text-xs font-semibold ${balPositive ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{normalSide}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${acc.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                            {acc.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-edit-account-${acc.code}`}
                              onClick={() => { setEditTarget(acc); setFormOpen(true); }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {!acc.isSystemAcc && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                data-testid={`button-delete-account-${acc.code}`}
                                onClick={() => { if (confirm(`Delete account ${acc.code}?`)) deleteMut.mutate(acc.id); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      <AccountFormDialog key={editTarget?.id ?? "new"} open={formOpen} onClose={() => setFormOpen(false)} initial={editTarget} />
    </div>
  );
}
