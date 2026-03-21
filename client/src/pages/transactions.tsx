import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, ArrowRightLeft, TrendingDown, TrendingUp, DollarSign,
  Filter, Info, User, Banknote, Bitcoin, CheckCircle2, XCircle,
  ChevronRight, ArrowRight, AlertTriangle, Lock, Loader2,
  Eye, ShieldCheck, FileText, Hash, Building2, Wallet,
  Zap, Trash2, BookOpen, Scale, RefreshCw
} from "lucide-react";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  customerId: string;
  fullName: string;
  phonePrimary: string;
  loyaltyGroup?: string;
}

interface FinancialRecord {
  id: string;
  recordNumber: string;
  type: "cash" | "crypto";
  direction: "inflow" | "outflow";
  processingStage: string;
  amount: string;
  currency: string;
  usdEquivalent?: string;
  exchangeRate?: string;
  accountName?: string;
  assetOrProviderName?: string;
  networkOrId?: string;
  clientName?: string;
  clientSenderName?: string;
  clientRecipientName?: string;
  txidOrReferenceNumber?: string;
  customerId?: string;
  createdAt: string;
}

interface Transaction {
  id: string;
  transactionNumber: string;
  type: "deposit" | "withdraw" | "transfer";
  customerId?: string;
  relatedRecordIds: string[];
  totalInUsd: string;
  totalOutUsd: string;
  serviceFeeRate: string;
  serviceFeeAmount: string;
  serviceExpenseRate: string;
  serviceExpenseAmount: string;
  spreadAmount: string;
  netDifference: string;
  netDifferenceType?: string;
  notes?: string;
  createdAt: string;
}

interface TxEntry {
  id: string;
  transactionId: string;
  entryType: "fee" | "spread_profit" | "network_expense" | "receivable" | "payable" | "commission" | "penalty" | "reversal";
  description: string;
  amount: string;
  currency: string;
  usdEquivalent?: string;
  direction: "debit" | "credit";
  accountName?: string;
  customerId?: string;
  createdAt: string;
}

const entryTypeConfig: { [k: string]: { label: string; color: string; bg: string; dir: "debit" | "credit" } } = {
  fee:             { label: "Service Fee",      color: "text-orange-700 dark:text-orange-300",  bg: "bg-orange-100 dark:bg-orange-900/30",   dir: "credit" },
  spread_profit:   { label: "Spread Profit",    color: "text-emerald-700 dark:text-emerald-300",bg: "bg-emerald-100 dark:bg-emerald-900/30", dir: "credit" },
  network_expense: { label: "Network Expense",  color: "text-red-700 dark:text-red-300",        bg: "bg-red-100 dark:bg-red-900/30",         dir: "debit"  },
  receivable:      { label: "Receivable",       color: "text-amber-700 dark:text-amber-300",    bg: "bg-amber-100 dark:bg-amber-900/30",     dir: "debit"  },
  payable:         { label: "Payable",          color: "text-purple-700 dark:text-purple-300",  bg: "bg-purple-100 dark:bg-purple-900/30",   dir: "credit" },
  commission:      { label: "Commission",       color: "text-blue-700 dark:text-blue-300",      bg: "bg-blue-100 dark:bg-blue-900/30",       dir: "debit"  },
  penalty:         { label: "Penalty",          color: "text-rose-700 dark:text-rose-300",      bg: "bg-rose-100 dark:bg-rose-900/30",       dir: "credit" },
  reversal:        { label: "Reversal",         color: "text-gray-600 dark:text-gray-400",      bg: "bg-gray-100 dark:bg-gray-900/30",       dir: "debit"  },
};

const entryFormSchema = z.object({
  entryType: z.enum(["fee","spread_profit","network_expense","receivable","payable","commission","penalty","reversal"]),
  description: z.string().min(2, "Required"),
  amount: z.string().min(1, "Required"),
  currency: z.string().default("USD"),
  direction: z.enum(["debit","credit"]),
  accountName: z.string().optional(),
});
type EntryForm = z.infer<typeof entryFormSchema>;

// ─── Config ───────────────────────────────────────────────────────────────────

const txTypeConfig: Record<string, { label: string; icon: typeof ArrowRightLeft; color: string; bg: string }> = {
  deposit: { label: "Deposit", icon: TrendingUp, color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  withdraw: { label: "Withdrawal", icon: TrendingDown, color: "text-red-700 dark:text-red-300", bg: "bg-red-100 dark:bg-red-900/30" },
  transfer: { label: "Transfer", icon: ArrowRightLeft, color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-900/30" },
};

const netDiffConfig: Record<string, { label: string; color: string; description: string }> = {
  premium_fee:         { label: "Premium Fee",         color: "text-emerald-600", description: "→ Revenue account (we earned extra)" },
  customer_credit:     { label: "Customer Credit",     color: "text-blue-600",    description: "→ Customer balance (we owe them)" },
  premium_discount:    { label: "Premium Discount",    color: "text-amber-600",   description: "→ Expense account (we gave discount)" },
  customer_receivable: { label: "Customer Receivable", color: "text-red-600",     description: "→ Customer debt (they owe us)" },
};

// Record type helper
function recordLabel(r: FinancialRecord) {
  if (r.type === "cash" && r.direction === "inflow")  return "Cash Inflow";
  if (r.type === "cash" && r.direction === "outflow") return "Cash Outflow";
  if (r.type === "crypto" && r.direction === "inflow")  return "Crypto Inflow";
  if (r.type === "crypto" && r.direction === "outflow") return "Crypto Outflow";
  return "Record";
}

function recordColor(r: FinancialRecord) {
  if (r.type === "cash" && r.direction === "inflow")   return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (r.type === "cash" && r.direction === "outflow")  return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
  if (r.type === "crypto" && r.direction === "inflow") return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
  return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
}

// For a given transaction type, which record directions are expected?
const TX_RECORD_HINTS: Record<string, { inflow: string[]; outflow: string[] }> = {
  deposit:  { inflow: ["cash"],   outflow: ["crypto"] },
  withdraw: { inflow: ["crypto"], outflow: ["cash"]   },
  transfer: { inflow: ["cash","crypto"], outflow: ["cash","crypto"] },
};

// ─── Transaction Detail Dialog ────────────────────────────────────────────────

function TransactionDetailDialog({
  tx,
  customerMap,
  onClose,
}: {
  tx: Transaction;
  customerMap: Record<string, Customer>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showEntryForm, setShowEntryForm] = useState(false);

  const { data: linkedRecords, isLoading: loadingRecords } = useQuery<FinancialRecord[]>({
    queryKey: ["/api/records", tx.id],
    queryFn: async () => {
      const res = await fetch(`/api/records?transactionId=${tx.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: entries = [], isLoading: loadingEntries } = useQuery<TxEntry[]>({
    queryKey: [`/api/transactions/${tx.id}/entries`],
  });

  const entryForm = useForm<EntryForm>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: { entryType: "fee", description: "", amount: "", currency: "USD", direction: "credit", accountName: "" },
  });

  const addEntryMut = useMutation({
    mutationFn: (data: EntryForm) => apiRequest("POST", `/api/transactions/${tx.id}/entries`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/transactions/${tx.id}/entries`] });
      toast({ title: "Entry added" });
      setShowEntryForm(false);
      entryForm.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteEntryMut = useMutation({
    mutationFn: (entryId: string) => apiRequest("DELETE", `/api/transactions/${tx.id}/entries/${entryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/transactions/${tx.id}/entries`] });
      toast({ title: "Entry removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const extractFeesMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/transactions/${tx.id}/extract-fees`, {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/transactions/${tx.id}/entries`] });
      toast({ title: `${data.created} fee entries auto-extracted` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/transactions/${tx.id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/transactions/${tx.id}/entries`] });
      toast({ title: "Transaction approved — fee entries auto-created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Balance equation: compute credits vs debits from entries
  const totalCredits = entries.reduce((s, e) => s + (e.direction === "credit" ? parseFloat(e.usdEquivalent ?? e.amount ?? "0") : 0), 0);
  const totalDebits  = entries.reduce((s, e) => s + (e.direction === "debit"  ? parseFloat(e.usdEquivalent ?? e.amount ?? "0") : 0), 0);
  const isBalanced   = entries.length === 0 || Math.abs(totalCredits - totalDebits) < 0.01;

  const typeCfg = txTypeConfig[tx.type];
  const TxIcon = typeCfg?.icon ?? ArrowRightLeft;
  const netDiff = parseFloat(tx.netDifference || "0");
  const netDiffCfg = tx.netDifferenceType ? netDiffConfig[tx.netDifferenceType] : null;
  const customer = tx.customerId ? customerMap[tx.customerId] : null;
  const isApproved = !!(tx as any).approvedAt;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye className="w-4 h-4 text-primary" />
            Transaction — {tx.transactionNumber}
          </DialogTitle>
          <DialogDescription className="sr-only">Transaction detail</DialogDescription>
        </DialogHeader>

        {/* Header badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`${typeCfg?.bg ?? ""} ${typeCfg?.color ?? ""}`}>{typeCfg?.label}</Badge>
          {isApproved
            ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><ShieldCheck className="w-3 h-3 mr-1" />Approved</Badge>
            : <Badge variant="outline" className="text-muted-foreground">Pending Approval</Badge>}
          {customer && <Badge variant="secondary">{customer.fullName}</Badge>}
        </div>

        {/* P&L Summary grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {[
            { label: "Total Inflow",    value: `$${parseFloat(tx.totalInUsd||"0").toFixed(2)}`,        color: "text-emerald-600" },
            { label: "Total Outflow",   value: `$${parseFloat(tx.totalOutUsd||"0").toFixed(2)}`,       color: "text-red-500" },
            { label: `Fee (${tx.serviceFeeRate}%)`, value: `$${parseFloat(tx.serviceFeeAmount||"0").toFixed(2)}`, color: "text-blue-600" },
            { label: "Net Result",      value: `${netDiff >= 0 ? "+" : ""}$${Math.abs(netDiff).toFixed(2)}`, color: netDiff >= 0 ? "text-emerald-600" : "text-red-500" },
          ].map(card => (
            <div key={card.label} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
              <p className={`font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Net difference classification */}
        {netDiffCfg && (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 flex items-center gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Net Difference Classified As</p>
              <p className={`font-semibold text-sm ${netDiffCfg.color}`}>{netDiffCfg.label}</p>
            </div>
            <p className="text-xs text-muted-foreground ml-2">{netDiffCfg.description}</p>
          </div>
        )}

        {/* Expense rate */}
        {parseFloat(tx.serviceExpenseRate || "0") > 0 && (
          <div className="text-xs text-muted-foreground">
            Expense Rate: {tx.serviceExpenseRate}% (${parseFloat(tx.serviceExpenseAmount || "0").toFixed(2)}) ·
            Spread: ${parseFloat(tx.spreadAmount || "0").toFixed(2)}
          </div>
        )}

        {/* Notes */}
        {tx.notes && (
          <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
            <p>{tx.notes}</p>
          </div>
        )}

        {/* Linked Records */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Linked Records ({tx.relatedRecordIds?.length ?? 0})
          </p>
          {loadingRecords ? (
            <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !linkedRecords?.length ? (
            <p className="text-sm text-muted-foreground">No linked records found</p>
          ) : (
            <div className="space-y-2">
              {linkedRecords.map(r => (
                <div key={r.id} className={`flex items-center gap-3 p-3 rounded-lg border border-border/50 text-sm ${r.direction === "inflow" ? "bg-emerald-50/50 dark:bg-emerald-900/10" : "bg-red-50/50 dark:bg-red-900/10"}`}>
                  <Badge className={`text-xs shrink-0 ${recordColor(r)}`}>{recordLabel(r)}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{r.recordNumber}</p>
                    <p className="font-semibold text-foreground">{parseFloat(r.amount).toLocaleString()} {r.currency}
                      {r.usdEquivalent && <span className="text-muted-foreground font-normal"> ≈ ${parseFloat(r.usdEquivalent).toFixed(2)}</span>}
                    </p>
                  </div>
                  {(r.accountName || r.assetOrProviderName) && (
                    <p className="text-xs text-muted-foreground">{r.accountName ?? r.assetOrProviderName}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Transaction Entries (Financial Distribution Lines) ──────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Transaction Entries ({entries.length})
            </p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                onClick={() => extractFeesMut.mutate()}
                disabled={extractFeesMut.isPending}
                title="Auto-extract fee, spread, expense entries from transaction financials"
                data-testid="button-extract-fees">
                <Zap className="w-3 h-3" />
                {extractFeesMut.isPending ? "Extracting…" : "Auto-Extract"}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                onClick={() => setShowEntryForm(v => !v)}
                data-testid="button-add-entry">
                <Plus className="w-3 h-3" />Add
              </Button>
            </div>
          </div>

          {/* Balance equation indicator */}
          {entries.length > 0 && (
            <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${isBalanced ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300" : "border-red-200 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300"}`}>
              <Scale className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono">
                CR ${totalCredits.toFixed(2)} {isBalanced ? "=" : "≠"} DR ${totalDebits.toFixed(2)}
              </span>
              <span className="ml-auto font-semibold">{isBalanced ? "BALANCED ✓" : `OFF BY $${Math.abs(totalCredits - totalDebits).toFixed(2)} ⚠`}</span>
            </div>
          )}

          {/* Inline add entry form */}
          {showEntryForm && (
            <div className="border border-border rounded-lg p-3 bg-muted/20 space-y-3">
              <Form {...entryForm}>
                <form onSubmit={entryForm.handleSubmit(d => addEntryMut.mutate(d))} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <FormField control={entryForm.control} name="entryType" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Type</FormLabel>
                        <Select onValueChange={(v) => { field.onChange(v); entryForm.setValue("direction", entryTypeConfig[v]?.dir ?? "debit"); }} value={field.value}>
                          <FormControl><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {Object.entries(entryTypeConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={entryForm.control} name="direction" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Direction</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="credit">Credit (CR)</SelectItem>
                            <SelectItem value="debit">Debit (DR)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={entryForm.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Description</FormLabel>
                      <FormControl><Input className="h-8 text-xs" placeholder="e.g. Service fee for TX-2026-000001" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <FormField control={entryForm.control} name="amount" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Amount</FormLabel>
                          <FormControl><Input className="h-8 text-xs font-mono" type="number" step="0.0001" placeholder="0.00" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={entryForm.control} name="currency" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Currency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {["USD","USDT","YER","SAR","AED"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={entryForm.control} name="accountName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Account Name (optional)</FormLabel>
                      <FormControl><Input className="h-8 text-xs" placeholder="e.g. Service Fee Income" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowEntryForm(false)}>Cancel</Button>
                    <Button type="submit" size="sm" disabled={addEntryMut.isPending}>
                      {addEntryMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add Entry"}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}

          {/* Entries list */}
          {loadingEntries ? (
            <Skeleton className="h-14 w-full" />
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
              No entries yet — approve the transaction or click Auto-Extract to generate fee entries automatically
            </p>
          ) : (
            <div className="space-y-1.5">
              {entries.map(e => {
                const cfg = entryTypeConfig[e.entryType];
                return (
                  <div key={e.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card">
                    <Badge className={`text-xs shrink-0 ${cfg?.bg ?? ""} ${cfg?.color ?? ""}`}>{cfg?.label ?? e.entryType}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{e.description}</p>
                      {e.accountName && <p className="text-xs text-muted-foreground">{e.accountName}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono font-semibold">
                        <span className={e.direction === "credit" ? "text-emerald-600" : "text-red-500"}>{e.direction === "credit" ? "CR" : "DR"}</span>
                        {" "}{parseFloat(e.amount).toFixed(2)} {e.currency}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteEntryMut.mutate(e.id)}
                      disabled={deleteEntryMut.isPending}
                      data-testid={`button-delete-entry-${e.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Approval info */}
        {isApproved && (
          <div className="text-xs text-muted-foreground">
            Approved on {format(new Date((tx as any).approvedAt), "PPp")}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Created {format(new Date(tx.createdAt), "PPpp")}
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!isApproved && (
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              data-testid="button-approve-transaction"
            >
              {approveMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approving...</> : <><ShieldCheck className="w-4 h-4 mr-2" />Approve Transaction</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Contra Party Badge ───────────────────────────────────────────────────────
function ContraPartyBadge({ customer, contra2101 }: { customer?: Customer; contra2101?: any }) {
  if (customer) {
    return (
      <div className="flex items-center gap-2 h-8 px-2.5 rounded-md border border-dashed border-emerald-400/60 bg-emerald-50/50 dark:bg-emerald-900/10 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground truncate">{customer.fullName}</span>
        <span className="text-muted-foreground/60">·</span>
        <span className="font-mono text-primary/70 text-[10px]">{customer.customerId}</span>
        <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded px-1 py-0.5">customer</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 h-8 px-2.5 rounded-md border border-dashed border-amber-400/60 bg-amber-50/50 dark:bg-amber-900/10 text-xs text-muted-foreground">
      <span className="font-mono text-primary/70">2101</span>
      <span>{contra2101?.name ?? "Customer Credit Balances"}</span>
      <span className="ml-auto text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded px-1 py-0.5">unmatched pool</span>
    </div>
  );
}

// ─── Transaction Form (multi-step) ────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

interface TxFormState {
  type: "deposit" | "withdraw" | "transfer";
  customerId: string;
  selectedRecordIds: string[];
  serviceFeeRate: string;
  serviceExpenseRate: string;
  netDifferenceType: string;
  notes: string;
}

function TransactionFormPage({ onCancel }: { onCancel: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [quickCreate, setQuickCreate] = useState<"inflow" | "outflow" | null>(null);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickCurrency, setQuickCurrency] = useState("USD");
  const [quickAccountOrNetwork, setQuickAccountOrNetwork] = useState("");
  const [quickExchangeRate, setQuickExchangeRate] = useState("");
  const [quickCoaAccountId, setQuickCoaAccountId] = useState("");

  const [form, setForm] = useState<TxFormState>({
    type: "deposit",
    customerId: "",
    selectedRecordIds: [],
    serviceFeeRate: "4",
    serviceExpenseRate: "0",
    netDifferenceType: "premium_fee",
    notes: "",
  });

  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: coaAccounts } = useQuery<any[]>({ queryKey: ["/api/accounting/accounts"] });
  const { data: providers } = useQuery<any[]>({ queryKey: ["/api/accounting/providers"] });

  const KNOWN_CRYPTO_QC = new Set(["USDT", "BTC", "ETH", "BNB", "TRX", "MATIC", "TON", "SOL"]);
  const qcAssetAccounts = useMemo(() => {
    if (!coaAccounts) return [];
    return coaAccounts.filter((a: any) => a.type === "asset");
  }, [coaAccounts]);
  // Contra account is always 2101 Customer Credit Balances — auto-assigned
  const contra2101 = useMemo(() =>
    coaAccounts?.find((a: any) => a.code === "2101"),
    [coaAccounts]
  );
  const qcSelectedAcct = useMemo(() =>
    qcAssetAccounts.find((a: any) => String(a.id) === quickCoaAccountId),
    [qcAssetAccounts, quickCoaAccountId]
  );

  // Fetch available (not-used) records
  const { data: availableRecords, isLoading: recordsLoading } = useQuery<FinancialRecord[]>({
    queryKey: ["/api/records", "available"],
    queryFn: async () => {
      const res = await fetch("/api/records?available=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: step >= 2,
  });

  const hints = TX_RECORD_HINTS[form.type];

  // Records matched to selected customer
  const clientMatchedRecords = useMemo(() =>
    form.customerId
      ? (availableRecords ?? []).filter(r => r.customerId === form.customerId)
      : (availableRecords ?? []),
    [availableRecords, form.customerId]);

  // Records with no customer assigned (can be linked)
  const unmatchedRecords = useMemo(() =>
    (availableRecords ?? []).filter(r => !r.customerId),
    [availableRecords]);

  const clientInflowRecords = useMemo(() =>
    clientMatchedRecords.filter(r => r.direction === "inflow" && hints.inflow.includes(r.type)),
    [clientMatchedRecords, form.type, hints]);

  const clientOutflowRecords = useMemo(() =>
    clientMatchedRecords.filter(r => r.direction === "outflow" && hints.outflow.includes(r.type)),
    [clientMatchedRecords, form.type, hints]);

  const unmatchedInflowRecords = useMemo(() =>
    unmatchedRecords.filter(r => r.direction === "inflow" && hints.inflow.includes(r.type)),
    [unmatchedRecords, form.type, hints]);

  const unmatchedOutflowRecords = useMemo(() =>
    unmatchedRecords.filter(r => r.direction === "outflow" && hints.outflow.includes(r.type)),
    [unmatchedRecords, form.type, hints]);

  const selectedRecords = useMemo(() =>
    (availableRecords ?? []).filter(r => form.selectedRecordIds.includes(r.id)),
    [availableRecords, form.selectedRecordIds]);

  // Detect providers from selected crypto records → suggest expense rate
  const detectedProviderSuggestion = useMemo(() => {
    if (!providers || selectedRecords.length === 0) return null;
    const cryptoRecords = selectedRecords.filter(r => r.type === "crypto");
    if (cryptoRecords.length === 0) return null;
    // Find providers by matching assetOrProviderName or accountName
    const names = cryptoRecords
      .map(r => r.assetOrProviderName ?? r.accountName ?? "")
      .filter(Boolean);
    const matched = providers.find(p =>
      names.some(n => n.toLowerCase().includes(p.name.toLowerCase().split(" ")[0]) ||
        p.name.toLowerCase().includes(n.toLowerCase().split(" ")[0]))
    );
    if (!matched) return null;
    // Prefer withdraw expense rate for outflow (withdraw tx), else deposit
    const rate = form.type === "withdraw"
      ? (matched.depositExpenseRate ?? matched.depositFeeRate ?? null)
      : (matched.withdrawExpenseRate ?? matched.withdrawFeeRate ?? null);
    return { name: matched.name, rate: rate ? String(rate) : null };
  }, [providers, selectedRecords, form.type]);

  const totalInUsd = useMemo(() =>
    selectedRecords
      .filter(r => r.direction === "inflow")
      .reduce((sum, r) => sum + parseFloat(r.usdEquivalent || r.amount || "0"), 0),
    [selectedRecords]);

  const totalOutUsd = useMemo(() =>
    selectedRecords
      .filter(r => r.direction === "outflow")
      .reduce((sum, r) => sum + parseFloat(r.usdEquivalent || r.amount || "0"), 0),
    [selectedRecords]);

  // Fee base = CRYPTO side:
  //   Deposit  → fee on crypto OUT (USDT we send to client)
  //   Withdraw → fee on crypto IN  (USDT client sends us)
  //   Transfer → fee on total IN
  const cryptoOutUsd = useMemo(() =>
    selectedRecords
      .filter(r => r.direction === "outflow" && r.type === "crypto")
      .reduce((s, r) => s + parseFloat(r.usdEquivalent || r.amount || "0"), 0),
    [selectedRecords]);

  const cryptoInUsd = useMemo(() =>
    selectedRecords
      .filter(r => r.direction === "inflow" && r.type === "crypto")
      .reduce((s, r) => s + parseFloat(r.usdEquivalent || r.amount || "0"), 0),
    [selectedRecords]);

  const feeRate = parseFloat(form.serviceFeeRate || "0");
  const expRate = parseFloat(form.serviceExpenseRate || "0");

  const feeBase =
    form.type === "deposit"  ? cryptoOutUsd :
    form.type === "withdraw" ? cryptoInUsd  :
    totalInUsd;

  const feeAmount   = (feeBase * feeRate) / 100;
  const expAmount   = (feeBase * expRate) / 100;
  const spreadAmount  = totalInUsd - totalOutUsd;
  // Net diff = spread that's left after the expected fee is accounted for
  const netDifference = spreadAmount - feeAmount - expAmount;

  const toggleRecord = (id: string) => {
    setForm(f => ({
      ...f,
      selectedRecordIds: f.selectedRecordIds.includes(id)
        ? f.selectedRecordIds.filter(x => x !== id)
        : [...f.selectedRecordIds, id],
    }));
  };

  const matchToClientMut = useMutation({
    mutationFn: (recordId: string) =>
      apiRequest("PATCH", `/api/records/${recordId}`, { customerId: form.customerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/records", "available"] });
      toast({ title: "Record linked to client" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createRecordMut = useMutation({
    mutationFn: (payload: object) => apiRequest("POST", "/api/records", payload),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/records", "available"] });
      const newId = data?.record?.id ?? data?.id;
      if (newId) setForm(f => ({ ...f, selectedRecordIds: [...f.selectedRecordIds, newId] }));
      setQuickCreate(null);
      setQuickAmount(""); setQuickCurrency("USD"); setQuickAccountOrNetwork(""); setQuickExchangeRate("");
      toast({ title: "Record created and selected" });
    },
    onError: (e: any) => toast({ title: "Error creating record", description: e.message, variant: "destructive" }),
  });

  function handleQuickCreate(direction: "inflow" | "outflow") {
    const recordType: "cash" | "crypto" =
      direction === "inflow"
        ? (hints.inflow.includes("crypto") ? "crypto" : "cash")
        : (hints.outflow.includes("crypto") ? "crypto" : "cash");

    const selectedAcct = qcAssetAccounts.find((a: any) => String(a.id) === quickCoaAccountId);
    const currency     = selectedAcct?.currency ?? quickCurrency;
    const appliedRate  = parseFloat(quickExchangeRate);
    const usdEq = appliedRate > 0 && currency !== "USD"
      ? (parseFloat(quickAmount) / appliedRate).toFixed(4)
      : currency === "USD" ? quickAmount : undefined;

    // Contra is always 2101 Customer Credit Balances — auto-assigned
    createRecordMut.mutate({
      type: recordType,
      direction,
      amount: quickAmount,
      currency,
      customerId: form.customerId || undefined,
      ...(quickCoaAccountId ? { accountId: quickCoaAccountId, accountName: selectedAcct?.name } : {}),
      contraAccountId:   contra2101 ? String(contra2101.id) : undefined,
      contraAccountName: contra2101?.name ?? "Customer Credit Balances",
      ...(quickAccountOrNetwork ? { networkOrId: quickAccountOrNetwork } : {}),
      ...(quickExchangeRate ? { exchangeRate: quickExchangeRate } : {}),
      ...(usdEq ? { usdEquivalent: usdEq } : {}),
    });
  }

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/transactions", {
      type: form.type,
      customerId: form.customerId || null,
      relatedRecordIds: form.selectedRecordIds,
      totalInUsd: totalInUsd.toFixed(4),
      totalOutUsd: totalOutUsd.toFixed(4),
      serviceFeeRate: feeRate.toFixed(4),
      serviceFeeAmount: feeAmount.toFixed(4),
      serviceExpenseRate: expRate.toFixed(4),
      serviceExpenseAmount: expAmount.toFixed(4),
      spreadAmount: spreadAmount.toFixed(4),
      netDifference: netDifference.toFixed(4),
      netDifferenceType: form.netDifferenceType || null,
      notes: form.notes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Transaction created", description: `${form.selectedRecordIds.length} records linked and marked as used` });
      handleClose();
    },
    onError: (e: any) => toast({ title: "Error creating transaction", description: e.message, variant: "destructive" }),
  });

  function handleClose() {
    setStep(1);
    setShowUnmatched(false);
    resetQuickCreate();
    setForm({ type: "deposit", customerId: "", selectedRecordIds: [], serviceFeeRate: "4", serviceExpenseRate: "0", netDifferenceType: "premium_fee", notes: "" });
    onCancel();
  }

  const selectedCustomer = customers?.find(c => c.id === form.customerId);

  // ─── Step 2 render helpers (no hooks — safe to define in component body) ───

  function renderRecordRow(r: FinancialRecord, unmatched?: boolean) {
    const checked = form.selectedRecordIds.includes(r.id);
    return (
      <div key={r.id} className={`rounded-lg border transition-colors ${checked ? "bg-primary/5 border-primary" : "border-border"} ${unmatched ? "opacity-80" : ""}`}>
        <label className="flex items-start gap-2.5 p-2.5 cursor-pointer">
          {!unmatched && (
            <Checkbox checked={checked} onCheckedChange={() => toggleRecord(r.id)}
              data-testid={`checkbox-record-${r.id}`} className="mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">{r.recordNumber}</span>
              <Badge className={`text-xs ${recordColor(r)}`}>{recordLabel(r)}</Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
              <span className="font-semibold text-foreground">{parseFloat(r.amount).toLocaleString()} {r.currency}</span>
              {r.usdEquivalent && <span>≈ ${parseFloat(r.usdEquivalent).toLocaleString()}</span>}
              {r.accountName && <span>· {r.accountName}</span>}
              {r.assetOrProviderName && <span>· {r.assetOrProviderName}</span>}
              {r.clientSenderName && <span>· {r.clientSenderName}</span>}
              {r.clientRecipientName && <span>· {r.clientRecipientName}</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(r.createdAt), "MMM d, yyyy")}</div>
          </div>
        </label>
        {unmatched && form.customerId && (
          <div className="px-2.5 pb-2 flex gap-1.5">
            <Button size="sm" variant="outline" className="h-6 text-xs px-2 flex-1"
              onClick={() => matchToClientMut.mutate(r.id)}
              disabled={matchToClientMut.isPending}
              data-testid={`button-link-record-${r.id}`}>
              Link to {selectedCustomer?.fullName ?? "client"}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2"
              onClick={() => toggleRecord(r.id)}
              data-testid={`button-select-unmatched-${r.id}`}>
              {checked ? "Deselect" : "Select"}
            </Button>
          </div>
        )}
        {unmatched && !form.customerId && (
          <div className="px-2.5 pb-2">
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2 w-full"
              onClick={() => toggleRecord(r.id)}
              data-testid={`button-select-unmatched-no-cust-${r.id}`}>
              {checked ? "Deselect" : "Select"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  function resetQuickCreate() {
    setQuickCreate(null);
    setQuickAmount(""); setQuickCurrency("USD"); setQuickAccountOrNetwork("");
    setQuickExchangeRate(""); setQuickCoaAccountId("");
  }

  function renderQuickCreateForm(direction: "inflow" | "outflow") {
    const recType: "cash" | "crypto" =
      direction === "inflow"
        ? (hints.inflow.includes("crypto") ? "crypto" : "cash")
        : (hints.outflow.includes("crypto") ? "crypto" : "cash");

    const KNOWN_CRYPTO = new Set(["USDT","BTC","ETH","BNB","TRX","MATIC","TON","SOL"]);
    const relevantAssets = qcAssetAccounts.filter((a: any) => {
      const isCrypto = KNOWN_CRYPTO.has(a.currency?.toUpperCase() ?? "");
      return recType === "crypto" ? isCrypto : !isCrypto;
    });
    const derivedCurrency = qcSelectedAcct?.currency ?? (recType === "crypto" ? "USDT" : "YER");
    const isInf = direction === "inflow";

    return (
      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2.5 mt-1">
        <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Building2 className="w-3 h-3" />
          New {recType === "crypto" ? "Crypto" : "Cash"} {isInf ? "Inflow" : "Outflow"} Record
        </p>

        {/* Amount */}
        <div className="flex gap-2 items-center">
          <Input type="number" placeholder="Amount *" className="h-8 text-xs flex-1"
            value={quickAmount} onChange={e => setQuickAmount(e.target.value)}
            data-testid="input-quick-amount" />
          <span className="text-xs font-semibold text-muted-foreground min-w-[3rem] text-right">{derivedCurrency}</span>
        </div>

        {/* DR Account */}
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
            <span className={`px-1 py-0.5 rounded text-[9px] ${isInf ? "bg-emerald-200 text-emerald-800" : "bg-orange-200 text-orange-800"}`}>DR</span>
            {isInf ? (recType === "crypto" ? "Our wallet receives" : "Our bank receives") : "Customer payable reduces"}
          </p>
          {isInf ? (
            <Select value={quickCoaAccountId} onValueChange={v => setQuickCoaAccountId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-quick-dr-account">
                <SelectValue placeholder="Select account (optional)…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {relevantAssets.map((a: any) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <ContraPartyBadge customer={customers?.find(c => c.id === form.customerId)} contra2101={contra2101} />
          )}
        </div>

        {/* CR Account */}
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
            <span className={`px-1 py-0.5 rounded text-[9px] ${isInf ? "bg-blue-200 text-blue-800" : "bg-emerald-200 text-emerald-800"}`}>CR</span>
            {isInf ? "Customer payable increases" : (recType === "crypto" ? "Our wallet sends" : "Our bank pays")}
          </p>
          {isInf ? (
            <ContraPartyBadge customer={customers?.find(c => c.id === form.customerId)} contra2101={contra2101} />
          ) : (
            <Select value={quickCoaAccountId} onValueChange={v => setQuickCoaAccountId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-quick-cr-account">
                <SelectValue placeholder="Select account (optional)…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {relevantAssets.map((a: any) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Exchange rate */}
        {derivedCurrency !== "USD" && (
          <Input type="number" placeholder="Exchange rate (1 USD = ? local)"
            className="h-8 text-xs"
            value={quickExchangeRate} onChange={e => setQuickExchangeRate(e.target.value)}
            data-testid="input-quick-rate" />
        )}

        {/* Reference (optional) */}
        <Input
          placeholder={recType === "crypto" ? "TX Hash / reference (optional)" : "Transfer ref / IBAN (optional)"}
          className="h-8 text-xs font-mono"
          value={quickAccountOrNetwork}
          onChange={e => setQuickAccountOrNetwork(e.target.value)}
          data-testid="input-quick-account"
        />

        <div className="flex gap-2">
          <Button size="sm" className="h-8 text-xs flex-1"
            disabled={!quickAmount || createRecordMut.isPending}
            onClick={() => handleQuickCreate(direction)}
            data-testid="button-quick-create-submit">
            {createRecordMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create & Select"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetQuickCreate}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-6 max-w-3xl">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={handleClose} data-testid="button-back-transaction">
          <ArrowLeft className="w-4 h-4 mr-1.5" />Back
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <ArrowRightLeft className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-lg font-bold">New Transaction</h1>
          <span className="text-xs text-muted-foreground ml-auto">Step {step} of 4</span>
        </div>
      </div>

        {/* Step progress */}
        <div className="flex gap-1 mb-2">
          {([1,2,3,4] as Step[]).map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {/* ── Step 1: Type + Customer ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold mb-3 text-foreground">Transaction Type</p>
              <div className="grid grid-cols-3 gap-2">
                {(["deposit", "withdraw", "transfer"] as const).map(t => {
                  const cfg = txTypeConfig[t];
                  const Icon = cfg.icon;
                  return (
                    <button key={t} data-testid={`option-tx-type-${t}`}
                      onClick={() => setForm(f => ({ ...f, type: t, selectedRecordIds: [] }))}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${form.type === t ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center mb-2`}>
                        <Icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <p className="text-sm font-semibold">{cfg.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t === "deposit" ? "Cash In → Crypto Out" : t === "withdraw" ? "Crypto In → Cash Out" : "Any combination"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2 text-foreground">Customer (optional)</p>
              <Select value={form.customerId || "none"} onValueChange={v => setForm(f => ({ ...f, customerId: v === "none" ? "" : v }))}>
                <SelectTrigger data-testid="select-customer">
                  <SelectValue placeholder="Select customer..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No specific customer —</SelectItem>
                  {customers?.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName} · {c.phonePrimary} <span className="text-muted-foreground text-xs ml-1">({c.customerId})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCustomer && (
                <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/50">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                    {selectedCustomer.fullName[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{selectedCustomer.fullName}</p>
                    <p className="text-xs text-muted-foreground">{selectedCustomer.phonePrimary} · {selectedCustomer.loyaltyGroup}</p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => setStep(2)} data-testid="button-next-step-1">
                Next: Select Records <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 2: Record Selection ── */}
        {step === 2 && (
          <div className="space-y-3">
            {/* Context hint */}
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {form.type === "deposit"  && "Deposit: Cash IN (client pays) + Crypto OUT (we send USDT). Fee = % of USDT sent."}
                {form.type === "withdraw" && "Withdrawal: Crypto IN (client sends USDT) + Cash OUT (we pay). Fee = % of USDT received."}
                {form.type === "transfer" && "Select inflow and outflow records to link together."}
                {selectedCustomer && <span className="text-primary ml-1">· Showing records for <strong>{selectedCustomer.fullName}</strong></span>}
              </span>
            </div>

            {recordsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[0,1].map(i => <div key={i} className="space-y-2">{[...Array(3)].map((_, j) => <Skeleton key={j} className="h-16 w-full" />)}</div>)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* ─── INFLOW Column ─── */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Inflow · {hints.inflow.join("/")}
                    </p>
                    {clientInflowRecords.length > 0 && (
                      <Badge className="text-xs ml-auto bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        {clientInflowRecords.filter(r => form.selectedRecordIds.includes(r.id)).length}/{clientInflowRecords.length}
                      </Badge>
                    )}
                  </div>

                  {clientInflowRecords.length === 0 ? (
                    <div className="border border-dashed border-border rounded-lg p-3 text-center text-xs text-muted-foreground">
                      {form.customerId ? `No ${hints.inflow.join("/")} inflow for this client` : `No ${hints.inflow.join("/")} inflow available`}
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {clientInflowRecords.map(r => renderRecordRow(r))}
                    </div>
                  )}

                  {unmatchedInflowRecords.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 w-full text-xs text-muted-foreground border border-dashed border-border"
                      onClick={() => setShowUnmatched(v => !v)}
                      data-testid="button-show-unmatched-inflow">
                      {showUnmatched ? "Hide unmatched" : `+ Show ${unmatchedInflowRecords.length} unmatched`}
                    </Button>
                  )}
                  {showUnmatched && unmatchedInflowRecords.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto border-t border-dashed border-border pt-2">
                      <p className="text-xs text-muted-foreground px-1">No client assigned yet</p>
                      {unmatchedInflowRecords.map(r => renderRecordRow(r, true))}
                    </div>
                  )}

                  {quickCreate === "inflow"
                    ? renderQuickCreateForm("inflow")
                    : (
                      <Button variant="ghost" size="sm" className="h-7 w-full text-xs text-primary/70 hover:text-primary border border-dashed border-primary/20"
                        onClick={() => { setQuickCreate("inflow"); setQuickCurrency(hints.inflow.includes("crypto") ? "USDT" : "USD"); }}
                        data-testid="button-quick-create-inflow">
                        <Plus className="w-3 h-3 mr-1" /> Create new inflow record
                      </Button>
                    )
                  }
                </div>

                {/* ─── OUTFLOW Column ─── */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Outflow · {hints.outflow.join("/")}
                    </p>
                    {clientOutflowRecords.length > 0 && (
                      <Badge className="text-xs ml-auto bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        {clientOutflowRecords.filter(r => form.selectedRecordIds.includes(r.id)).length}/{clientOutflowRecords.length}
                      </Badge>
                    )}
                  </div>

                  {clientOutflowRecords.length === 0 ? (
                    <div className="border border-dashed border-border rounded-lg p-3 text-center text-xs text-muted-foreground">
                      {form.customerId ? `No ${hints.outflow.join("/")} outflow for this client` : `No ${hints.outflow.join("/")} outflow available`}
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {clientOutflowRecords.map(r => renderRecordRow(r))}
                    </div>
                  )}

                  {unmatchedOutflowRecords.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 w-full text-xs text-muted-foreground border border-dashed border-border"
                      onClick={() => setShowUnmatched(v => !v)}
                      data-testid="button-show-unmatched-outflow">
                      {showUnmatched ? "Hide unmatched" : `+ Show ${unmatchedOutflowRecords.length} unmatched`}
                    </Button>
                  )}
                  {showUnmatched && unmatchedOutflowRecords.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto border-t border-dashed border-border pt-2">
                      <p className="text-xs text-muted-foreground px-1">No client assigned yet</p>
                      {unmatchedOutflowRecords.map(r => renderRecordRow(r, true))}
                    </div>
                  )}

                  {quickCreate === "outflow"
                    ? renderQuickCreateForm("outflow")
                    : (
                      <Button variant="ghost" size="sm" className="h-7 w-full text-xs text-primary/70 hover:text-primary border border-dashed border-primary/20"
                        onClick={() => { setQuickCreate("outflow"); setQuickCurrency(hints.outflow.includes("crypto") ? "USDT" : "USD"); }}
                        data-testid="button-quick-create-outflow">
                        <Plus className="w-3 h-3 mr-1" /> Create new outflow record
                      </Button>
                    )
                  }
                </div>
              </div>
            )}

            {form.selectedRecordIds.length > 0 && (
              <div className="rounded-lg bg-muted/40 border border-border/50 p-2.5 text-xs flex items-center gap-3 flex-wrap">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span><strong>{form.selectedRecordIds.length}</strong> records selected</span>
                <span className="text-muted-foreground">
                  IN: <strong className="text-emerald-600">${totalInUsd.toFixed(2)}</strong>
                  {" · "}
                  OUT: <strong className="text-red-500">${totalOutUsd.toFixed(2)}</strong>
                  {feeBase > 0 && (
                    <> · Fee ({feeRate}% of {form.type === "deposit" ? "crypto out" : form.type === "withdraw" ? "crypto in" : "in"}): <strong>${feeAmount.toFixed(2)}</strong></>
                  )}
                </span>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
              <Button onClick={() => setStep(3)} disabled={form.selectedRecordIds.length === 0} data-testid="button-next-step-2">
                Next: Calculate Fees <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 3: Fee Calculation ── */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Totals from records */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-500" />Total Inflow</p>
                <p className="text-xl font-bold text-emerald-600">${totalInUsd.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{selectedRecords.filter(r => r.direction === "inflow").length} record(s) selected</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-500" />Total Outflow</p>
                <p className="text-xl font-bold text-red-500">${totalOutUsd.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{selectedRecords.filter(r => r.direction === "outflow").length} record(s) selected</p>
              </div>
            </div>

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fee & Expense Rates</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Service Fee Rate (%)</Label>
                <p className="text-xs text-muted-foreground">
                  Charged on {form.type === "deposit" ? "crypto out (USDT sent)" : form.type === "withdraw" ? "crypto in (USDT received)" : "inflow amount"}
                </p>
                <Input type="number" step="0.01" min="0" max="100"
                  value={form.serviceFeeRate}
                  onChange={e => setForm(f => ({ ...f, serviceFeeRate: e.target.value }))}
                  data-testid="input-fee-rate"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Service Expense Rate (%)</Label>
                <p className="text-xs text-muted-foreground">Paid to supplier (e.g. USDT vendor)</p>
                <Input type="number" step="0.01" min="0" max="100"
                  value={form.serviceExpenseRate}
                  onChange={e => setForm(f => ({ ...f, serviceExpenseRate: e.target.value }))}
                  data-testid="input-expense-rate"
                />
                {detectedProviderSuggestion && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs" data-testid="panel-provider-fee-suggestion">
                    <Zap className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-muted-foreground">Provider: <span className="font-medium text-foreground">{detectedProviderSuggestion.name}</span></span>
                    {detectedProviderSuggestion.rate ? (
                      <>
                        <span className="text-muted-foreground">· configured rate:</span>
                        <span className="font-mono font-semibold text-primary">{detectedProviderSuggestion.rate}%</span>
                        <button type="button" onClick={() => setForm(f => ({ ...f, serviceExpenseRate: detectedProviderSuggestion.rate! }))} className="ml-1 text-primary hover:underline font-medium" data-testid="button-apply-provider-rate">Apply</button>
                      </>
                    ) : (
                      <span className="text-muted-foreground italic">· no fee rate configured yet</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Live P&L preview */}
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2.5 text-sm">
              <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">P&L Preview</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exchange Spread (In − Out)</span>
                <span className={`font-semibold ${spreadAmount >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {spreadAmount >= 0 ? "+" : ""}${spreadAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Service Fee ({feeRate}% of {form.type === "deposit" ? "crypto out" : form.type === "withdraw" ? "crypto in" : "inflow"} = ${feeBase.toFixed(2)})
                </span>
                <span className="font-semibold text-emerald-600">+${feeAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service Expense ({expRate}% of {form.type === "deposit" ? "crypto out" : form.type === "withdraw" ? "crypto in" : "inflow"})</span>
                <span className="font-semibold text-red-500">-${expAmount.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Net Result</span>
                <span className={netDifference >= 0 ? "text-emerald-600" : "text-red-500"}>
                  {netDifference >= 0 ? "+" : ""}${netDifference.toFixed(2)}
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
              <Button onClick={() => setStep(4)} data-testid="button-next-step-3">
                Next: Classify Result <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 4: Net Difference Classification + Confirm ── */}
        {step === 4 && (
          <div className="space-y-4">
            {/* Final summary */}
            <div className={`rounded-xl border-2 p-4 ${netDifference >= 0 ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"}`}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Transaction Summary</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Inflow</p>
                  <p className="font-bold text-emerald-600">+${totalInUsd.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Outflow</p>
                  <p className="font-bold text-red-500">-${totalOutUsd.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Net Result</p>
                  <p className={`font-bold text-lg ${netDifference >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {netDifference >= 0 ? "+" : ""}${netDifference.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Classify net difference */}
            <div>
              <p className="text-sm font-semibold mb-1">How to classify the net result?</p>
              <p className="text-xs text-muted-foreground mb-3">
                {netDifference >= 0 ? "You earned extra — record it as revenue or add to customer credit" : "You paid extra — record it as expense or charge the customer"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(netDifference >= 0
                  ? ["premium_fee", "customer_credit"]
                  : ["premium_discount", "customer_receivable"]
                ).map(opt => {
                  const cfg = netDiffConfig[opt];
                  return (
                    <button key={opt}
                      onClick={() => setForm(f => ({ ...f, netDifferenceType: opt }))}
                      data-testid={`option-net-diff-${opt}`}
                      className={`p-3 text-left rounded-lg border-2 transition-all ${form.netDifferenceType === opt ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                    >
                      <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{cfg.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any notes about this transaction..."
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

            {/* Warning about locking records */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>{form.selectedRecordIds.length} records</strong> will be marked as <strong>Used</strong> and locked from future transactions once you confirm.
              </span>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(3)}>← Back</Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="flex-1"
                data-testid="button-save-transaction"
              >
                {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Confirm Transaction"}
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Transactions() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [formMode, setFormMode] = useState(false);
  const [viewTx, setViewTx] = useState<Transaction | null>(null);

  const { data: txList, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`/api/transactions?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const customerMap = useMemo(() => {
    const m: Record<string, Customer> = {};
    customers?.forEach(c => { m[c.id] = c; });
    return m;
  }, [customers]);

  const totalIn   = txList?.reduce((s, t) => s + parseFloat(t.totalInUsd   || "0"), 0) ?? 0;
  const totalOut  = txList?.reduce((s, t) => s + parseFloat(t.totalOutUsd  || "0"), 0) ?? 0;
  const totalFees = txList?.reduce((s, t) => s + parseFloat(t.serviceFeeAmount || "0"), 0) ?? 0;
  const totalNet  = txList?.reduce((s, t) => s + parseFloat(t.netDifference  || "0"), 0) ?? 0;

  if (formMode) {
    return <TransactionFormPage onCancel={() => setFormMode(false)} />;
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {txList?.length ?? 0} transactions · Deposits, Withdrawals, Transfers
          </p>
        </div>
        <Button onClick={() => setFormMode(true)} data-testid="button-new-transaction">
          <Plus className="w-4 h-4 mr-2" />New Transaction
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Inflow",       value: `$${totalIn.toLocaleString()}`,  icon: TrendingUp,     color: "bg-emerald-100 dark:bg-emerald-900/30", icolor: "text-emerald-600" },
          { label: "Total Outflow",      value: `$${totalOut.toLocaleString()}`, icon: TrendingDown,   color: "bg-red-100 dark:bg-red-900/30",     icolor: "text-red-500" },
          { label: "Service Fees",       value: `$${totalFees.toLocaleString()}`, icon: DollarSign,    color: "bg-blue-100 dark:bg-blue-900/30",    icolor: "text-blue-600" },
          { label: "Net Result",         value: `${totalNet >= 0 ? "+" : ""}$${Math.abs(totalNet).toLocaleString()}`, icon: ArrowRightLeft, color: totalNet >= 0 ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-red-100 dark:bg-red-900/30", icolor: totalNet >= 0 ? "text-emerald-600" : "text-red-500" },
        ].map(card => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${card.color} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${card.icolor}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="text-lg font-bold text-foreground">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44" data-testid="select-type-filter">
            <Filter className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="deposit">Deposits</SelectItem>
            <SelectItem value="withdraw">Withdrawals</SelectItem>
            <SelectItem value="transfer">Transfers</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}</div>
      ) : !txList?.length ? (
        <Card>
          <div className="flex flex-col items-center py-16">
            <ArrowRightLeft className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No transactions yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Create your first transaction by linking cash and crypto records</p>
            <Button className="mt-4" onClick={() => setFormMode(true)}>
              <Plus className="w-4 h-4 mr-2" />New Transaction
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {txList.map(tx => {
            const typeCfg = txTypeConfig[tx.type] ?? txTypeConfig.deposit;
            const TxIcon = typeCfg.icon;
            const netDiff = parseFloat(tx.netDifference || "0");
            const netDiffCfg = tx.netDifferenceType ? netDiffConfig[tx.netDifferenceType] : null;
            const customer = tx.customerId ? customerMap[tx.customerId] : null;

            return (
              <Card key={tx.id} className="hover-elevate" data-testid={`card-transaction-${tx.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl ${typeCfg.bg} flex items-center justify-center shrink-0`}>
                      <TxIcon className={`w-5 h-5 ${typeCfg.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-mono text-xs text-muted-foreground">{tx.transactionNumber}</p>
                        <Badge className={`text-xs ${typeCfg.bg} ${typeCfg.color}`}>{typeCfg.label}</Badge>
                        {customer && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="w-3 h-3" />{customer.fullName}
                          </span>
                        )}
                        {tx.relatedRecordIds?.length > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Info className="w-3 h-3" />{tx.relatedRecordIds.length} records linked
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Inflow</p>
                          <p className="font-semibold text-emerald-600">+${parseFloat(tx.totalInUsd || "0").toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Outflow</p>
                          <p className="font-semibold text-red-500">-${parseFloat(tx.totalOutUsd || "0").toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Fee ({tx.serviceFeeRate}%)</p>
                          <p className="font-semibold text-foreground">${parseFloat(tx.serviceFeeAmount || "0").toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Net Result</p>
                          <p className={`font-bold ${netDiff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {netDiff >= 0 ? "+" : ""}${Math.abs(netDiff).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </p>
                          {netDiffCfg && (
                            <p className={`text-xs ${netDiffCfg.color}`}>{netDiffCfg.label}</p>
                          )}
                        </div>
                      </div>

                      {tx.notes && <p className="text-xs text-muted-foreground/70 mt-1.5">{tx.notes}</p>}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{format(new Date(tx.createdAt), "MMM d, yyyy")}</p>
                        <p>{format(new Date(tx.createdAt), "HH:mm")}</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setViewTx(tx)} data-testid={`button-view-tx-${tx.id}`}>
                        <Eye className="w-3 h-3 mr-1" />View
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {viewTx && (
        <TransactionDetailDialog
          tx={viewTx}
          customerMap={customerMap}
          onClose={() => setViewTx(null)}
        />
      )}
    </div>
  );
}
