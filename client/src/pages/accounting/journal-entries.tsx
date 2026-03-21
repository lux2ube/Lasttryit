import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { JournalEntry, JournalEntryLine, AccountingPeriod, ChartOfAccount, Currency } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Trash2, CheckCircle2, XCircle, Eye, AlertTriangle, BookOpen, ChevronRight, Search
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const KNOWN_CURRENCIES = ["USD", "YER", "USDT", "SAR", "KWD", "BNB"] as const;

type ExchangeRate = { fromCurrency: string; toCurrency: string; rate: string };

// Searchable account combobox for journal entry lines
function AccountCombobox({
  value, onChange, accounts,
}: {
  value: string;
  onChange: (code: string, name: string, currency?: string) => void;
  accounts: ChartOfAccount[];
}) {
  const selected = accounts.find(a => a.code === value);
  const [search, setSearch] = useState(selected ? `${selected.code} — ${selected.name}` : "");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) setSearch(`${selected.code} — ${selected.name}`);
    else if (!value) setSearch("");
  }, [value, selected]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = !search.trim()
    ? accounts.slice(0, 40)
    : accounts.filter(a => {
        const q = search.toLowerCase();
        return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) ||
               (a.subtype ?? "").toLowerCase().includes(q);
      }).slice(0, 40);

  const TYPE_COLORS: Record<string, string> = {
    asset:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    liability: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    equity:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    revenue:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    expense:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search by code or name…"
          className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
        />
      </div>
      {open && filtered.length > 0 && (
        <div ref={dropRef} className="absolute z-50 top-full mt-1 w-80 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.map(a => (
            <div
              key={a.code}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent text-xs"
              onMouseDown={() => {
                onChange(a.code, a.name, a.currency ?? undefined);
                setSearch(`${a.code} — ${a.name}`);
                setOpen(false);
              }}
            >
              <span className="font-mono font-bold text-primary shrink-0">{a.code}</span>
              <span className="flex-1 truncate text-foreground">{a.name}</span>
              {a.currency && <span className="font-mono text-[10px] text-muted-foreground shrink-0">{a.currency}</span>}
              <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${TYPE_COLORS[a.type] ?? "bg-muted text-muted-foreground"}`}>{a.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_CONFIG: { [k: string]: { label: string; className: string; icon: any } } = {
  draft:  { label: "Draft",  className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: AlertTriangle },
  posted: { label: "Posted", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",   icon: CheckCircle2 },
  void:   { label: "Void",   className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",           icon: XCircle },
};

const lineSchema = z.object({
  accountCode:  z.string().min(1, "Account required"),
  accountName:  z.string().optional(),
  description:  z.string().optional(),
  debitAmount:  z.coerce.number().min(0).default(0),
  creditAmount: z.coerce.number().min(0).default(0),
  currency:     z.string().default("USD"),
  exchangeRate: z.coerce.number().positive().default(1),
  partyName:    z.string().optional(),
});

const entrySchema = z.object({
  periodId:    z.string().min(1, "Period required"),
  entryDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  description: z.string().min(3, "Description required"),
  notes:       z.string().optional(),
  lines:       z.array(lineSchema).min(2, "At least 2 lines required"),
});

function JournalEntryDetailDialog({
  open, onClose, entryId,
}: { open: boolean; onClose: () => void; entryId: string | null }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [voidReason, setVoidReason] = useState("");
  const [showVoid, setShowVoid] = useState(false);

  const { data, isLoading } = useQuery<{ entry: JournalEntry; lines: JournalEntryLine[] }>({
    queryKey: [`/api/accounting/journal-entries/${entryId}`],
    enabled: !!entryId,
  });

  const postMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/accounting/journal-entries/${entryId}/post`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting/journal-entries/${entryId}`] });
      toast({ title: "Journal entry posted to ledger" });
    },
    onError: (e: any) => toast({ title: "Cannot post", description: e.message, variant: "destructive" }),
  });

  const voidMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/accounting/journal-entries/${entryId}/void`, { reason: voidReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting/journal-entries/${entryId}`] });
      toast({ title: "Journal entry voided" });
      setShowVoid(false);
    },
    onError: (e: any) => toast({ title: "Cannot void", description: e.message, variant: "destructive" }),
  });

  if (!entryId) return null;
  const entry = data?.entry;
  const lines = data?.lines ?? [];
  const totalDebit  = lines.reduce((s, l) => s + parseFloat(String(l.debitAmount  ?? 0)), 0);
  const totalCredit = lines.reduce((s, l) => s + parseFloat(String(l.creditAmount ?? 0)), 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.001;
  const cfg = entry ? (STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.draft) : null;

  const canPost = user?.role === "admin" || user?.role === "finance_officer";
  const canVoid = user?.role === "admin";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-primary" />
            <DialogTitle className="text-lg">{entry?.entryNumber ?? "Loading…"}</DialogTitle>
            {cfg && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.className}`}>{cfg.label}</span>
            )}
            {entry?.sourceType && (
              <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded">
                Auto: {entry.sourceType}
              </span>
            )}
          </div>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : entry ? (
          <ScrollArea className="flex-1 overflow-auto">
            <div className="space-y-4 pr-4">
              {/* Header info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium font-mono">{entry.entryDate}</span></div>
                <div><span className="text-muted-foreground">Period:</span> <span className="font-medium">{entry.periodId}</span></div>
                <div><span className="text-muted-foreground">Base:</span> <span className="font-mono font-medium">{entry.baseCurrency}</span></div>
              </div>
              <div className="text-sm"><span className="text-muted-foreground">Description:</span> <span className="font-medium">{entry.description}</span></div>
              {entry.notes && <div className="text-sm text-muted-foreground">{entry.notes}</div>}

              <Separator />

              {/* Lines table */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Journal Lines</div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold w-8">#</th>
                        <th className="text-left px-3 py-2 font-semibold w-28">Account</th>
                        <th className="text-left px-3 py-2 font-semibold">Account Name</th>
                        <th className="text-left px-3 py-2 font-semibold">Description</th>
                        <th className="text-left px-3 py-2 font-semibold w-16">Curr.</th>
                        <th className="text-right px-3 py-2 font-semibold w-32">Debit</th>
                        <th className="text-right px-3 py-2 font-semibold w-32">Credit</th>
                        <th className="text-left px-3 py-2 font-semibold">Party</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {lines.map(line => (
                        <tr key={line.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 text-muted-foreground">{line.lineNumber}</td>
                          <td className="px-3 py-2 font-mono font-semibold text-primary">{line.accountCode}</td>
                          <td className="px-3 py-2">{line.accountName ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{line.description ?? "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs">{line.currency}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-blue-600 dark:text-blue-400">
                            {parseFloat(String(line.debitAmount)) > 0 ? parseFloat(String(line.debitAmount)).toFixed(2) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-green-600 dark:text-green-400">
                            {parseFloat(String(line.creditAmount)) > 0 ? parseFloat(String(line.creditAmount)).toFixed(2) : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{line.partyName ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/50 border-t-2 border-border">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 font-bold text-sm">Totals</td>
                        <td className="px-3 py-2 text-right font-bold font-mono text-blue-600 dark:text-blue-400">
                          {totalDebit.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold font-mono text-green-600 dark:text-green-400">
                          {totalCredit.toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Balance check */}
                <div className={`mt-2 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${isBalanced ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"}`}>
                  {isBalanced ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {isBalanced
                    ? "Entry is balanced — Total Debits = Total Credits"
                    : `UNBALANCED — Difference: ${Math.abs(totalDebit - totalCredit).toFixed(4)} (Debits ${totalDebit.toFixed(2)} ≠ Credits ${totalCredit.toFixed(2)})`}
                </div>
              </div>

              {/* Actions */}
              {entry.status === 'draft' && (
                <div className="flex gap-2 pt-2">
                  {canPost && (
                    <Button
                      onClick={() => postMut.mutate()}
                      disabled={!isBalanced || postMut.isPending}
                      data-testid="button-post-entry"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Post to Ledger
                    </Button>
                  )}
                  {!isBalanced && (
                    <span className="text-xs text-red-600 dark:text-red-400 self-center">
                      Cannot post — debits must equal credits
                    </span>
                  )}
                </div>
              )}
              {entry.status === 'posted' && canVoid && (
                showVoid ? (
                  <div className="flex gap-2 items-center">
                    <Input placeholder="Void reason (required)…" value={voidReason} onChange={e => setVoidReason(e.target.value)} className="flex-1" />
                    <Button variant="destructive" onClick={() => voidMut.mutate()} disabled={!voidReason.trim() || voidMut.isPending} data-testid="button-confirm-void">
                      Confirm Void
                    </Button>
                    <Button variant="outline" onClick={() => setShowVoid(false)}>Cancel</Button>
                  </div>
                ) : (
                  <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10"
                    onClick={() => setShowVoid(true)} data-testid="button-void-entry">
                    <XCircle className="w-4 h-4 mr-2" />Void Entry
                  </Button>
                )
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="py-8 text-center text-muted-foreground">Entry not found</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewJournalEntryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data: periods = [] }    = useQuery<AccountingPeriod[]>({ queryKey: ["/api/accounting/periods"] });
  const { data: accounts = [] }   = useQuery<ChartOfAccount[]>({ queryKey: ["/api/accounting/accounts"] });
  const { data: rates = [] }      = useQuery<ExchangeRate[]>({ queryKey: ["/api/accounting/exchange-rates"] });
  const { data: currencies = [] } = useQuery<Currency[]>({ queryKey: ["/api/accounting/currencies"] });

  const openPeriods    = periods.filter(p => p.status === 'open');
  const activeAccounts = accounts.filter(a => a.isActive && a.subtype !== 'group');

  // Set of crypto currency codes — their rates are "USD per token" (multiply to get USD).
  // Fiat rates are "fiat per USD" (divide to get USD).
  const cryptoSet = new Set(currencies.filter(c => c.type === 'crypto').map(c => c.code));
  const isCrypto  = (code: string) => cryptoSet.has(code);

  // Latest rate map: "YER→USD" → raw rate value (fiat=fiat-per-USD, crypto=USD-per-token)
  const rateMap = rates.reduce<Record<string, number>>((m, r) => {
    m[`${r.fromCurrency}→${r.toCurrency}`] = parseFloat(r.rate);
    return m;
  }, {});

  // Returns the raw/display rate (conventional: fiat-per-USD for fiat, USD-per-token for crypto).
  const lookupRate = (currency: string): number => {
    if (!currency || currency === "USD") return 1;
    if (rateMap[`${currency}→USD`] != null) return rateMap[`${currency}→USD`];
    if (rateMap[`USD→${currency}`] != null) return rateMap[`USD→${currency}`];
    return 1;
  };

  // Convert a native amount to USD using the display rate.
  // Fiat: amount ÷ rate (e.g. 10000 YER ÷ 536 = $18.66)
  // Crypto: amount × rate (e.g. 1 BNB × 350 = $350)
  const toUSD = (amount: number, rate: number, currency: string): number => {
    if (!currency || currency === "USD") return amount;
    return isCrypto(currency) ? amount * rate : amount / rate;
  };

  // The normalized exchange rate stored in the DB is always "USD per native unit" (the multiplier).
  // Fiat: 1/displayRate   Crypto: displayRate
  const effectiveRate = (displayRate: number, currency: string): number => {
    if (!currency || currency === "USD") return 1;
    return isCrypto(currency) ? displayRate : 1 / displayRate;
  };

  const form = useForm<z.infer<typeof entrySchema>>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      periodId:    "",
      entryDate:   new Date().toISOString().slice(0, 10),
      description: "",
      notes:       "",
      lines: [
        { accountCode: "", description: "", debitAmount: 0, creditAmount: 0, currency: "USD", exchangeRate: 1 },
        { accountCode: "", description: "", debitAmount: 0, creditAmount: 0, currency: "USD", exchangeRate: 1 },
      ],
    },
  });

  // Auto-select only open period when periods load
  useEffect(() => {
    if (openPeriods.length === 1 && !form.getValues("periodId"))
      form.setValue("periodId", openPeriods[0].id);
  }, [openPeriods.length]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const watchLines  = form.watch("lines");

  // Raw amounts per currency (for display per line)
  const totalDebitRaw  = watchLines.reduce((s, l) => s + (Number(l.debitAmount)  || 0), 0);
  const totalCreditRaw = watchLines.reduce((s, l) => s + (Number(l.creditAmount) || 0), 0);

  // USD-equivalent amounts using correct direction per currency type
  const totalDebitUsd  = watchLines.reduce((s, l) => s + toUSD(Number(l.debitAmount)  || 0, Number(l.exchangeRate) || 1, l.currency), 0);
  const totalCreditUsd = watchLines.reduce((s, l) => s + toUSD(Number(l.creditAmount) || 0, Number(l.exchangeRate) || 1, l.currency), 0);
  const isBalanced     = Math.abs(totalDebitUsd - totalCreditUsd) < 0.001;

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof entrySchema>) => {
      const { lines, ...entryData } = data;
      const linesPayload = lines.map((l, i) => {
        const dispRate = Number(l.exchangeRate) || 1;
        const effRate  = effectiveRate(dispRate, l.currency);
        return {
          ...l,
          lineNumber: i + 1,
          journalEntryId: "",
          accountName:  activeAccounts.find(a => a.code === l.accountCode)?.name ?? "",
          debitAmount:  String(l.debitAmount),
          creditAmount: String(l.creditAmount),
          exchangeRate: String(effRate),
          debitBase:    String(toUSD(Number(l.debitAmount)  || 0, dispRate, l.currency)),
          creditBase:   String(toUSD(Number(l.creditAmount) || 0, dispRate, l.currency)),
        };
      });
      return apiRequest("POST", "/api/accounting/journal-entries", { entry: entryData, lines: linesPayload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"] });
      toast({ title: "Journal entry created" });
      form.reset();
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
          <p className="text-sm text-muted-foreground">Every debit MUST have a corresponding credit. Total Debits = Total Credits.</p>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="flex flex-col gap-4 flex-1 overflow-hidden">

            {/* Header fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="periodId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Accounting Period *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-entry-period"><SelectValue placeholder="Select period…" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {openPeriods.length === 0 && <SelectItem value="_none">No open periods</SelectItem>}
                      {openPeriods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="entryDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Entry Date *</FormLabel>
                  <FormControl><Input type="date" {...field} data-testid="input-entry-date" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl><Input placeholder="e.g. Customer deposit — Ahmed Ali" {...field} data-testid="input-entry-description" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Lines */}
            <div className="flex-1 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Journal Lines</div>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => append({ accountCode: "", description: "", debitAmount: 0, creditAmount: 0, currency: "USD", exchangeRate: 1 })}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Add Line
                </Button>
              </div>

              <div className="space-y-2">
                {fields.map((field, idx) => {
                  const lineCurrency   = watchLines[idx]?.currency ?? "USD";
                  const isUSD          = lineCurrency === "USD";
                  const lineDebit      = Number(watchLines[idx]?.debitAmount)  || 0;
                  const lineCredit     = Number(watchLines[idx]?.creditAmount) || 0;
                  const lineRate       = Number(watchLines[idx]?.exchangeRate) || 1;
                  const debitUsd       = toUSD(lineDebit,  lineRate, lineCurrency);
                  const creditUsd      = toUSD(lineCredit, lineRate, lineCurrency);
                  // Lock currency once an account is selected (account determines currency)
                  const accountCode    = watchLines[idx]?.accountCode;
                  const selectedAcct   = activeAccounts.find(a => a.code === accountCode);
                  const currencyLocked = !!(accountCode && selectedAcct?.currency);

                  return (
                    <div key={field.id} className="rounded-lg border border-border bg-background p-3">
                      {/* Row 1: # · Account (wide, searchable) · DR · CR · Remove */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">{idx + 1}</span>

                        {/* Searchable account combobox */}
                        <div className="flex-1 min-w-0">
                          <FormField control={form.control} name={`lines.${idx}.accountCode`} render={({ field: f }) => (
                            <AccountCombobox
                              value={f.value}
                              accounts={activeAccounts}
                              onChange={(code, name, cur) => {
                                f.onChange(code);
                                form.setValue(`lines.${idx}.accountName`, name);
                                if (cur) {
                                  form.setValue(`lines.${idx}.currency`, cur);
                                  form.setValue(`lines.${idx}.exchangeRate`, lookupRate(cur));
                                }
                              }}
                            />
                          )} />
                        </div>

                        {/* DEBIT */}
                        <div className="w-36 shrink-0">
                          <FormField control={form.control} name={`lines.${idx}.debitAmount`} render={({ field: f }) => (
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-500">DR</span>
                              <Input className="h-8 text-xs text-right font-mono text-blue-600 dark:text-blue-400 pl-7" type="number" step="0.01" min="0" {...f}
                                onChange={e => { f.onChange(e); if (Number(e.target.value) > 0) form.setValue(`lines.${idx}.creditAmount`, 0); }} />
                            </div>
                          )} />
                          {!isUSD && lineDebit > 0 && (
                            <p className="text-[10px] text-blue-400/80 text-right mt-0.5 font-mono">≈ ${debitUsd.toFixed(2)} USD</p>
                          )}
                        </div>

                        {/* CREDIT */}
                        <div className="w-36 shrink-0">
                          <FormField control={form.control} name={`lines.${idx}.creditAmount`} render={({ field: f }) => (
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-green-500">CR</span>
                              <Input className="h-8 text-xs text-right font-mono text-green-600 dark:text-green-400 pl-7" type="number" step="0.01" min="0" {...f}
                                onChange={e => { f.onChange(e); if (Number(e.target.value) > 0) form.setValue(`lines.${idx}.debitAmount`, 0); }} />
                            </div>
                          )} />
                          {!isUSD && lineCredit > 0 && (
                            <p className="text-[10px] text-green-400/80 text-right mt-0.5 font-mono">≈ ${creditUsd.toFixed(2)} USD</p>
                          )}
                        </div>

                        {/* Remove */}
                        <div className="w-7 shrink-0">
                          {fields.length > 2 && (
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(idx)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Description · Currency · Rate (only if non-USD) */}
                      <div className="flex items-center gap-2 mt-2 ml-7">
                        <FormField control={form.control} name={`lines.${idx}.description`} render={({ field: f }) => (
                          <Input className="h-7 text-xs flex-1" placeholder="Line description (optional)…" {...f} />
                        )} />

                        {/* Currency select — locked once an account is selected */}
                        <FormField control={form.control} name={`lines.${idx}.currency`} render={({ field: f }) => (
                          <Select value={f.value} disabled={currencyLocked} onValueChange={v => {
                            f.onChange(v);
                            form.setValue(`lines.${idx}.exchangeRate`, lookupRate(v));
                          }}>
                            <SelectTrigger className="h-7 w-24 text-xs font-mono" data-testid={`select-line-currency-${idx}`}
                              title={currencyLocked ? "Currency is set by the selected account" : undefined}>
                              <SelectValue placeholder="USD" />
                            </SelectTrigger>
                            <SelectContent>
                              {KNOWN_CURRENCIES.map(c => (
                                <SelectItem key={c} value={c} className="font-mono text-xs">{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )} />

                        {/* Exchange rate — shown only for non-USD lines */}
                        {!isUSD && (
                          <FormField control={form.control} name={`lines.${idx}.exchangeRate`} render={({ field: f }) => (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground shrink-0">Rate</span>
                              <Input className="h-7 w-24 text-xs font-mono" type="number" step="0.000001" {...f}
                                data-testid={`input-line-rate-${idx}`} />
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {isCrypto(lineCurrency) ? `USD/${lineCurrency}` : `${lineCurrency}/USD`}
                              </span>
                            </div>
                          )} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Totals + balance indicator */}
              <div className="mt-3 rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-2 text-sm font-medium ${isBalanced && totalDebitUsd > 0 ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
                    {isBalanced && totalDebitUsd > 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {isBalanced && totalDebitUsd > 0
                      ? "Balanced (USD-equivalent) — ready to save"
                      : totalDebitUsd === 0 && totalCreditUsd === 0
                      ? "Enter amounts above"
                      : `Out of balance by $${Math.abs(totalDebitUsd - totalCreditUsd).toFixed(4)} USD`}
                  </div>
                  <div className="flex items-center gap-6 text-sm font-mono font-bold">
                    <div className="flex flex-col items-end">
                      <span className="text-blue-600 dark:text-blue-400">DR {totalDebitRaw.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span className="text-[10px] text-blue-400/70 font-normal">≈ ${totalDebitUsd.toFixed(2)} USD</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-green-600 dark:text-green-400">CR {totalCreditRaw.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span className="text-[10px] text-green-400/70 font-normal">≈ ${totalCreditUsd.toFixed(2)} USD</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-journal-entry">
                {mutation.isPending ? "Saving…" : "Save Journal Entry"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function JournalEntriesPage() {
  const [formOpen, setFormOpen]   = useState(false);
  const [viewId, setViewId]       = useState<string | null>(null);
  const [statusFilter, setStatus] = useState("all");
  const [periodFilter, setPeriod] = useState("all");
  const { user } = useAuth();

  const { data: entries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/accounting/journal-entries"],
  });
  const { data: periods = [] } = useQuery<AccountingPeriod[]>({
    queryKey: ["/api/accounting/periods"],
  });

  const canCreate = ["admin", "finance_officer", "operations_manager"].includes(user?.role ?? "");

  const filtered = entries.filter(e => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (periodFilter !== "all" && e.periodId !== periodFilter) return false;
    return true;
  });

  const totalDebits  = entries.filter(e => e.status === 'posted').reduce((s, e) => s + parseFloat(String(e.totalDebit  ?? 0)), 0);
  const totalCredits = entries.filter(e => e.status === 'posted').reduce((s, e) => s + parseFloat(String(e.totalCredit ?? 0)), 0);
  const draftCount   = entries.filter(e => e.status === 'draft').length;
  const postedCount  = entries.filter(e => e.status === 'posted').length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-border bg-background/95 flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">Journal Entries</h1>
          <p className="text-sm text-muted-foreground">The ledger engine — every financial event recorded as double-entry (Debits = Credits)</p>
        </div>
        {canCreate && (
          <Button onClick={() => setFormOpen(true)} data-testid="button-new-journal-entry">
            <Plus className="w-4 h-4 mr-2" />New Journal Entry
          </Button>
        )}
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-3 sm:px-6 py-3">
        {[
          { label: "Total Entries",    value: entries.length, color: "text-foreground" },
          { label: "Draft",            value: draftCount,     color: "text-yellow-600 dark:text-yellow-400" },
          { label: "Posted",           value: postedCount,    color: "text-green-600 dark:text-green-400" },
          { label: "Ledger Balance",   value: Math.abs(totalDebits - totalCredits) < 0.01 ? "✓ Balanced" : `Δ ${Math.abs(totalDebits - totalCredits).toFixed(2)}`, color: Math.abs(totalDebits - totalCredits) < 0.01 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400" },
        ].map(kpi => (
          <div key={kpi.label} className="border border-border rounded-lg p-3 bg-card">
            <div className={`text-xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-2">
        <Select value={statusFilter} onValueChange={setStatus}>
          <SelectTrigger className="w-32 h-9" data-testid="select-journal-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={setPeriod}>
          <SelectTrigger className="w-40 h-9" data-testid="select-journal-period-filter">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Periods</SelectItem>
            {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} entries</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-3 sm:px-6 pb-3 sm:pb-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading journal entries…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No journal entries found</div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold w-36">Entry #</th>
                  <th className="text-left px-4 py-2.5 font-semibold w-28">Date</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Description</th>
                  <th className="text-left px-4 py-2.5 font-semibold w-24">Source</th>
                  <th className="text-right px-4 py-2.5 font-semibold w-28 text-blue-600 dark:text-blue-400">Total Debit</th>
                  <th className="text-right px-4 py-2.5 font-semibold w-28 text-green-600 dark:text-green-400">Total Credit</th>
                  <th className="text-left px-4 py-2.5 font-semibold w-20">Status</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(entry => {
                  const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.draft;
                  const debit  = parseFloat(String(entry.totalDebit  ?? 0));
                  const credit = parseFloat(String(entry.totalCredit ?? 0));
                  const balanced = Math.abs(debit - credit) < 0.01;
                  return (
                    <tr key={entry.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-je-${entry.id}`}>
                      <td className="px-4 py-2.5 font-mono font-semibold text-primary">{entry.entryNumber}</td>
                      <td className="px-4 py-2.5 font-mono text-sm">{entry.entryDate}</td>
                      <td className="px-4 py-2.5">
                        <div className="truncate max-w-xs">{entry.description}</div>
                        {entry.sourceType && <div className="text-xs text-muted-foreground">Auto: {entry.sourceType}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.sourceType && (
                          <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded">
                            {entry.sourceType}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-600 dark:text-blue-400">{debit.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-green-600 dark:text-green-400">
                        <div className="flex items-center justify-end gap-1">
                          {credit.toFixed(2)}
                          {!balanced && entry.status !== 'void' && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.className}`}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          data-testid={`button-view-je-${entry.id}`}
                          onClick={() => setViewId(entry.id)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewJournalEntryDialog open={formOpen} onClose={() => setFormOpen(false)} />
      <JournalEntryDetailDialog open={!!viewId} onClose={() => setViewId(null)} entryId={viewId} />
    </div>
  );
}
