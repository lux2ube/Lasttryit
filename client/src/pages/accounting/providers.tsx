import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProviderSchema } from "@shared/schema";
import type { Provider, Currency, CryptoNetwork } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Search, Pencil, Trash2, Building2, Hash, MapPin,
  Loader2, Tag, Copy, Check, Percent, DollarSign, TrendingDown, TrendingUp,
  ArrowDownToLine, ArrowUpFromLine,
} from "lucide-react";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s*[-–]\s*/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30);
}

const PROVIDER_CATEGORIES = [
  { value: "crypto_wallet",    label: "Crypto Wallet",     desc: "Self-custody wallet (Trust Wallet)" },
  { value: "crypto_platform",  label: "Crypto Platform",   desc: "Exchange / CEX (Binance, Bybit, OKX)" },
  { value: "broker",           label: "Forex Broker",      desc: "Trading broker (HeadWay, Valetax, OneRoyal)" },
  { value: "cash_bank",        label: "Cash Bank",         desc: "Bank transfer (Kuraimi, CAC Bank)" },
  { value: "cash_wallet",      label: "Cash Mobile Wallet",desc: "Mobile wallet (Jaib, Jawali, Onecash)" },
  { value: "cash_remittance",  label: "Cash Remittance",   desc: "Hawala / exchange agent" },
];

const FIELD_TYPES = [
  { value: "address",     label: "Wallet Address",  desc: "Blockchain address (0x… / T…)" },
  { value: "platform_id", label: "Platform ID",     desc: "Exchange UID or username" },
  { value: "account_id",  label: "Account ID",      desc: "Bank account or IBAN" },
  { value: "name_phone",  label: "Name + Phone",    desc: "Recipient name and phone number" },
];


const formSchema = insertProviderSchema.extend({
  code: z.string()
    .min(2, "Code is required")
    .max(30, "Max 30 characters")
    .regex(/^[a-z0-9_]+$/, "Only lowercase letters, digits, underscores"),
  name:              z.string().min(2, "Provider name required"),
  fieldName:         z.string().min(2, "Field name required"),
  providerCategory:  z.string().default("crypto_wallet"),
  currency:          z.string().min(1, "Currency required"),
  networkCode:       z.string().optional(),
  depositFeeRate:      z.string().optional(),
  withdrawFeeRate:     z.string().optional(),
  depositExpenseRate:  z.string().optional(),
  withdrawExpenseRate: z.string().optional(),
  networkFeeUsd:  z.string().optional(),
  minDepositUsd:  z.string().optional(),
  maxDepositUsd:  z.string().optional(),
  minWithdrawUsd: z.string().optional(),
  maxWithdrawUsd: z.string().optional(),
});
type ProviderForm = z.infer<typeof formSchema>;

function CodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      className="inline-flex items-center gap-1 font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer select-none"
      title="Click to copy code"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 opacity-60" />}
      {code}
    </button>
  );
}

function fmtRate(r: string | null | undefined) {
  if (!r) return null;
  const n = parseFloat(r);
  if (isNaN(n)) return null;
  return n.toFixed(4).replace(/\.?0+$/, "") + "%";
}

function ProviderFormDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Provider }) {
  const { toast } = useToast();
  const { data: currencies = [] } = useQuery<Currency[]>({ queryKey: ["/api/accounting/currencies"] });
  const { data: networks = [] } = useQuery<CryptoNetwork[]>({
    queryKey: ["/api/accounting/networks"],
    queryFn: () => fetch("/api/accounting/networks").then((r) => r.json()),
  });

  const form = useForm<ProviderForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code:             initial?.code             ?? "",
      name:             initial?.name             ?? "",
      providerCategory: (initial as any)?.providerCategory ?? "crypto_wallet",
      fieldType:        (initial?.fieldType as any) ?? "address",
      fieldName:        initial?.fieldName         ?? "",
      currency:         (initial as any)?.currency  ?? "",
      networkCode:      (initial as any)?.networkCode ?? "",
      depositFeeRate:      (initial as any)?.depositFeeRate      ? String((initial as any).depositFeeRate)      : "",
      withdrawFeeRate:     (initial as any)?.withdrawFeeRate     ? String((initial as any).withdrawFeeRate)     : "",
      depositExpenseRate:  (initial as any)?.depositExpenseRate  ? String((initial as any).depositExpenseRate)  : "",
      withdrawExpenseRate: (initial as any)?.withdrawExpenseRate ? String((initial as any).withdrawExpenseRate) : "",
      networkFeeUsd:  (initial as any)?.networkFeeUsd  ? String((initial as any).networkFeeUsd)  : "",
      minDepositUsd:  (initial as any)?.minDepositUsd  ? String((initial as any).minDepositUsd)  : "",
      maxDepositUsd:  (initial as any)?.maxDepositUsd  ? String((initial as any).maxDepositUsd)  : "",
      minWithdrawUsd: (initial as any)?.minWithdrawUsd ? String((initial as any).minWithdrawUsd) : "",
      maxWithdrawUsd: (initial as any)?.maxWithdrawUsd ? String((initial as any).maxWithdrawUsd) : "",
      description: initial?.description ?? "",
      isActive:    initial?.isActive    ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: ProviderForm) => {
      const clean = {
        ...data,
        depositFeeRate:      data.depositFeeRate      || undefined,
        withdrawFeeRate:     data.withdrawFeeRate     || undefined,
        depositExpenseRate:  data.depositExpenseRate  || undefined,
        withdrawExpenseRate: data.withdrawExpenseRate || undefined,
        networkFeeUsd:       data.networkFeeUsd       || undefined,
        minDepositUsd:       data.minDepositUsd       || undefined,
        maxDepositUsd:       data.maxDepositUsd       || undefined,
        minWithdrawUsd:      data.minWithdrawUsd      || undefined,
        maxWithdrawUsd:      data.maxWithdrawUsd      || undefined,
        networkCode:         data.networkCode         || undefined,
      };
      return initial
        ? apiRequest("PATCH", `/api/accounting/providers/${initial.id}`, clean)
        : apiRequest("POST", "/api/accounting/providers", clean);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/providers"] });
      toast({ title: initial ? "Provider updated" : "Provider created" });
      onClose(); form.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const watchFieldType = form.watch("fieldType");
  const watchName = form.watch("name");

  const fieldTypeSuffix: Record<string, string> = {
    address: "Wallet Address",
    platform_id: "Platform ID",
    account_id: "Account Number",
    name_phone: "Name & Phone",
  };

  const handleNameBlur = () => {
    const n = watchName.trim();
    if (!n) return;
    if (!form.getValues("code")) form.setValue("code", slugify(n), { shouldValidate: true });
    if (!form.getValues("fieldName"))
      form.setValue("fieldName", `${n} ${(fieldTypeSuffix as Record<string, string>)[watchFieldType ?? ""] ?? "ID"}`);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Provider" : "New Provider"}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Define the channel identity, customer field label, fee rates you charge, expense rates the channel costs you, and transaction limits.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-5">

            {/* ── Identity ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />Identity
              </p>
              <div className="space-y-3">

                {/* Row 1: Category + Active */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="providerCategory" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provider Category <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-provider-category"><SelectValue placeholder="Select category…" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {PROVIDER_CATEGORIES.map(c => (
                            <SelectItem key={c.value} value={c.value}>
                              <span className="font-medium">{c.label}</span>
                              <span className="ml-1 text-muted-foreground text-xs">— {c.desc}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="isActive" render={({ field }) => (
                    <FormItem className="flex items-center gap-3 pt-6">
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-provider-active" /></FormControl>
                      <FormLabel className="!mt-0">Active</FormLabel>
                    </FormItem>
                  )} />
                </div>

                {/* Row 2: Code */}
                <FormField control={form.control} name="code" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider Code <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. usdt_bep20, kuraimi_yer, binance" className="font-mono" {...field} data-testid="input-provider-code" />
                    </FormControl>
                    <FormDescription className="text-xs">Lowercase letters, numbers, underscores only. Stable reference — don't change after creation.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Row 3: Name + Currency */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. USDT - BEP20, Kuraimi Bank YER" {...field}
                          onBlur={() => { field.onBlur(); handleNameBlur(); }}
                          data-testid="input-provider-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="currency" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Currency <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-provider-currency"><SelectValue placeholder="Select currency…" /></SelectTrigger></FormControl>
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

                {/* Row 4: Field Type + Network (crypto only) */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="fieldType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Field Type <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-field-type"><SelectValue placeholder="Select field type…" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {FIELD_TYPES.map(ft => (
                            <SelectItem key={ft.value} value={ft.value}>
                              <span className="font-medium">{ft.label}</span>
                              <span className="ml-1 text-muted-foreground text-xs">— {ft.desc}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="networkCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Blockchain Network</FormLabel>
                      <Select onValueChange={v => field.onChange(v === "none" ? "" : v)} value={field.value || "none"}>
                        <FormControl><SelectTrigger data-testid="select-network-code"><SelectValue placeholder="Select network…" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="none">— Not applicable —</SelectItem>
                          {networks.filter(n => n.isActive).map(n => (
                            <SelectItem key={n.code} value={n.code}>
                              {n.code}
                              <span className="ml-1 text-muted-foreground text-xs">— {n.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">Blockchain network for crypto providers</FormDescription>
                    </FormItem>
                  )} />
                </div>

                {/* Row 5: Field Label */}
                <FormField control={form.control} name="fieldName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Field Label <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. USDT BEP20 Wallet Address, Kuraimi Bank Account Number" {...field} data-testid="input-field-name" />
                    </FormControl>
                    <FormDescription className="text-xs">Label shown when asking the customer for their address/ID on this channel</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            <Separator />

            {/* ── Fee Rates (what we charge customers) ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-emerald-600" />Fee Rates
                <span className="font-normal normal-case text-muted-foreground ml-1">— what we charge the customer for using this channel (%)</span>
              </p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <FormField control={form.control} name="depositFeeRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <ArrowDownToLine className="w-3.5 h-3.5" />Deposit Fee %
                    </FormLabel>
                    <FormControl>
                      <Input type="number" step="0.0001" placeholder="e.g. 1.5" {...field}
                        className="border-emerald-300 focus-visible:ring-emerald-400" data-testid="input-deposit-fee-rate" />
                    </FormControl>
                    <FormDescription className="text-xs">Fee charged to customer when they deposit via this channel</FormDescription>
                  </FormItem>
                )} />
                <FormField control={form.control} name="withdrawFeeRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1 text-orange-700 dark:text-orange-400">
                      <ArrowUpFromLine className="w-3.5 h-3.5" />Withdraw Fee %
                    </FormLabel>
                    <FormControl>
                      <Input type="number" step="0.0001" placeholder="e.g. 0.5" {...field}
                        className="border-orange-300 focus-visible:ring-orange-400" data-testid="input-withdraw-fee-rate" />
                    </FormControl>
                    <FormDescription className="text-xs">Fee charged to customer when they withdraw via this channel</FormDescription>
                  </FormItem>
                )} />
              </div>
            </div>

            <Separator />

            {/* ── Expense Rates (what the channel costs us) ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-red-500" />Expense Rates
                <span className="font-normal normal-case text-muted-foreground ml-1">— what the channel costs Coin Cash (%)</span>
              </p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <FormField control={form.control} name="depositExpenseRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground">Deposit Expense %</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.0001" placeholder="e.g. 0.1" {...field}
                        className="border-red-200 focus-visible:ring-red-300" />
                    </FormControl>
                    <FormDescription className="text-xs">Gas / network / bank fee cost to us per deposit</FormDescription>
                  </FormItem>
                )} />
                <FormField control={form.control} name="withdrawExpenseRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground">Withdraw Expense %</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.0001" placeholder="e.g. 0.2" {...field}
                        className="border-red-200 focus-visible:ring-red-300" />
                    </FormControl>
                    <FormDescription className="text-xs">Gas / network / bank fee cost to us per withdrawal</FormDescription>
                  </FormItem>
                )} />
              </div>
              <div className="mt-2 p-2.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                Net revenue per operation = Fee Rate charged − Expense Rate cost. Example: 1.5% fee − 0.1% expense = 1.4% net margin.
              </div>
            </div>

            <Separator />

            {/* ── Transaction Limits ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-blue-500" />Transaction Limits (USD)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="minDepositUsd" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Deposit $</FormLabel>
                    <FormControl><Input type="number" step="any" placeholder="e.g. 10" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="maxDepositUsd" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Deposit $</FormLabel>
                    <FormControl><Input type="number" step="any" placeholder="e.g. 50000" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="minWithdrawUsd" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Withdrawal $</FormLabel>
                    <FormControl><Input type="number" step="any" placeholder="e.g. 10" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="maxWithdrawUsd" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Withdrawal $</FormLabel>
                    <FormControl><Input type="number" step="any" placeholder="e.g. 10000" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            <Separator />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes / Description</FormLabel>
                <FormControl><Textarea placeholder="Optional notes about this channel…" rows={2} {...field} /></FormControl>
              </FormItem>
            )} />

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-provider">
                {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Provider"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProvidersPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Provider | undefined>();

  const { data: providerList = [], isLoading } = useQuery<Provider[]>({
    queryKey: ["/api/accounting/providers"],
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/accounting/providers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/providers"] });
      toast({ title: "Provider deleted" });
    },
    onError: (e: any) => toast({ title: "Cannot delete", description: e.message, variant: "destructive" }),
  });

  const filtered = providerList.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s) || p.fieldName.toLowerCase().includes(s);
  });

  const addressCount = providerList.filter(p => p.fieldType === "address").length;
  const idCount = providerList.filter(p => p.fieldType === "ID").length;
  const feeConfigured = providerList.filter(p => (p as any).depositFeeRate || (p as any).withdrawFeeRate).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/95">
        <div>
          <h1 className="text-xl font-bold">Providers</h1>
          <p className="text-sm text-muted-foreground">
            Payment channels — defines the customer field type, fee rates charged, expenses incurred, and transaction limits
          </p>
        </div>
        <Button onClick={() => { setEditTarget(undefined); setFormOpen(true); }} data-testid="button-new-provider">
          <Plus className="w-4 h-4 mr-2" />New Provider
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 px-6 pt-4 pb-2">
        <div className="rounded-lg border border-border p-3 bg-muted/30">
          <div className="text-2xl font-bold text-foreground">{providerList.length}</div>
          <div className="text-xs text-muted-foreground font-medium mt-0.5">Total Channels</div>
        </div>
        <div className="rounded-lg border border-border p-3 bg-purple-50 dark:bg-purple-900/20">
          <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{addressCount}</div>
          <div className="text-xs text-purple-600 dark:text-purple-400 font-medium mt-0.5"><MapPin className="inline w-3 h-3 mr-1" />Address Type</div>
        </div>
        <div className="rounded-lg border border-border p-3 bg-blue-50 dark:bg-blue-900/20">
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{idCount}</div>
          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5"><Hash className="inline w-3 h-3 mr-1" />ID Type</div>
        </div>
        <div className="rounded-lg border border-border p-3 bg-emerald-50 dark:bg-emerald-900/20">
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{feeConfigured}</div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5"><Percent className="inline w-3 h-3 mr-1" />With Fees Set</div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 px-6 py-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by code, name, or field label…" className="pl-9 h-9"
            value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-providers" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} providers</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {search ? "No providers match your search" : "No providers defined yet — click New Provider to add one"}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold"><Tag className="inline w-3.5 h-3.5 mr-1 opacity-70" />Code</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Channel / Currency</th>
                  <th className="text-left px-4 py-2.5 font-semibold w-28">Field Type</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Customer Field Label</th>
                  <th className="text-left px-4 py-2.5 font-semibold">
                    <ArrowDownToLine className="inline w-3.5 h-3.5 mr-1 text-emerald-600" />Dep. Fee
                  </th>
                  <th className="text-left px-4 py-2.5 font-semibold">
                    <ArrowUpFromLine className="inline w-3.5 h-3.5 mr-1 text-orange-500" />With. Fee
                  </th>
                  <th className="text-left px-4 py-2.5 font-semibold w-24">Status</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(p => {
                  const depFee  = fmtRate((p as any).depositFeeRate);
                  const witFee  = fmtRate((p as any).withdrawFeeRate);
                  const depExp  = fmtRate((p as any).depositExpenseRate);
                  const witExp  = fmtRate((p as any).withdrawExpenseRate);
                  const currency = (p as any).currency;
                  return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-provider-${p.id}`}>
                      <td className="px-4 py-3"><CodeBadge code={p.code} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{p.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {currency && (
                                <span className="text-xs font-mono bg-muted px-1 rounded text-muted-foreground">{currency}</span>
                              )}
                              {depExp && <span className="text-xs text-red-500">exp dep: {depExp}</span>}
                              {witExp && <span className="text-xs text-red-500">exp wit: {witExp}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.fieldType === "address" ? (
                          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                            <MapPin className="w-3 h-3 mr-1" />Address
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            <Hash className="w-3 h-3 mr-1" />ID
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{p.fieldName}</td>
                      <td className="px-4 py-3">
                        {depFee
                          ? <span className="font-semibold text-emerald-700 dark:text-emerald-400">{depFee}</span>
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {witFee
                          ? <span className="font-semibold text-orange-600 dark:text-orange-400">{witFee}</span>
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {p.isActive
                          ? <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Active</Badge>
                          : <Badge variant="secondary">Inactive</Badge>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => { setEditTarget(p); setFormOpen(true); }}
                            data-testid={`button-edit-provider-${p.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => { if (confirm(`Delete provider "${p.name}"?`)) deleteMut.mutate(p.id); }}
                            data-testid={`button-delete-provider-${p.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <ProviderFormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditTarget(undefined); }}
          initial={editTarget}
        />
      )}
    </div>
  );
}
