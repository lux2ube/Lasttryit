import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ChartOfAccount, Provider, CustomerWallet, ExchangeRate } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Banknote, Bitcoin, TrendingUp, TrendingDown, Lock, User,
  Hash, Building2, Wallet, FileText, Clock, Loader2, Search, X,
  Edit2, ChevronDown, ChevronUp, Eye, ArrowRight, Network, Filter,
  Zap, BookmarkPlus, XCircle, BookOpen, CheckCircle, UserCheck, UserX, Download,
  AlertTriangle
} from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { InvoiceDownloadButton } from "@/components/record-invoice";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinancialRecord {
  id: string;
  recordNumber: string;
  transactionId?: string;
  customerId?: string;
  type: "cash" | "crypto";
  direction: "inflow" | "outflow";
  processingStage: "draft" | "recorded" | "matched" | "manual_matched" | "auto_matched" | "confirmed" | "used" | "cancelled";
  source?: string;
  endpointName?: string;
  recordMethod: "manual" | "auto";
  accountId?: string;
  accountName?: string;
  accountCurrency?: string;
  contraAccountId?: string;
  contraAccountName?: string;
  amount: string;
  currency: string;
  usdEquivalent?: string;
  buyRate?: string;
  sellRate?: string;
  exchangeRate?: string;
  // Bank rate: the CoA account's rate at time of recording (locked). Inflow=buyRate, outflow=sellRate.
  // Execution/system rate (editable per record): stored as buyRate (inflow) or sellRate (outflow).
  // Spread fee ($) = derived from the difference between bankRate and the system rate.
  bankRate?: string;
  serviceFeeRate?: string;   // crypto service fee rate % (null for cash)
  serviceFeeUsd?: string;    // crypto service fee USD amount (null for cash)
  networkFeeUsd?: string;    // crypto gas fee USD (null for cash)
  spreadRate?: string;       // cash FX spread rate % — internal calc only, not displayed in UI
  spreadUsd?: string;        // cash FX spread income USD (null for crypto)
  expenseUsd?: string;       // supplier/exchange cost (manual). Ledgered to 5201 at confirmation.
  accountField?: string;
  clientName?: string;
  clientSenderName?: string;
  clientRecipientName?: string;
  clientMatchMethod?: string;
  assetOrProviderName?: string;
  networkOrId?: string;
  isWhitelisted?: boolean;
  txidOrReferenceNumber?: string;
  blockNumberOrBatchId?: string;
  documents?: any;
  notes?: string;
  logEvents?: any[];
  createdAt: string;
  updatedAt: string;
}

interface Customer {
  id: string;
  customerId: string;
  fullName: string;
  phonePrimary: string;
}

// ─── Record Type Definitions ──────────────────────────────────────────────────

type RecordCategory = "cash_inflow" | "cash_outflow" | "crypto_inflow" | "crypto_outflow";

const RECORD_TYPES: Record<RecordCategory, {
  label: string; type: "cash" | "crypto"; direction: "inflow" | "outflow";
  icon: typeof Banknote; color: string; bg: string; description: string;
}> = {
  cash_inflow:    { label: "Cash Inflow",    type: "cash",   direction: "inflow",  icon: Banknote,     color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-900/30", description: "Customer sends local currency to our bank account" },
  cash_outflow:   { label: "Cash Outflow",   type: "cash",   direction: "outflow", icon: TrendingDown,  color: "text-orange-700 dark:text-orange-300",  bg: "bg-orange-100 dark:bg-orange-900/30",  description: "We send local currency to customer's bank account" },
  crypto_inflow:  { label: "Crypto Inflow",  type: "crypto", direction: "inflow",  icon: Bitcoin,       color: "text-purple-700 dark:text-purple-300",  bg: "bg-purple-100 dark:bg-purple-900/30",  description: "Customer sends USDT/crypto to our wallet or platform ID" },
  crypto_outflow: { label: "Crypto Outflow", type: "crypto", direction: "outflow", icon: TrendingUp,    color: "text-blue-700 dark:text-blue-300",      bg: "bg-blue-100 dark:bg-blue-900/30",      description: "We send USDT/crypto to customer's wallet address or platform ID" },
};

const STAGE_ORDER = ["draft", "recorded", "matched", "confirmed", "used", "cancelled"] as const;
const STAGE_CONFIG: Record<string, {
  label: string; color: string; next?: string;
  nextLabel?: string; nextDescription?: string; canCancel?: boolean;
}> = {
  draft: {
    label: "Draft",
    color: "bg-gray-100 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400",
    next: "recorded",
    nextLabel: "Record Now",
    nextDescription: "Locks all financial fields and posts a journal entry. If a customer is already linked, journals directly to their account and advances to Matched in one step. Otherwise, journals to account 2101 (suspense) and stays Recorded — link a customer later to match.",
  },
  recorded: {
    label: "Recorded",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    next: "confirmed",
    nextLabel: "Confirm to Ledger",
    nextDescription: "Posts the final P&L journal entries — revenue, expense, and customer balance entries. Requires a customer to be linked. Financial fields are locked after confirmation.",
    canCancel: true,
  },
  matched: {
    label: "Matched",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    next: "confirmed",
    nextLabel: "Confirm",
    nextDescription: "Business sign-off — marks the record as verified and ready to use in a transaction.",
    canCancel: true,
  },
  manual_matched: {
    label: "Matched",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    next: "confirmed",
    nextLabel: "Confirm",
    nextDescription: "Business sign-off — marks the record as verified and ready to use in a transaction.",
    canCancel: true,
  },
  auto_matched: {
    label: "Auto-Matched",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    next: "confirmed",
    nextLabel: "Confirm",
    nextDescription: "Business sign-off — marks the record as verified and ready to use in a transaction.",
    canCancel: true,
  },
  confirmed: {
    label: "Confirmed",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    canCancel: true,
  },
  used:      { label: "Used in TX",  color: "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  cancelled: { label: "Cancelled",   color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const FIAT_CURRENCIES = ["YER", "SAR", "USD", "AED", "KWD"];
const CRYPTO_ASSETS   = ["USDT", "BTC", "ETH", "BNB"];
const NETWORKS        = ["BEP20", "TRC20", "ERC20", "TON", "Aptos", "Bitcoin"];

// ─── Form Schema ─────────────────────────────────────────────────────────────

const formSchema = z.object({
  category: z.enum(["cash_inflow", "cash_outflow", "crypto_inflow", "crypto_outflow"]),
  customerId: z.string().optional(),
  amount: z.string().min(1, "Amount required"),
  currency: z.string().optional(),
  usdEquivalent: z.string().optional(),
  buyRate:  z.string().optional(),
  sellRate: z.string().optional(),
  // Bank rate from CoA account at recording time (locked once set). Inflow = buy, outflow = sell.
  bankRate: z.string().optional(),
  // For crypto records: per-record service fee % override
  serviceFeeRate: z.string().optional(),
  // Manually entered supplier/exchange expense (USD). Ledgered to 5201 at confirmation.
  expenseUsd: z.string().optional(),
  // Our primary account (the asset/wallet that physically moves)
  coaAccountId: z.string().optional(),
  accountName:  z.string().optional(),
  accountField: z.string().optional(),
  // Contra account (the second leg — usually a liability/payable)
  contraAccountId:   z.string().optional(),
  contraAccountName: z.string().optional(),
  // Counterparty details
  clientSenderName:    z.string().optional(),
  clientRecipientName: z.string().optional(),
  clientName:          z.string().optional(),
  assetOrProviderName: z.string().optional(), // bank name (cash) or exchange name (crypto)
  networkOrId:         z.string().optional(), // customer wallet/account/IBAN
  isWhitelisted:       z.boolean().optional(),
  txidOrReferenceNumber: z.string().optional(),
  blockNumberOrBatchId:  z.string().optional(),
  notes:           z.string().optional(),
  processingStage: z.enum(["draft", "recorded", "matched", "manual_matched", "auto_matched", "confirmed", "cancelled"]).default("draft"),
});
type RecordForm = z.infer<typeof formSchema>;

// ─── Record Detail Dialog ─────────────────────────────────────────────────────

function RecordDetailDialog({
  record,
  customer,
  onClose,
  onEdit,
  onAdvanceStage,
}: {
  record: FinancialRecord;
  customer?: Customer;
  onClose: () => void;
  onEdit: () => void;
  onAdvanceStage: (stage: string) => void;
}) {
  const cat = Object.entries(RECORD_TYPES).find(([, d]) => d.type === record.type && d.direction === record.direction);
  const def = cat ? RECORD_TYPES[cat[0] as RecordCategory] : null;
  const stageCfg = STAGE_CONFIG[record.processingStage];
  const isTerminal = record.processingStage === "used" || record.processingStage === "cancelled" || record.processingStage === "confirmed";
  const isFinanciallyLocked = record.processingStage !== "draft";
  const MATCHED_STAGES = ["matched", "manual_matched", "auto_matched"];

  // Context-aware button visibility
  const stage = record.processingStage;
  const hasCustomer = !!record.customerId;
  const showAdvance = !isTerminal && (
    stage === "draft" ||
    (stage === "recorded" && hasCustomer) ||
    MATCHED_STAGES.includes(stage)
  );
  // "Matched" is not a stage — jump directly draft→recorded, recorded→confirmed
  const advanceStage = stage === "draft" ? "recorded" : "confirmed";
  const advanceLabel = stage === "draft" ? "Record Now" : "Confirm to Ledger";
  const showCancel = !isTerminal && stageCfg?.canCancel;
  const showEdit   = !isTerminal;

  const nextStage = !isTerminal ? stageCfg?.next : undefined;

  const isCashDetail   = record.type === "cash";
  const isInflowDetail = record.direction === "inflow";

  const rows: [string, string | undefined | null][] = [
    ["Record Number", record.recordNumber],
    ["Journal Entry", record.transactionId ?? null],
    ["Type / Direction", def ? `${def.label} (${record.type} · ${record.direction})` : `${record.type} · ${record.direction}`],
    ["Processing Stage", stageCfg?.label],
    ["Amount", `${parseFloat(record.amount).toLocaleString()} ${record.currency}`],
    ["USD Equivalent", record.usdEquivalent ? `$${parseFloat(record.usdEquivalent).toLocaleString()}` : null],
    // Direction-aware rate display:
    // Inflow  → buy rate only.  Outflow → sell rate only.
    // Bank rate (CoA) = what the bank gives us. System rate = execution rate charged to client.
    ...(record.direction === "inflow" ? [
      ["Bank Rate (CoA)", (record as any).bankRate ? `${parseFloat((record as any).bankRate).toLocaleString()} ${record.currency}/USD` : null] as [string, string | null],
      ["System Rate", (record as any).buyRate ? `${parseFloat((record as any).buyRate).toLocaleString()} ${record.currency}/USD` : null] as [string, string | null],
    ] : [
      ["Bank Rate (CoA)", (record as any).bankRate ? `${parseFloat((record as any).bankRate).toLocaleString()} ${record.currency}/USD` : null] as [string, string | null],
      ["System Rate", (record as any).sellRate ? `${parseFloat((record as any).sellRate).toLocaleString()} ${record.currency}/USD` : null] as [string, string | null],
    ]),
    // Spread fee = USD difference between bank rate and system rate (shown only when confirmed and set)
    ["Spread Fee", (record as any).spreadUsd ? `$${parseFloat((record as any).spreadUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (FX spread income · 4201)` : null],
    ["Supplier Expense", (record as any).expenseUsd && parseFloat((record as any).expenseUsd) > 0 ? `$${parseFloat((record as any).expenseUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (cost · 5201)` : null],
    ["DR Account", record.direction === "inflow" ? record.accountName : record.contraAccountName],
    ["CR Account", record.direction === "inflow" ? record.contraAccountName : record.accountName],
    // Our account identifier (always "Account No. / Ref")
    ["Account No. / Ref", record.accountField],
    // Asset or provider label depends on type
    [isCashDetail ? "Bank / Provider" : "Asset / Token", record.assetOrProviderName],
    // ── Inflow-specific fields ──
    ...(isInflowDetail ? [
      [isCashDetail ? "Sender Name"           : "Sent From (Platform)", record.clientSenderName],
      [isCashDetail ? "Transfer Reference"    : "TX Hash",              record.txidOrReferenceNumber],
      ...(!isCashDetail ? [["Block Number", record.blockNumberOrBatchId] as [string, string | null]] : []),
    ] as [string, string | null][] : []),
    // ── Outflow-specific fields ──
    ...(!isInflowDetail ? [
      [isCashDetail ? "Recipient Name"        : "Recipient",            record.clientRecipientName],
      [isCashDetail ? "Account / IBAN"        : "Destination / Network",record.networkOrId],
      [isCashDetail ? "Transfer Reference"    : "TX Hash",              record.txidOrReferenceNumber],
      ...(!isCashDetail ? [["Block Number", record.blockNumberOrBatchId] as [string, string | null]] : []),
    ] as [string, string | null][] : []),
    // Linked customer (if matched)
    ["Linked Customer", record.clientName],
    ["Whitelisted Address", record.isWhitelisted ? "Yes — pre-approved by customer" : null],
    ["Source", record.source],
    ["Method", record.recordMethod],
    ["Notes", record.notes],
    ["Created", format(new Date(record.createdAt), "PPpp")],
    ["Last Updated", format(new Date(record.updatedAt), "PPpp")],
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye className="w-4 h-4 text-primary" />
            Record Detail — {record.recordNumber}
          </DialogTitle>
          <DialogDescription className="sr-only">Full record details</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          {def && <Badge className={`${def.bg} ${def.color}`}>{def.label}</Badge>}
          <Badge className={stageCfg?.color ?? ""}>{stageCfg?.label}</Badge>
          {record.processingStage === "used" && (
            <Badge variant="outline" className="text-muted-foreground"><Lock className="w-3 h-3 mr-1" />Locked to Transaction</Badge>
          )}
          {isFinanciallyLocked && record.processingStage !== "used" && record.processingStage !== "cancelled" && (
            <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-300"><Lock className="w-3 h-3 mr-1" />Financials Locked</Badge>
          )}
        </div>

        <div className="space-y-1.5 text-sm">
          {rows.filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="flex gap-2 py-1.5 border-b border-border/40 last:border-0">
              <span className="w-40 shrink-0 text-muted-foreground text-xs font-medium pt-0.5">{label}</span>
              <span className={`flex-1 text-foreground break-all ${label === "TX Hash / Reference" ? "font-mono text-xs" : ""}`}>{value}</span>
            </div>
          ))}
        </div>

        {record.logEvents && record.logEvents.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Event Log</p>
            <div className="space-y-1">
              {(record.logEvents as any[]).map((e, i) => {
                const ACTION_LABELS: Record<string, string> = {
                  created: "Created",
                  recorded: "Recorded",
                  customer_linked: "Customer Linked",
                  matched: "Matched",
                  address_whitelisted: "Address Whitelisted",
                  confirmed: "Confirmed",
                  cancelled: "Cancelled",
                  used: "Used in Transaction",
                };
                const label = ACTION_LABELS[e.action] ?? e.action.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                return (
                  <div key={i} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.action === 'address_whitelisted' ? 'bg-emerald-500' : 'bg-primary/50'}`} />
                      <span className="font-medium text-foreground">{label}</span>
                      <span>·</span>
                      <span>{e.timestamp ? format(new Date(e.timestamp), "PPp") : "—"}</span>
                      {e.customerName && <span className="text-muted-foreground">— {e.customerName}</span>}
                    </div>
                    {e.action === 'address_whitelisted' && e.address && (
                      <div className="pl-4 text-xs text-emerald-700 dark:text-emerald-400 font-mono">
                        {e.address}{e.network ? ` (${e.network})` : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stage advance info panel — context-aware */}
        {!isTerminal && (
          <>
            {stage === "recorded" && !hasCustomer ? (
              <div className="rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-900/10 dark:border-amber-600/30 px-3 py-2.5 text-xs">
                <p className="font-semibold text-amber-700 dark:text-amber-400 mb-0.5 flex items-center gap-1">
                  <User className="w-3 h-3" />Customer Required to Advance
                </p>
                <p className="text-muted-foreground">This record was journalized to account 2101 (suspense). Edit the record, link a customer, then click <strong>Confirm to Ledger</strong> to post the final P&amp;L entries to their account.</p>
              </div>
            ) : nextStage && stageCfg?.nextDescription ? (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-0.5 flex items-center gap-1">
                  <ArrowRight className="w-3 h-3" />
                  {stageCfg.nextLabel}
                </p>
                <p>{stageCfg.nextDescription}</p>
                {stage === "draft" && hasCustomer && (
                  <p className="mt-1 text-emerald-700 dark:text-emerald-400 font-medium">Customer already linked — will journal directly to their account on recording.</p>
                )}
              </div>
            ) : null}

            {/* Cancel info */}
            {stageCfg?.canCancel && (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-semibold text-destructive mb-0.5 flex items-center gap-1">
                  <XCircle className="w-3 h-3" />Cancel Record
                </p>
                <p>Posts reversal journal entries against all affected accounts to fully undo this record's financial effect. This action is irreversible.</p>
              </div>
            )}
          </>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <InvoiceDownloadButton record={record} customer={customer} size="default" />
          {showEdit && (
            <Button variant="outline" onClick={onEdit} data-testid="button-edit-record">
              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
              {isFinanciallyLocked ? "Edit Notes / Client" : "Edit"}
            </Button>
          )}
          {showCancel && (
            <Button variant="destructive" size="sm" onClick={() => { onAdvanceStage("cancelled"); onClose(); }} data-testid="button-cancel-record">
              <XCircle className="w-3.5 h-3.5 mr-1.5" />Cancel Record
            </Button>
          )}
          {showAdvance && (
            <Button onClick={() => { onAdvanceStage(advanceStage); onClose(); }} data-testid="button-advance-stage">
              <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
              {advanceLabel}
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

// ─── Record Form Page ─────────────────────────────────────────────────────────

function RecordFormPage({
  onCancel,
  defaultCategory,
  editRecord,
}: {
  onCancel: () => void;
  defaultCategory?: RecordCategory;
  editRecord?: FinancialRecord;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showOptionals, setShowOptionals] = useState<boolean>(
    !!(editRecord?.assetOrProviderName || editRecord?.accountField)
  );
  const [showAccounting, setShowAccounting] = useState(false);
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: coaAccounts } = useQuery<ChartOfAccount[]>({ queryKey: ["/api/accounting/accounts"] });
  const { data: providers } = useQuery<Provider[]>({ queryKey: ["/api/accounting/providers"] });
  const { data: watchedWallets } = useQuery<any[]>({ queryKey: ["/api/accounting/watched-wallets"] });

  const providerMap = useMemo<Record<string, Provider>>(() => {
    if (!providers) return {};
    return Object.fromEntries(providers.map(p => [String(p.id), p]));
  }, [providers]);

  // Map accountId → active watched wallet (for auto-filling our sending address)
  const watchedWalletByAccountId = useMemo<Record<string, any>>(() => {
    if (!watchedWallets) return {};
    return Object.fromEntries(
      watchedWallets.filter(w => w.accountId && w.isActive).map(w => [String(w.accountId), w])
    );
  }, [watchedWallets]);

  const deriveCategory = (r?: FinancialRecord): RecordCategory => {
    if (!r) return defaultCategory ?? "cash_inflow";
    if (r.type === "cash"   && r.direction === "inflow")  return "cash_inflow";
    if (r.type === "cash"   && r.direction === "outflow") return "cash_outflow";
    if (r.type === "crypto" && r.direction === "inflow")  return "crypto_inflow";
    return "crypto_outflow";
  };

  const form = useForm<RecordForm>({
    resolver: zodResolver(formSchema),
    defaultValues: editRecord ? {
      category:              deriveCategory(editRecord),
      customerId:            editRecord.customerId ?? "",
      amount:                editRecord.amount,
      currency:              editRecord.currency,
      usdEquivalent:         editRecord.usdEquivalent ?? "",
      serviceFeeRate:        editRecord.serviceFeeRate ?? "",
      expenseUsd:            (editRecord as any).expenseUsd ?? "",
      buyRate:               (editRecord as any).buyRate ?? editRecord.exchangeRate ?? "",
      sellRate:              (editRecord as any).sellRate ?? editRecord.exchangeRate ?? "",
      bankRate:              (editRecord as any).bankRate ?? "",
      coaAccountId:          editRecord.accountId ?? "",
      accountName:           editRecord.accountName ?? "",
      accountField:          editRecord.accountField ?? "",
      contraAccountId:       editRecord.contraAccountId ?? "",
      contraAccountName:     editRecord.contraAccountName ?? "",
      clientSenderName:      editRecord.clientSenderName ?? "",
      clientRecipientName:   editRecord.clientRecipientName ?? "",
      clientName:            editRecord.clientName ?? "",
      assetOrProviderName:   editRecord.assetOrProviderName ?? "",
      networkOrId:           editRecord.networkOrId ?? "",
      isWhitelisted:         editRecord.isWhitelisted ?? false,
      txidOrReferenceNumber: editRecord.txidOrReferenceNumber ?? "",
      blockNumberOrBatchId:  editRecord.blockNumberOrBatchId ?? "",
      notes:                 editRecord.notes ?? "",
      notificationNotes:     editRecord.notificationNotes ?? "",
      processingStage:       editRecord.processingStage === "used" ? "confirmed" : editRecord.processingStage as any,
    } : {
      category:        defaultCategory ?? "cash_inflow",
      processingStage: "draft",
      amount:          "",
      buyRate:         "",
      sellRate:        "",
      bankRate:        "",
      accountField:    "",
      contraAccountId: "",
      notes:           "",
      notificationNotes: "",
    },
  });

  const watchCategory    = form.watch("category");
  const watchAmount      = form.watch("amount");
  const watchBuyRate        = form.watch("buyRate");
  const watchSellRate       = form.watch("sellRate");
  const watchBankRate       = form.watch("bankRate");
  const watchServiceFeeRate = form.watch("serviceFeeRate");
  const watchCoaAcctId   = form.watch("coaAccountId");
  const watchCustomerId  = form.watch("customerId");
  const watchNetworkOrId = form.watch("networkOrId");

  const selectedCustomer = useMemo(() =>
    customers?.find(c => c.id === watchCustomerId),
    [customers, watchCustomerId]
  );

  const userEditedRateRef = useRef(false);
  const userEditedFeeRef  = useRef(false);

  // ── Customer search combobox state ───────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState(selectedCustomer?.fullName ?? "");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Sync input text when form's customerId changes externally (e.g. on edit load)
  useEffect(() => {
    setCustomerSearch(selectedCustomer?.fullName ?? "");
  }, [selectedCustomer?.fullName]);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.fullName.toLowerCase().includes(q) ||
      c.customerId.toLowerCase().includes(q) ||
      c.phonePrimary.includes(q)
    );
  }, [customers, customerSearch]);

  const categoryDef        = RECORD_TYPES[watchCategory];
  const isCash             = categoryDef?.type === "cash";
  const isInflow           = categoryDef?.direction === "inflow";
  // ── Stage-based field locking — Delayed Journaling principle ────────────
  // "Matched" is NOT a stage. It is a derived boolean: customerId IS NOT NULL.
  // A record can be Recorded + Matched (customer linked), Recorded + Unmatched, etc.
  // Actual stages: draft → recorded → confirmed → cancelled / used.
  const LEGACY_MATCHED_STAGES = ["matched", "manual_matched", "auto_matched"] as const;
  const TERMINAL_STAGES       = ["confirmed", "used", "cancelled"] as const;
  // isMatched: true when any customer is linked to this record
  const isMatched         = !!editRecord?.customerId;
  // Legacy check — handles records still stored with old "matched" stage values
  const isInLegacyMatchedStage = !!editRecord && LEGACY_MATCHED_STAGES.includes(editRecord.processingStage as any);
  const isInRecordedStage = !!editRecord && (editRecord.processingStage === "recorded" || isInLegacyMatchedStage);
  const isTerminalStage   = !!editRecord && TERMINAL_STAGES.includes(editRecord.processingStage as any);
  // Amount locks immediately after Draft — in Recorded stage only rates/fees remain adjustable.
  // Terminal stages (confirmed / used / cancelled) lock everything.
  const isAmountLocked    = isInRecordedStage || isTerminalStage;
  const isRateLocked      = isTerminalStage;
  const isFinanciallyLocked = isTerminalStage;

  const selectedCoaAccount = useMemo(() =>
    coaAccounts?.find(a => String(a.id) === watchCoaAcctId),
    [coaAccounts, watchCoaAcctId]
  );
  const linkedProvider = useMemo(() =>
    selectedCoaAccount?.providerId ? providerMap[selectedCoaAccount.providerId] : undefined,
    [selectedCoaAccount, providerMap]
  );

  // ── Smart data: exchange rates + customer wallets ────────────────────────
  const { data: exchangeRates } = useQuery<ExchangeRate[]>({ queryKey: ["/api/accounting/exchange-rates"] });

  const { data: customerWallets } = useQuery<CustomerWallet[]>({
    queryKey: [`/api/customers/${watchCustomerId}/wallets`],
    enabled: !!watchCustomerId,
  });

  const { data: customerDefaults } = useQuery<{
    cashInflow:    { accountId?: string; accountName?: string } | null;
    cashOutflow:   { accountId?: string; accountName?: string; assetOrProviderName?: string; networkOrId?: string } | null;
    cryptoInflow:  { accountId?: string; accountName?: string } | null;
    cryptoOutflow: { accountId?: string; accountName?: string; assetOrProviderName?: string; networkOrId?: string } | null;
  }>({
    queryKey: [`/api/records/customer-defaults/${watchCustomerId}`],
    enabled: !!watchCustomerId && !editRecord,
  });

  const { data: groupOverrides } = useQuery<{
    suspended: boolean;
    group: { id: string; code: string; name: string; color: string } | null;
    rateOverrides: Array<{ currencyCode: string; buyRate?: number | null; sellRate?: number | null }>;
    feeOverrides: Array<{ providerId: string; providerName?: string; depositFeeRate?: number | null; withdrawFeeRate?: number | null }>;
    recordLimits: { perTransaction?: number; perMonth?: number; perYear?: number; currency?: string } | null;
  }>({
    queryKey: ["/api/records/customer-group-overrides", watchCustomerId],
    queryFn: () => fetch(`/api/records/customer-group-overrides/${watchCustomerId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!watchCustomerId,
  });

  const isSuspended = groupOverrides?.suspended === true;

  // ── Confirmation P&L preview — fetched when record is in a matched stage ──
  const { data: confirmPreview } = useQuery<{
    lines: Array<{ accountCode: string; accountName: string; description: string; debitAmount: string; creditAmount: string }>;
    projectedProfit: number;
  }>({
    queryKey: [`/api/records/${editRecord?.id}/confirmation-preview`],
    enabled: !!editRecord?.id && isInRecordedStage && isMatched,
  });

  const isAddressInWhitelist = useMemo(() => {
    if (!watchNetworkOrId || !customerWallets) return false;
    return customerWallets.some(w => w.addressOrId === watchNetworkOrId && w.isActive);
  }, [watchNetworkOrId, customerWallets]);

  const saveToWhitelistMutation = useMutation({
    mutationFn: (payload: { customerId: string; addressOrId: string; providerName: string; type: string; direction: string; label?: string }) =>
      apiRequest("POST", `/api/customers/${payload.customerId}/wallets`, {
        customerId: payload.customerId,
        addressOrId: payload.addressOrId,
        providerName: payload.providerName,
        type: payload.type,
        direction: payload.direction,
        label: payload.label || undefined,
        isDefault: false,
        isActive: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${watchCustomerId}/wallets`] });
      toast({ title: "Address saved to whitelist", description: "Customer's destination address has been whitelisted." });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  // ── Auto-populate exchange rate ────────────────────────────────────────────
  // Calls form.setValue directly — safe because the Input uses value={watchBuyRate}/
  // value={watchSellRate} (form.watch) which always reflects form.setValue updates.
  const applyRateForAccount = (coaAccountId: string, inflowDir: boolean) => {
    const acct = coaAccounts?.find(a => String(a.id) === coaAccountId);
    if (!acct) return;
    const cur = acct.currency?.toUpperCase() ?? "";
    const setExecution = (f: "buyRate" | "sellRate", val: string) =>
      form.setValue(f, val, { shouldDirty: true });
    const setBankRate = (val: string) =>
      form.setValue("bankRate", val, { shouldDirty: true });

    // USD-pegged: no conversion
    if (cur === "USD" || cur === "USDT" || cur === "USDC") {
      setExecution(inflowDir ? "buyRate" : "sellRate", "1");
      setBankRate("1");
      return;
    }

    // Bank rate (CoA) = the rate the bank physically gives us (stored on the account).
    // Set it separately from the system/execution rate.
    const coaRate = inflowDir ? acct.buyRate : acct.sellRate;
    if (coaRate) setBankRate(String(coaRate));

    // System rate = from the exchange rates table (the rate we charge the customer).
    // If customer has a loyalty group with rate overrides for this currency, use those instead.
    const groupRateOvr = groupOverrides?.rateOverrides?.find(
      (r: any) => r.currencyCode?.toUpperCase() === cur
    );

    if (groupRateOvr) {
      const ovrVal = inflowDir ? groupRateOvr.buyRate : groupRateOvr.sellRate;
      if (ovrVal != null) {
        setExecution(inflowDir ? "buyRate" : "sellRate", String(ovrVal));
        if (!coaRate) setBankRate(String(ovrVal));
        return;
      }
    }

    const candidates = (exchangeRates ?? []).filter(r => r.fromCurrency?.toUpperCase() === cur);
    const latestRate = candidates
      .sort((a, b) => new Date(b.effectiveDate ?? 0).getTime() - new Date(a.effectiveDate ?? 0).getTime())[0];
    if (latestRate) {
      const sysVal = inflowDir ? latestRate.buyRate : latestRate.sellRate;
      if (sysVal) {
        setExecution(inflowDir ? "buyRate" : "sellRate", String(sysVal));
        if (!coaRate) setBankRate(String(sysVal));
      }
    } else if (coaRate) {
      setExecution(inflowDir ? "buyRate" : "sellRate", String(coaRate));
    }
  };

  // Fallback: re-apply if exchangeRates loads after account selection
  useEffect(() => {
    if (!watchCoaAcctId || !exchangeRates) return;
    const currentRate = isInflow ? form.getValues("buyRate") : form.getValues("sellRate");
    if (!currentRate) applyRateForAccount(watchCoaAcctId, isInflow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchCoaAcctId, isInflow, exchangeRates, groupOverrides]);

  // ── Account filtering — must be defined before the auto-select effect ─────
  const KNOWN_CRYPTO_EARLY = new Set(["USDT", "BTC", "ETH", "BNB", "TRX", "MATIC", "TON", "SOL"]);
  const filteredCoaAccounts = useMemo(() => {
    if (!coaAccounts) return [];
    return coaAccounts.filter(a => {
      if (a.type !== "asset") return false;
      const isCryptoCurrency = KNOWN_CRYPTO_EARLY.has(a.currency.toUpperCase());
      return isCash ? !isCryptoCurrency : isCryptoCurrency;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coaAccounts, isCash]);

  // ── Auto-select account on new crypto outflow (smart default) ────────────
  // When the user opens a fresh crypto outflow form, auto-pick the account if
  // there is exactly one active watched wallet — saves a click and prevents mistakes.
  useEffect(() => {
    if (editRecord || watchCategory !== "crypto_outflow") return;
    if (watchCoaAcctId) return; // already chosen — don't override
    if (!filteredCoaAccounts || filteredCoaAccounts.length === 0) return;
    // Prefer accounts that have an active watched wallet; fall back to the first crypto account
    const withWallet = filteredCoaAccounts.filter(a => watchedWalletByAccountId[String(a.id)]);
    const target = withWallet.length === 1 ? withWallet[0]
                 : filteredCoaAccounts.length === 1 ? filteredCoaAccounts[0]
                 : null;
    if (target) {
      form.setValue("coaAccountId", String(target.id), { shouldDirty: false });
      applyRateForAccount(String(target.id), false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchCategory, filteredCoaAccounts, watchedWalletByAccountId, editRecord]);

  // ── Auto-fill "Our wallet address" from the matched watched wallet ────────
  // Whenever the selected CoA account changes on a crypto outflow, populate
  // the accountField with the company wallet address stored in watched wallets.
  // The field stays editable so staff can override it if needed.
  useEffect(() => {
    if (isCash || isInflow || !watchCoaAcctId || isFinanciallyLocked) return;
    const ww = watchedWalletByAccountId[watchCoaAcctId];
    if (ww?.walletAddress) {
      form.setValue("accountField", ww.walletAddress, { shouldDirty: false });
    } else if (!editRecord) {
      // No watched wallet for this account — clear the field so old value doesn't linger
      form.setValue("accountField", "", { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchCoaAcctId, isCash, isInflow, isFinanciallyLocked, watchedWalletByAccountId]);

  // ── Auto-fill counter-party field from customer's preferred wallets ────────
  // Works for BOTH crypto and cash outflows.
  // Address pre-fill priority (outflow only):
  //   1. Default wallet for the same provider  → always prefer this
  //   2. Any non-default whitelist for same provider → use only when no default exists for that provider
  //   3. No match → don't fill
  // A provider must be resolved before we can match — if no linkedProvider yet, skip.
  useEffect(() => {
    if (!watchCustomerId || !customerWallets || isInflow) return;

    const walletType = isCash ? "cash" : "crypto";
    const activeWallets = customerWallets.filter(w => w.isActive && w.type === walletType && w.direction === "outflow");
    if (activeWallets.length === 0) return;

    // Require a resolved provider before attempting a match
    const provName = linkedProvider?.name?.toLowerCase() ?? "";
    const provWord = provName.split(" ")[0];
    if (provWord.length <= 2) return; // no provider selected yet — skip

    // Only consider wallets whose provider matches the selected one
    const providerMatches = activeWallets.filter(w =>
      w.providerName.toLowerCase().includes(provWord)
    );
    if (providerMatches.length === 0) return; // no wallet for this provider — don't fill

    // Among matching wallets: default first, then any non-default
    const best = providerMatches.find(w => w.isDefault) ?? providerMatches[0];

    // Only fill empty fields — never clobber what the user explicitly typed
    if (!form.getValues("networkOrId")) {
      form.setValue("networkOrId", best.addressOrId, { shouldDirty: false });
    }
    if (!form.getValues("assetOrProviderName") && isCash) {
      form.setValue("assetOrProviderName", best.providerName, { shouldDirty: false });
    }
    if (best.label) {
      form.setValue("clientRecipientName", best.label, { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchCustomerId, watchCoaAcctId, customerWallets, isInflow, isCash, linkedProvider]);

  // ── Auto-fill service fee rate from linked provider (with group override) ──
  useEffect(() => {
    if (isCash || isRateLocked || editRecord) return;
    if (!linkedProvider) return;

    let rate = isInflow
      ? String(linkedProvider.withdrawFeeRate ?? '')
      : String(linkedProvider.depositFeeRate  ?? '');

    if (groupOverrides?.feeOverrides?.length && linkedProvider) {
      const feeOvr = groupOverrides.feeOverrides.find(
        (f: any) => f.providerId === (selectedCoaAccount?.providerId ?? linkedProvider.id)
      );
      if (feeOvr) {
        const ovrVal = isInflow ? feeOvr.withdrawFeeRate : feeOvr.depositFeeRate;
        if (ovrVal != null) rate = String(ovrVal);
      }
    }

    if (rate && rate !== '0' && !form.getValues("serviceFeeRate")) {
      form.setValue("serviceFeeRate", rate, { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedProvider, isInflow, isCash, isRateLocked, groupOverrides]);

  // ── Apply group overrides authoritatively when they resolve ─────────────
  // This handles the race condition where provider defaults fill rate/fee before
  // groupOverrides load. We overwrite auto-filled values but respect user edits.
  useEffect(() => {
    if (!groupOverrides || !watchCoaAcctId) return;
    const acct = coaAccounts?.find(a => String(a.id) === watchCoaAcctId);
    const cur = acct?.currency?.toUpperCase() ?? "";

    if (groupOverrides.rateOverrides?.length && cur && cur !== "USD" && cur !== "USDT" && cur !== "USDC" && !userEditedRateRef.current) {
      const rateOvr = groupOverrides.rateOverrides.find((r: any) => r.currencyCode?.toUpperCase() === cur);
      if (rateOvr) {
        const ovrVal = isInflow ? rateOvr.buyRate : rateOvr.sellRate;
        if (ovrVal != null) {
          form.setValue(isInflow ? "buyRate" : "sellRate", String(ovrVal), { shouldDirty: true });
        }
      }
    }

    if (groupOverrides.feeOverrides?.length && linkedProvider && !isCash && !userEditedFeeRef.current) {
      const feeOvr = groupOverrides.feeOverrides.find(
        (f: any) => f.providerId === (selectedCoaAccount?.providerId ?? linkedProvider.id)
      );
      if (feeOvr) {
        const ovrVal = isInflow ? feeOvr.withdrawFeeRate : feeOvr.depositFeeRate;
        if (ovrVal != null) {
          form.setValue("serviceFeeRate", String(ovrVal), { shouldDirty: true });
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupOverrides]);

  // Reset user-edit tracking when customer changes
  useEffect(() => {
    userEditedRateRef.current = false;
    userEditedFeeRef.current  = false;
  }, [watchCustomerId]);

  // ── Smart pre-fill: auto-select last-used asset account for this customer ──
  // Pre-fills ONLY the CoA asset account from the customer's most recent confirmed
  // record of the same category (cash inflow / outflow / crypto inflow / outflow).
  // The counterparty address is intentionally NOT pre-filled here — it is handled
  // by the wallet effect above, which picks the best matching wallet for the
  // selected provider (default > provider-matched > first active).
  useEffect(() => {
    if (!customerDefaults || !watchCustomerId || editRecord) return;
    const key = watchCategory === "cash_inflow"    ? "cashInflow"
              : watchCategory === "cash_outflow"   ? "cashOutflow"
              : watchCategory === "crypto_inflow"  ? "cryptoInflow"
              : watchCategory === "crypto_outflow" ? "cryptoOutflow"
              : null;
    if (!key) return;
    const def = customerDefaults[key as keyof typeof customerDefaults];
    if (!def?.accountId) return;

    // Only pre-fill if the user hasn't already chosen an account
    if (!form.getValues("coaAccountId")) {
      form.setValue("coaAccountId", String(def.accountId), { shouldDirty: false });
      applyRateForAccount(String(def.accountId), isInflow);
      // After account is set, linkedProvider will update → wallet effect fires → fills address
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerDefaults, watchCustomerId, watchCategory, editRecord]);

  // Contra account is always 2101 Customer Credit Balances — auto-assigned, never user-selectable
  const contraAccount2101 = useMemo(() =>
    coaAccounts?.find(a => a.code === "2101"),
    [coaAccounts]
  );

  // Currency is auto-derived from selected CoA account
  const accountCurrency = selectedCoaAccount?.currency ?? (isCash ? "YER" : "USDT");
  const appliedRate     = isInflow ? watchBuyRate : watchSellRate;

  // ── Spread calculation (for cash records) ─────────────────────────────────
  // Bank rate (CoA) = stored in bankRate field; system rate = buyRate/sellRate (execution, editable).
  // Spread fee ($) = difference between what the bank gives us vs what we charge the client.
  const spreadInfo = useMemo(() => {
    if (!isCash || !watchAmount || !appliedRate) return null;
    const amt       = parseFloat(watchAmount);
    const sysRate   = parseFloat(appliedRate);   // execution/system rate (charged to client)
    if (!amt || !sysRate) return null;
    const acctCur   = (selectedCoaAccount?.currency ?? "YER").toUpperCase();

    // Prefer the CoA bank rate stored in bankRate. Fall back to the exchange rates table.
    let bnkRate: number | null = watchBankRate ? parseFloat(watchBankRate) : null;
    if (!bnkRate) {
      const candidates = exchangeRates?.filter(r => r.fromCurrency?.toUpperCase() === acctCur) ?? [];
      const sr = candidates.find(r => r.buyRate || r.sellRate) ?? candidates[0];
      if (sr) bnkRate = isInflow ? parseFloat(String(sr.buyRate ?? 0)) : parseFloat(String(sr.sellRate ?? 0));
    }
    if (!bnkRate || bnkRate === sysRate) return null;

    // For inflow:  bank gives us (amount/bnkRate) USD. We credit client (amount/sysRate) USD.
    //   Spread = bank proceeds − client credit. Positive when bnkRate < sysRate (bank is more favorable to us).
    // For outflow: we charge client (amount/sysRate) USD. We pay bank (amount/bnkRate) USD.
    //   Spread = client charge − bank cost. Positive when bnkRate > sysRate.
    const bnkUsd = amt / bnkRate;
    const sysUsd = amt / sysRate;
    const spreadUsd = isInflow ? (bnkUsd - sysUsd) : (sysUsd - bnkUsd);
    return { mktRate: bnkRate, ourRate: sysRate, spreadUsd, acctCur };
  }, [isCash, watchAmount, appliedRate, watchBankRate, selectedCoaAccount, exchangeRates, isInflow]);

  const autoUsd = useMemo(() => {
    const amt  = parseFloat(watchAmount || "0");
    const rate = parseFloat(appliedRate  || "0");
    if (!amt || !rate || accountCurrency === "USD") return null;
    return (amt / rate).toFixed(4);
  }, [watchAmount, appliedRate, accountCurrency]);

  // ── Crypto fee breakdown (for crypto records when provider + amount are set) ──
  const cryptoFeeInfo = useMemo(() => {
    if (isCash || !watchAmount) return null;
    const amt     = parseFloat(watchAmount);
    if (!amt || isNaN(amt)) return null;
    const provDepRate = linkedProvider ? parseFloat(String(linkedProvider.depositFeeRate  ?? '0')) || 0 : 0;
    const provWdRate  = linkedProvider ? parseFloat(String(linkedProvider.withdrawFeeRate ?? '0')) || 0 : 0;
    const netFee  = linkedProvider ? parseFloat(String(linkedProvider.networkFeeUsd ?? '0')) || 0 : 0;
    const network = linkedProvider?.networkCode ?? '';
    // Per-record override takes priority over provider default
    const formFeeRate = parseFloat(watchServiceFeeRate || '0');
    const depRate = formFeeRate > 0 ? formFeeRate : provDepRate;
    const wdRate  = formFeeRate > 0 ? formFeeRate : provWdRate;
    if (isInflow) {
      const feeUsd  = amt * (wdRate / 100);
      return { feeRate: wdRate, feeUsd, networkFee: 0, network, netAmount: amt - feeUsd, mode: 'inflow' as const };
    } else {
      const feeUsd  = amt * (depRate / 100);
      return { feeRate: depRate, feeUsd, networkFee: netFee, network, netAmount: amt + feeUsd + netFee, mode: 'outflow' as const };
    }
  }, [isCash, linkedProvider, watchAmount, isInflow, watchServiceFeeRate]);

  const [feeCardDownloading, setFeeCardDownloading] = useState(false);
  const downloadFeeBreakdownCard = async () => {
    if (!cryptoFeeInfo || !editRecord) return;
    setFeeCardDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const NAVY = "#0f2057"; const GOLD = "#F5A623"; const PURPLE = "#6d28d9";
      const card = document.createElement("div");
      card.style.cssText = "position:fixed;left:-9999px;top:0;z-index:-1;width:400px;font-family:'Segoe UI',Arial,sans-serif;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.18);";
      const isOut = cryptoFeeInfo.mode === 'outflow';
      const amtDisplay = parseFloat(watchAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      card.innerHTML = `
        <div style="background:${NAVY};padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
          <div style="color:#fff;font-size:16px;font-weight:700;letter-spacing:0.5px;">Coin Cash</div>
          <div style="color:${GOLD};font-size:11px;font-weight:600;">ycoincash.com</div>
        </div>
        <div style="height:3px;background:${GOLD};"></div>
        <div style="padding:18px 20px 8px;">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Fee Breakdown</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
            <span style="font-size:18px;font-weight:800;color:${NAVY};">${isOut ? "Crypto Withdrawal" : "Crypto Deposit"}</span>
            ${cryptoFeeInfo.network ? `<span style="background:#ede9fe;color:${PURPLE};border:1px solid #c4b5fd;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;font-family:monospace;">${cryptoFeeInfo.network}</span>` : ""}
          </div>
          <div style="background:#f8f7ff;border-radius:8px;border:1px solid #e0d9ff;overflow:hidden;">
            <div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e0d9ff;">
              <span style="color:#444;font-size:13px;">${isOut ? "Amount to send" : "Amount received"}</span>
              <span style="font-weight:700;font-family:monospace;color:${NAVY};font-size:13px;">${amtDisplay} USDT</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e0d9ff;background:#fffbf0;">
              <span style="color:#b45309;font-size:13px;">${isOut ? `Service fee (${cryptoFeeInfo.feeRate}%)` : `Withdraw fee (${cryptoFeeInfo.feeRate}%)`}</span>
              <span style="font-weight:600;font-family:monospace;color:#b45309;font-size:13px;">${isOut ? "+" : "−"}$${cryptoFeeInfo.feeUsd.toFixed(4)}</span>
            </div>
            ${isOut && cryptoFeeInfo.networkFee > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e0d9ff;background:#fdf4ff;">
              <span style="color:#7c3aed;font-size:13px;">Network / gas fee</span>
              <span style="font-weight:600;font-family:monospace;color:#7c3aed;font-size:13px;">+$${cryptoFeeInfo.networkFee.toFixed(4)}</span>
            </div>` : ""}
            <div style="display:flex;justify-content:space-between;padding:12px 14px;background:${isOut ? "#fff7ed" : "#f0fdf4"};">
              <span style="font-weight:700;font-size:13px;color:${isOut ? "#c2410c" : "#15803d"};">${isOut ? "Total customer charge" : "Net credit to customer"}</span>
              <span style="font-weight:800;font-family:monospace;font-size:15px;color:${isOut ? "#c2410c" : "#15803d"};">$${cryptoFeeInfo.netAmount.toFixed(4)}</span>
            </div>
          </div>
          <div style="margin-top:12px;font-size:10px;color:#aaa;font-family:monospace;">${editRecord.recordNumber} · ${new Date().toLocaleDateString()}</div>
        </div>
        <div style="height:3px;background:${GOLD};"></div>`;
      document.body.appendChild(card);
      await new Promise(r => setTimeout(r, 300));
      const canvas = await html2canvas(card, { scale: 2, backgroundColor: "#ffffff", logging: false });
      const link = document.createElement("a");
      link.download = `${editRecord.recordNumber}-fee-breakdown.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      document.body.removeChild(card);
    } catch (e) { console.error("Fee card download failed", e); }
    finally { setFeeCardDownloading(false); }
  };

  const mutation = useMutation({
    mutationFn: (data: RecordForm) => {
      const { category, coaAccountId, buyRate, sellRate, contraAccountId: _unused, contraAccountName: _unusedName, ...rest } = data;

      // Terminal stages (confirmed / used / cancelled): send only non-financial fields
      if (editRecord && isTerminalStage) {
        return apiRequest("PATCH", `/api/records/${editRecord.id}`, {
          customerId:            rest.customerId || undefined,
          clientSenderName:      rest.clientSenderName || undefined,
          clientRecipientName:   rest.clientRecipientName || undefined,
          clientName:            rest.clientName || undefined,
          notes:                 rest.notes || undefined,
          txidOrReferenceNumber: rest.txidOrReferenceNumber || undefined,
          blockNumberOrBatchId:  rest.blockNumberOrBatchId || undefined,
          networkOrId:           rest.networkOrId || undefined,
          assetOrProviderName:   rest.assetOrProviderName || undefined,
          isWhitelisted:         rest.isWhitelisted ?? false,
        });
      }
      // Recorded stage (regardless of whether customer is linked): full edit of all fields
      // "Matched" is not a stage; it is customerId IS NOT NULL.
      if (editRecord && isInRecordedStage) {
        return apiRequest("PATCH", `/api/records/${editRecord.id}`, {
          customerId:            rest.customerId || undefined,
          clientSenderName:      rest.clientSenderName || undefined,
          clientRecipientName:   rest.clientRecipientName || undefined,
          clientName:            rest.clientName || undefined,
          amount:                rest.amount,
          currency:              rest.currency,
          exchangeRate:          rest.exchangeRate || undefined,
          buyRate:               buyRate  || undefined,
          sellRate:              sellRate || undefined,
          bankRate:              rest.bankRate || undefined,
          serviceFeeRate:        rest.serviceFeeRate || undefined,
          expenseUsd:            rest.expenseUsd || undefined,
          accountId:             rest.accountId || undefined,
          accountName:           rest.accountName || undefined,
          accountCurrency:       rest.accountCurrency || undefined,
          accountField:          rest.accountField || undefined,
          contraAccountId:       rest.contraAccountId || undefined,
          contraAccountName:     rest.contraAccountName || undefined,
          assetOrProviderName:   rest.assetOrProviderName || undefined,
          networkOrId:           rest.networkOrId || undefined,
          isWhitelisted:         rest.isWhitelisted ?? false,
          notes:                 rest.notes || undefined,
          txidOrReferenceNumber: rest.txidOrReferenceNumber || undefined,
          blockNumberOrBatchId:  rest.blockNumberOrBatchId || undefined,
        });
      }

      const def          = RECORD_TYPES[category];
      const inflowDir    = def.direction === "inflow";
      const selectedAcct = coaAccounts?.find(a => String(a.id) === coaAccountId);
      const prov         = selectedAcct?.providerId ? providerMap[selectedAcct.providerId] : undefined;
      const acctCurrency = selectedAcct?.currency ?? (def.type === "cash" ? "YER" : "USDT");
      const appliedRate  = inflowDir ? buyRate : sellRate;
      const computedUsd  = acctCurrency !== "USD" && appliedRate
        ? (parseFloat(rest.amount) / parseFloat(appliedRate)).toFixed(4)
        : undefined;
      // Contra starts as 2101 "Customer Credits - Unmatched". The server updates it
      // automatically when a customer is linked (to customer's name) and at confirmation.
      const payload = {
        ...rest,
        type:      def.type,
        direction: def.direction,
        currency:  acctCurrency,
        buyRate:   buyRate  || undefined,
        sellRate:  sellRate || undefined,
        bankRate:  rest.bankRate || undefined,
        exchangeRate: appliedRate || undefined,
        serviceFeeRate: rest.serviceFeeRate || undefined,
        expenseUsd: rest.expenseUsd || undefined,
        usdEquivalent: computedUsd ?? rest.usdEquivalent,
        customerId: rest.customerId || undefined,
        accountId: coaAccountId || undefined,
        accountName:         selectedAcct ? selectedAcct.name : rest.accountName,
        contraAccountId:   contraAccount2101 ? String(contraAccount2101.id) : undefined,
        contraAccountName: contraAccount2101?.name ?? "Customer Credit Balances",
        assetOrProviderName: prov ? prov.name : rest.assetOrProviderName,
        networkOrId:         rest.networkOrId || undefined,
        isWhitelisted:       rest.isWhitelisted ?? false,
        blockNumberOrBatchId: rest.blockNumberOrBatchId || undefined,
      };
      if (editRecord) return apiRequest("PATCH", `/api/records/${editRecord.id}`, payload);
      return apiRequest("POST", "/api/records", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/records"] });
      toast({ title: editRecord ? "Record updated" : "Record created" });
      onCancel();
      form.reset({ category: defaultCategory ?? "cash_inflow", processingStage: "draft" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Confirm to Ledger mutation ────────────────────────────────────────────
  // Saves any pending form edits (customer, serviceFeeRate) before advancing stage.
  const confirmMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Save customer if changed in form but not yet stored on record
      const customerNeedsSave = watchCustomerId && watchCustomerId !== editRecord?.customerId;
      if (customerNeedsSave) {
        await apiRequest("PATCH", `/api/records/${editRecord!.id}`, { customerId: watchCustomerId });
      }
      // Step 2: Save serviceFeeRate if the user edited it in the form (crypto records only)
      const formFeeRate = form.getValues("serviceFeeRate");
      const storedFeeRate = String(editRecord?.serviceFeeRate ?? "");
      const feeRateChanged = formFeeRate && formFeeRate !== storedFeeRate && !isCash;
      if (feeRateChanged) {
        await apiRequest("PATCH", `/api/records/${editRecord!.id}`, { serviceFeeRate: formFeeRate });
      }
      return apiRequest("PATCH", `/api/records/${editRecord!.id}`, { processingStage: "confirmed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/records"] });
      toast({ title: "Record confirmed", description: "Revenue & expense journal entries have been posted to the ledger." });
      onCancel();
    },
    onError: (e: any) => toast({ title: "Confirmation failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col h-full overflow-auto px-4 py-3 max-w-3xl w-full">
      <div className="flex items-center gap-2 mb-3">
        <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-back-record" className="h-7 px-2">
          <ArrowLeft className="w-3.5 h-3.5" />
        </Button>
        <FileText className="w-4 h-4 text-primary shrink-0" />
        <h1 className="text-sm font-bold">
          {editRecord ? `${editRecord.recordNumber}` : "New Record"}
        </h1>
      </div>

        {editRecord && editRecord.processingStage !== "draft" && (
          <div className={`rounded-md border px-3 py-1.5 flex items-center gap-2 mb-2 text-xs font-medium ${
            isTerminalStage
              ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 text-amber-800 dark:text-amber-300"
              : isMatched
                ? "border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700/50 text-blue-800 dark:text-blue-300"
                : "border-sky-300 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-700/50 text-sky-800 dark:text-sky-300"
          }`}>
            {isTerminalStage ? <Lock className="w-3.5 h-3.5 shrink-0" /> : isMatched ? <Zap className="w-3.5 h-3.5 shrink-0" /> : <FileText className="w-3.5 h-3.5 shrink-0" />}
            {isTerminalStage
              ? (editRecord.processingStage === "confirmed" ? "Confirmed — read-only" : editRecord.processingStage === "cancelled" ? "Cancelled — read-only" : "Used — read-only")
              : isMatched ? "Recorded & Matched — editable, confirm when ready" : "Recorded — link customer to match"}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-2">

            {!editRecord && (
              <div>
                <p className="text-xs font-semibold mb-1 text-foreground">Type *</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.entries(RECORD_TYPES) as [RecordCategory, typeof RECORD_TYPES[RecordCategory]][]).map(([key, def]) => {
                    const Icon = def.icon;
                    return (
                      <button key={key} type="button"
                        onClick={() => {
                          form.setValue("category", key);
                          form.setValue("coaAccountId", "");
                          form.setValue("buyRate", "");
                          form.setValue("sellRate", "");
                          form.setValue("serviceFeeRate", "");
                        }}
                        data-testid={`option-record-type-${key}`}
                        className={`px-2 py-1.5 rounded-md border-2 transition-all flex items-center gap-1.5 ${watchCategory === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${def.color} shrink-0`} />
                        <span className="text-[11px] font-semibold truncate">{def.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Customer — searchable combobox */}
            <FormField control={form.control} name="customerId" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />Customer
                  {field.value && (
                    <button type="button" onClick={() => { field.onChange(""); setCustomerSearch(""); }}
                      className="ml-auto text-muted-foreground hover:text-foreground transition-colors" title="Clear customer">
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </FormLabel>
                <div className="relative" ref={customerDropdownRef}>
                  <FormControl>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        ref={customerInputRef}
                        type="text"
                        placeholder="Search by name, ID, or phone…"
                        value={customerSearch}
                        autoComplete="off"
                        data-testid="input-customer-search"
                        className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); if (filteredCustomers.length > 0) { field.onChange(filteredCustomers[0].id); setCustomerSearch(filteredCustomers[0].fullName); setCustomerDropdownOpen(false); } }
                          if (e.key === "Escape") setCustomerDropdownOpen(false);
                        }}
                        onFocus={() => setCustomerDropdownOpen(true)}
                        onChange={e => {
                          setCustomerSearch(e.target.value);
                          setCustomerDropdownOpen(true);
                          if (!e.target.value) field.onChange("");
                        }}
                        onBlur={() => setTimeout(() => setCustomerDropdownOpen(false), 150)}
                      />
                    </div>
                  </FormControl>
                  {customerDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-md overflow-hidden">
                      <div className="max-h-52 overflow-y-auto">
                        {/* Clear / Unmatched option */}
                        <button type="button"
                          onMouseDown={() => { field.onChange(""); setCustomerSearch(""); setCustomerDropdownOpen(false); }}
                          className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted flex items-center gap-2 border-b border-border">
                          <XCircle className="w-3 h-3" />— Unmatched / Unknown —
                        </button>
                        {filteredCustomers.length === 0 ? (
                          <p className="px-3 py-3 text-xs text-muted-foreground text-center">No customers found</p>
                        ) : filteredCustomers.map(c => (
                          <button key={c.id} type="button"
                            onMouseDown={() => { field.onChange(c.id); setCustomerSearch(c.fullName); setCustomerDropdownOpen(false); }}
                            className={`w-full text-left px-3 py-2 hover:bg-muted transition-colors ${field.value === c.id ? "bg-primary/10" : ""}`}
                            data-testid={`customer-option-${c.id}`}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                <User className="w-3 h-3 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground truncate">{c.fullName}</p>
                                <p className="text-[10px] text-muted-foreground">{c.customerId} · {c.phonePrimary}</p>
                              </div>
                              {field.value === c.id && <span className="ml-auto text-primary text-[10px] font-bold shrink-0">Selected</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {field.value && selectedCustomer && !customerDropdownOpen && (
                    <div className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded bg-primary/8 border border-primary/20 text-[11px]">
                      <User className="w-2.5 h-2.5 text-primary shrink-0" />
                      <span className="font-medium">{selectedCustomer.fullName}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">{selectedCustomer.customerId}</span>
                      {groupOverrides?.group && (
                        <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: `${groupOverrides.group.color}22`, color: groupOverrides.group.color, border: `1px solid ${groupOverrides.group.color}44` }}>
                          {groupOverrides.group.name}
                        </span>
                      )}
                    </div>
                  )}
                  {isSuspended && (
                    <div className="mt-1 flex items-center gap-1.5 px-2 py-1.5 rounded bg-destructive/10 border border-destructive/30 text-destructive text-[11px] font-medium" data-testid="banner-suspended-customer">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Customer is suspended — record creation is blocked.
                    </div>
                  )}
                </div>
              </FormItem>
            )} />

            {/* Account + Amount + Currency + Rate + ≈USD + Fee — inline row */}
            <div className="flex items-end gap-2 flex-wrap">
              <FormField control={form.control} name="coaAccountId" render={({ field }) => (
                <FormItem className="min-w-[180px] flex-[2]">
                  <FormLabel>
                    {isInflow
                      ? (isCash ? "Receiving Account" : "Receiving Wallet")
                      : (isCash ? "Sending Account" : "Sending Wallet")}
                    {" "}*
                  </FormLabel>
                  <Select
                    onValueChange={v => { const id = v === "none" ? "" : v; field.onChange(id); if (id) applyRateForAccount(id, isInflow); }}
                    value={field.value || "none"}
                    disabled={isAmountLocked}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-coa-account" className="h-9 text-sm">
                        <SelectValue placeholder={isCash ? "Select bank / cash…" : "Select wallet…"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">— None / Manual —</SelectItem>
                      {filteredCoaAccounts.map(a => {
                        const p = a.providerId ? providerMap[a.providerId] : undefined;
                        return <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}{p ? ` (${p.name})` : ""}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem className="min-w-[90px] flex-1">
                  <FormLabel>Amount *</FormLabel>
                  <FormControl><Input type="number" step="any" placeholder="0.00" {...field} disabled={isAmountLocked} data-testid="input-amount" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="shrink-0 pb-0.5">
                <div className="h-9 flex items-center px-3 rounded-md border border-primary/30 bg-primary/5 text-sm font-semibold text-primary min-w-[56px] justify-center"
                  data-testid="badge-account-currency">
                  {accountCurrency}
                </div>
              </div>
              {isCash && accountCurrency !== "USD" && (
                isInflow ? (
                  <FormField control={form.control} name="buyRate" render={({ field }) => (
                    <FormItem className="w-[120px]">
                      <FormLabel className="text-green-700 dark:text-green-400 font-semibold flex items-center gap-1">
                        Buy <InfoTip text={`${accountCurrency}/USD rate`} />
                      </FormLabel>
                      <FormControl>
                        <Input type="number" step="any" placeholder="e.g. 530"
                          name={field.name} ref={field.ref} onBlur={field.onBlur}
                          onChange={e => { userEditedRateRef.current = true; field.onChange(e); }}
                          value={watchBuyRate}
                          disabled={isRateLocked}
                          className="border-green-400 focus-visible:ring-green-400"
                          data-testid="input-buy-rate" />
                      </FormControl>
                    </FormItem>
                  )} />
                ) : (
                  <FormField control={form.control} name="sellRate" render={({ field }) => (
                    <FormItem className="w-[120px]">
                      <FormLabel className="text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-1">
                        Sell <InfoTip text={`${accountCurrency}/USD rate`} />
                      </FormLabel>
                      <FormControl>
                        <Input type="number" step="any" placeholder="e.g. 540"
                          name={field.name} ref={field.ref} onBlur={field.onBlur}
                          onChange={e => { userEditedRateRef.current = true; field.onChange(e); }}
                          value={watchSellRate}
                          disabled={isRateLocked}
                          className="border-blue-400 focus-visible:ring-blue-400"
                          data-testid="input-sell-rate" />
                      </FormControl>
                    </FormItem>
                  )} />
                )
              )}
              {isCash && accountCurrency !== "USD" && (
                <div className="shrink-0 pb-0.5">
                  <p className="text-[10px] font-medium text-muted-foreground mb-0.5">≈ USD</p>
                  <div className="h-9 flex items-center px-3 rounded-md border border-border bg-muted/40 text-sm min-w-[80px]">
                    {autoUsd
                      ? <span className="font-semibold">${parseFloat(autoUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </div>
                </div>
              )}
              {!isCash && (
                <FormField control={form.control} name="serviceFeeRate" render={({ field }) => (
                  <FormItem className="w-[120px]">
                    <FormLabel className="text-purple-700 dark:text-purple-400 font-semibold flex items-center gap-1">
                      Fee % <InfoTip text="Override provider's default service fee" />
                    </FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" max="100"
                        placeholder={linkedProvider
                          ? `${isInflow ? linkedProvider.withdrawFeeRate : linkedProvider.depositFeeRate}%`
                          : "1.5"}
                        name={field.name} ref={field.ref} onBlur={field.onBlur}
                        value={field.value ?? ""}
                        onChange={e => { userEditedFeeRef.current = true; field.onChange(e); }}
                        disabled={isRateLocked}
                        className="border-purple-400 focus-visible:ring-purple-400"
                        data-testid="input-service-fee-rate" />
                    </FormControl>
                  </FormItem>
                )} />
              )}
            </div>
            {isCash && accountCurrency !== "USD" && isInflow && watchBankRate && watchBuyRate && watchBankRate !== watchBuyRate && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 -mt-1">
                <Zap className="w-2.5 h-2.5" />Spread: bank {parseFloat(watchBankRate).toLocaleString()}
              </p>
            )}
            {isCash && accountCurrency !== "USD" && !isInflow && watchBankRate && watchSellRate && watchBankRate !== watchSellRate && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 -mt-1">
                <Zap className="w-2.5 h-2.5" />Spread: bank {parseFloat(watchBankRate).toLocaleString()}
              </p>
            )}
            {!isCash && watchServiceFeeRate && (
              <p className="text-[10px] text-purple-600 dark:text-purple-400 flex items-center gap-1 -mt-1">
                <Zap className="w-2.5 h-2.5" />Custom fee override
              </p>
            )}

            {spreadInfo && (
              <div className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] border ${
                spreadInfo.spreadUsd >= 0
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300"
                  : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300"
              }`} data-testid="panel-spread-preview">
                <TrendingUp className="w-3 h-3 shrink-0" />
                <span>Spread: Bank {spreadInfo.mktRate.toLocaleString()} vs System {spreadInfo.ourRate.toLocaleString()} {spreadInfo.acctCur} →{" "}
                  <span className="font-semibold font-mono">{spreadInfo.spreadUsd >= 0 ? "+" : ""}${Math.abs(spreadInfo.spreadUsd).toFixed(2)}</span>
                  {spreadInfo.spreadUsd < 0 && <span className="ml-1 text-amber-600 dark:text-amber-400">(loss)</span>}
                </span>
              </div>
            )}

            {/* ── Confirmed Fee Summary (terminal stage) — reads stored DB columns ── */}
            {isTerminalStage && editRecord && (editRecord.serviceFeeUsd || editRecord.spreadUsd || editRecord.networkFeeUsd || (editRecord as any).expenseUsd) && (() => {
              const principal   = editRecord.usdEquivalent ? parseFloat(editRecord.usdEquivalent) : null;
              const svcFeeUsd   = editRecord.serviceFeeUsd  ? parseFloat(editRecord.serviceFeeUsd)  : null;
              const svcFeeRate  = editRecord.serviceFeeRate  ? parseFloat(editRecord.serviceFeeRate) : null;
              const gasUsd      = editRecord.networkFeeUsd   ? parseFloat(editRecord.networkFeeUsd)  : null;
              const sprdUsd     = editRecord.spreadUsd       ? parseFloat(editRecord.spreadUsd)      : null;
              const expenseUsdVal = (editRecord as any).expenseUsd ? parseFloat((editRecord as any).expenseUsd) : null;
              // Bank rate and system rate (for spread context display)
              const bnkRate     = (editRecord as any).bankRate  ? parseFloat((editRecord as any).bankRate) : null;
              const sysRate     = editRecord.direction === 'inflow'
                ? ((editRecord as any).buyRate  ? parseFloat((editRecord as any).buyRate)  : null)
                : ((editRecord as any).sellRate ? parseFloat((editRecord as any).sellRate) : null);
              const isCryptoRec = editRecord.type === 'crypto';
              const isInflowRec = editRecord.direction === 'inflow';
              return (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 text-xs" data-testid="panel-confirmed-fee-summary">
                  <div className="font-semibold text-emerald-800 dark:text-emerald-300 mb-1.5 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Confirmed Fee Summary
                    <span className="text-emerald-600 dark:text-emerald-400 font-normal text-[10px]">(stored at confirmation)</span>
                  </div>
                  <div className="space-y-0.5 text-emerald-900 dark:text-emerald-200">
                    {principal !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Principal (USD)</span>
                        <span className="font-mono font-semibold">${principal.toFixed(4)}</span>
                      </div>
                    )}
                    {isCryptoRec && svcFeeUsd !== null && (
                      <div className="flex justify-between text-amber-700 dark:text-amber-400">
                        <span>Service Fee ({svcFeeRate !== null ? svcFeeRate.toFixed(2) + "%" : "—"}) <span className="text-[9px] bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 rounded px-1">REVENUE · 4101</span></span>
                        <span className="font-mono">+${svcFeeUsd.toFixed(4)}</span>
                      </div>
                    )}
                    {isCryptoRec && gasUsd !== null && gasUsd > 0 && (
                      <div className="flex justify-between text-purple-700 dark:text-purple-400">
                        <span>Network / Gas Fee <span className="text-[9px] bg-purple-100 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-700 rounded px-1">REVENUE · 4301</span></span>
                        <span className="font-mono">+${gasUsd.toFixed(4)}</span>
                      </div>
                    )}
                    {!isCryptoRec && bnkRate !== null && sysRate !== null && (
                      <div className="flex justify-between text-muted-foreground text-[10px]">
                        <span>{isInflowRec ? "Bank buy rate (CoA)" : "Bank sell rate (CoA)"}</span>
                        <span className="font-mono">{bnkRate.toLocaleString()} {editRecord.currency}/USD</span>
                      </div>
                    )}
                    {!isCryptoRec && sysRate !== null && (
                      <div className="flex justify-between text-muted-foreground text-[10px]">
                        <span>{isInflowRec ? "System rate (charged to client)" : "System rate (charged to client)"}</span>
                        <span className="font-mono">{sysRate.toLocaleString()} {editRecord.currency}/USD</span>
                      </div>
                    )}
                    {!isCryptoRec && sprdUsd !== null && (
                      <div className="flex justify-between text-blue-700 dark:text-blue-400">
                        <span>Spread Fee <span className="text-[9px] bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 rounded px-1">REVENUE · 4201</span></span>
                        <span className="font-mono">+${sprdUsd.toFixed(4)}</span>
                      </div>
                    )}
                    {expenseUsdVal !== null && expenseUsdVal > 0 && (
                      <div className="flex justify-between text-rose-700 dark:text-rose-400">
                        <span>Supplier Expense <span className="text-[9px] bg-rose-100 dark:bg-rose-900/40 border border-rose-200 dark:border-rose-700 rounded px-1">EXPENSE · 5201</span></span>
                        <span className="font-mono">-${expenseUsdVal.toFixed(4)}</span>
                      </div>
                    )}
                    {isCryptoRec && svcFeeUsd !== null && principal !== null && (
                      <div className={`flex justify-between pt-1 border-t border-emerald-200 dark:border-emerald-700 font-semibold ${isInflowRec ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-400"}`}>
                        <span>{isInflowRec ? "Net settled to customer" : "Total charged to customer"}</span>
                        <span className="font-mono">
                          {isInflowRec
                            ? `$${(principal - svcFeeUsd).toFixed(4)}`
                            : `$${(principal + svcFeeUsd + (gasUsd ?? 0)).toFixed(4)}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Accounting toggle ── */}
            <button
              type="button"
              onClick={() => setShowAccounting(v => !v)}
              data-testid="button-toggle-accounting"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-start"
            >
              {showAccounting ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showAccounting ? "Hide" : "Show"} fee breakdown &amp; accounting
            </button>

            {showAccounting && <>

            {/* ── Crypto Fee Breakdown (crypto only, when provider + amount set) ── */}
            {cryptoFeeInfo && !isTerminalStage && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs border bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 text-purple-800 dark:text-purple-300" data-testid="panel-crypto-fee-preview">
                <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div className="space-y-1 w-full">
                  <div className="font-semibold flex items-center gap-2 justify-between w-full">
                    <div className="flex items-center gap-2">
                      Fee Breakdown
                      {cryptoFeeInfo.network && (
                        <span className="font-mono font-normal bg-purple-100 dark:bg-purple-800/40 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-600 rounded px-1.5 py-0.5">{cryptoFeeInfo.network}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={downloadFeeBreakdownCard}
                      disabled={feeCardDownloading}
                      data-testid="button-download-fee-breakdown"
                      title="Download fee breakdown card to share with client"
                      className="flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 text-xs font-normal border border-purple-300 dark:border-purple-600 rounded px-2 py-0.5 hover:bg-purple-100 dark:hover:bg-purple-800/40 transition-colors disabled:opacity-50"
                    >
                      {feeCardDownloading
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Download className="w-3 h-3" />}
                      Share
                    </button>
                  </div>
                  {cryptoFeeInfo.mode === 'outflow' ? (
                    <div className="space-y-0.5">
                      <div className="flex justify-between">
                        <span>Amount to send</span>
                        <span className="font-mono font-semibold">{parseFloat(watchAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Service fee ({cryptoFeeInfo.feeRate}%)</span>
                        <span className="font-mono">+${cryptoFeeInfo.feeUsd.toFixed(4)}</span>
                      </div>
                      {cryptoFeeInfo.networkFee > 0 && (
                        <div className="flex justify-between">
                          <span>Network / gas fee</span>
                          <span className="font-mono">+${cryptoFeeInfo.networkFee.toFixed(4)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1 border-t border-purple-200 dark:border-purple-700 font-semibold">
                        <span>Total customer charge</span>
                        <span className="font-mono">${cryptoFeeInfo.netAmount.toFixed(4)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <div className="flex justify-between">
                        <span>Amount received</span>
                        <span className="font-mono font-semibold">{parseFloat(watchAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Withdraw fee ({cryptoFeeInfo.feeRate}%)</span>
                        <span className="font-mono">−${cryptoFeeInfo.feeUsd.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-purple-200 dark:border-purple-700 font-semibold">
                        <span>Net credit to customer</span>
                        <span className="font-mono">${cryptoFeeInfo.netAmount.toFixed(4)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Double-Entry Accounting ── */}
            <div className="rounded-lg border-2 border-primary/20 bg-primary/3 overflow-hidden">
              <div className="px-3 py-2 bg-primary/10 border-b border-primary/20 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-wide">Double-Entry Accounts</span>
              </div>

              <div className="p-3 space-y-3">
                {/* Debit Account (left side) */}
                <div className={`rounded-md border-l-4 ${isInflow ? "border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-l-orange-400 bg-orange-50/50 dark:bg-orange-900/10"} p-2.5`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isInflow ? "bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200" : "bg-orange-200 text-orange-800 dark:bg-orange-800 dark:text-orange-200"}`}>DR</span>
                    <span className="text-xs font-semibold text-foreground">
                      {isInflow
                        ? (isCash ? "Our Bank Account receives cash" : "Our Wallet receives crypto")
                        : "Customer Payable / Liability reduces"}
                    </span>
                  </div>

                  {isInflow ? (
                    /* Inflow debit = our asset account — selected above beside Amount */
                    selectedCoaAccount ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">{selectedCoaAccount.code}</span>
                        <span className="font-medium text-foreground">{selectedCoaAccount.name}</span>
                        {selectedCoaAccount.currency && <Badge variant="outline" className="text-[10px] h-4 px-1">{selectedCoaAccount.currency}</Badge>}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400 italic">← Select an account above (beside Amount)</p>
                    )
                  ) : (
                    /* Outflow debit — customer if known, else 2101 pool */
                    <ContraPartyBadge customer={selectedCustomer} contra2101={contraAccount2101} />
                  )}
                </div>

                {/* Credit Account (right side) */}
                <div className={`rounded-md border-l-4 ${isInflow ? "border-l-blue-400 bg-blue-50/50 dark:bg-blue-900/10" : "border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10"} p-2.5`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isInflow ? "bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200" : "bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200"}`}>CR</span>
                    <span className="text-xs font-semibold text-foreground">
                      {isInflow
                        ? "Customer Payable / Liability increases"
                        : (isCash ? "Our Bank Account pays out" : "Our Wallet sends crypto")}
                    </span>
                  </div>

                  {isInflow ? (
                    /* Inflow credit — customer if known, else 2101 pool */
                    <ContraPartyBadge customer={selectedCustomer} contra2101={contraAccount2101} />
                  ) : (
                    /* Outflow credit = our asset account — selected above beside Amount */
                    selectedCoaAccount ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">{selectedCoaAccount.code}</span>
                        <span className="font-medium text-foreground">{selectedCoaAccount.name}</span>
                        {selectedCoaAccount.currency && <Badge variant="outline" className="text-[10px] h-4 px-1">{selectedCoaAccount.currency}</Badge>}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400 italic">← Select an account above (beside Amount)</p>
                    )
                  )}
                </div>

                {/* Provider badge + Our account identifier */}
                {linkedProvider && (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-primary/5 border border-primary/20 text-xs">
                    <Network className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="font-medium text-primary">{linkedProvider.name}</span>
                    <span className="font-mono bg-background border border-border rounded px-1 py-0.5 text-muted-foreground">{linkedProvider.code}</span>
                    <span className="text-muted-foreground">· {linkedProvider.fieldName}</span>
                  </div>
                )}

              </div>
            </div>

            </>}

            {/* ═══ TRANSACTION DETAILS ═══ */}
            {/* Cash — sender/recipient + reference inline */}
            {isCash && (
              <div className="grid grid-cols-2 gap-2">
                {isInflow ? (
                  <FormField control={form.control} name="clientSenderName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">Sender <InfoTip text="Name on bank transfer" /></FormLabel>
                      <FormControl><Input placeholder="Sender name" {...field} /></FormControl>
                    </FormItem>
                  )} />
                ) : (
                  <>
                    <FormField control={form.control} name="clientRecipientName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recipient</FormLabel>
                        <FormControl><Input placeholder="Customer name" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="networkOrId" render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>{linkedProvider ? linkedProvider.fieldName : "Account / IBAN"}</FormLabel>
                          {watchNetworkOrId && watchCustomerId && (
                            isAddressInWhitelist
                              ? <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />OK</span>
                              : <button type="button" onClick={() => saveToWhitelistMutation.mutate({ customerId: watchCustomerId, addressOrId: watchNetworkOrId, providerName: linkedProvider?.name ?? "Bank", type: "cash", direction: "outflow" })} className="text-[10px] text-primary hover:underline flex items-center gap-0.5" disabled={saveToWhitelistMutation.isPending} data-testid="button-save-whitelist-cash"><BookmarkPlus className="w-2.5 h-2.5" />Save</button>
                          )}
                        </div>
                        <FormControl><Input placeholder="Account or IBAN" {...field} className="font-mono text-xs" /></FormControl>
                      </FormItem>
                    )} />
                  </>
                )}
                <FormField control={form.control} name="txidOrReferenceNumber" render={({ field }) => (
                  <FormItem className={isInflow ? "" : "col-span-2"}>
                    <FormLabel className="flex items-center gap-1">Reference <InfoTip text="Bank transfer reference" /></FormLabel>
                    <FormControl><Input placeholder="Reference / op number" {...field} className="font-mono text-xs" /></FormControl>
                  </FormItem>
                )} />
              </div>
            )}

            {/* Crypto — platform/destination + TX hash inline */}
            {!isCash && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {isInflow ? (
                    <FormField control={form.control} name="clientSenderName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">From <InfoTip text="Exchange or platform they sent from" /></FormLabel>
                        <FormControl><Input placeholder="Platform name" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  ) : (
                    <>
                      <FormField control={form.control} name="clientRecipientName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Recipient</FormLabel>
                          <FormControl><Input placeholder="Customer name" {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="networkOrId" render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel className="flex items-center gap-1">Destination <InfoTip text={linkedProvider ? linkedProvider.fieldName : "Wallet or platform ID"} /></FormLabel>
                            {watchNetworkOrId && watchCustomerId && (
                              isAddressInWhitelist
                                ? <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />OK</span>
                                : <button type="button" onClick={() => saveToWhitelistMutation.mutate({ customerId: watchCustomerId, addressOrId: watchNetworkOrId, providerName: linkedProvider?.name ?? "Crypto", type: "crypto", direction: "outflow" })} className="text-[10px] text-primary hover:underline flex items-center gap-0.5" disabled={saveToWhitelistMutation.isPending} data-testid="button-save-whitelist-crypto"><BookmarkPlus className="w-2.5 h-2.5" />Save</button>
                            )}
                          </div>
                          <FormControl><Input placeholder={linkedProvider?.fieldType === "address" ? "0x…" : "Platform ID"} {...field} className="font-mono text-xs" /></FormControl>
                        </FormItem>
                      )} />
                    </>
                  )}
                  <FormField control={form.control} name="txidOrReferenceNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">TX Hash <InfoTip text="Blockchain transaction hash" /></FormLabel>
                      <FormControl><Input placeholder="0x…" {...field} className="font-mono text-xs" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="blockNumberOrBatchId" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">Block <InfoTip text="Block number or batch ID" /></FormLabel>
                      <FormControl><Input placeholder="Block #" {...field} className="font-mono text-xs" /></FormControl>
                    </FormItem>
                  )} />
                </div>
                {!isInflow && watchNetworkOrId && watchCustomerId && (
                  <div className="flex items-center gap-2 text-xs">
                    <FormField control={form.control} name="isWhitelisted" render={({ field }) => (
                      <FormItem className="flex items-center gap-1.5 space-y-0">
                        <input type="checkbox" id="isWhitelisted" checked={isAddressInWhitelist || (field.value ?? false)} onChange={e => field.onChange(e.target.checked)} className="w-3.5 h-3.5 accent-primary" data-testid="checkbox-is-whitelisted" />
                        <label htmlFor="isWhitelisted" className="text-xs font-medium cursor-pointer select-none">Whitelisted</label>
                      </FormItem>
                    )} />
                    {isAddressInWhitelist && <span className="text-emerald-600 text-[10px]">Auto-filled from whitelist</span>}
                  </div>
                )}
              </div>
            )}

            {/* ── Optional fields — collapsible ── */}
            <div className="border border-dashed border-border rounded-md">
              <button
                type="button"
                onClick={() => setShowOptionals(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors rounded-md"
                data-testid="button-toggle-optionals"
              >
                <span className="font-medium">Optional fields</span>
                <span className="flex items-center gap-1">
                  {showOptionals ? "Hide" : "Show"}
                  {showOptionals ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </span>
              </button>
              {showOptionals && (
                <div className="px-3 pb-3 space-y-3 border-t border-dashed border-border pt-3">
                  {/* Supplier Expense */}
                  <FormField control={form.control} name="expenseUsd" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1">
                        Expense ($) <InfoTip text="Cost paid to exchange/supplier · ledgered to 5201 on confirmation" />
                      </FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} disabled={isRateLocked}
                            className="border-rose-300 focus-visible:ring-rose-400" data-testid="input-expense-usd" />
                        </FormControl>
                        <span className="text-sm font-semibold text-rose-700 dark:text-rose-300 shrink-0">USD</span>
                      </div>
                    </FormItem>
                  )} />
                  {/* Bank / Service name */}
                  <FormField control={form.control} name="assetOrProviderName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs flex items-center gap-1">
                        {isCash
                          ? (isInflow ? "Sender Bank" : "Our Bank")
                          : (isInflow ? "Sender Platform" : "Our Platform")}
                        <InfoTip text={isCash ? "Bank or transfer service name" : "Exchange or platform name"} />
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={isCash
                            ? (isInflow ? "e.g. Kuraimi Bank, Western Union…" : "e.g. Kuraimi Bank, STC Pay, Hawala agent…")
                            : (isInflow ? "e.g. Binance, MEXC…" : "e.g. MEXC, OKX…")}
                          {...field}
                          data-testid="input-asset-provider-name"
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  {/* Our account / wallet identifier */}
                  <FormField control={form.control} name="accountField" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs flex items-center gap-1">
                        {isCash
                          ? (isInflow ? "Our Account" : "Our Account")
                          : (isInflow ? "Our Wallet" : "Our Wallet")}
                        <InfoTip text={isCash ? "Our receiving/sending account number or IBAN" : linkedProvider ? `Our ${linkedProvider.fieldName}` : "Our wallet or platform ID"} />
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={!isCash
                            ? (linkedProvider?.fieldType === "address" ? "0x... wallet address" : "Platform account ID")
                            : "Account number or IBAN"}
                          {...field}
                          className={!isCash ? "font-mono text-xs" : ""}
                          data-testid="input-our-account-field"
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
              )}
            </div>

            {/* ── Projected P&L panel — shown when editing a recorded+matched record ── */}
            {isInRecordedStage && isMatched && confirmPreview && (
              <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-emerald-200 dark:border-emerald-800 bg-emerald-100/60 dark:bg-emerald-900/40">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">Projected P&amp;L on Confirmation</span>
                  <span className="ml-auto text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    +${confirmPreview.projectedProfit.toFixed(4)} USD
                  </span>
                </div>
                <div className="px-3 py-2 space-y-1">
                  <div className="grid grid-cols-[2rem_1fr_4.5rem_4.5rem] gap-x-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-emerald-100 dark:border-emerald-800 pb-1 mb-1">
                    <span>Code</span><span>Account</span><span className="text-right">DR</span><span className="text-right">CR</span>
                  </div>
                  {confirmPreview.lines.map((l, i) => {
                    const dr = parseFloat(l.debitAmount ?? "0");
                    const cr = parseFloat(l.creditAmount ?? "0");
                    return (
                      <div key={i} className="grid grid-cols-[2rem_1fr_4.5rem_4.5rem] gap-x-2 text-[10px]">
                        <span className="font-mono text-primary/70">{l.accountCode}</span>
                        <span className="text-muted-foreground truncate" title={l.description ?? ""}>{l.accountName}</span>
                        <span className={`text-right font-mono ${dr > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground/40"}`}>{dr > 0 ? dr.toFixed(2) : "—"}</span>
                        <span className={`text-right font-mono ${cr > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40"}`}>{cr > 0 ? cr.toFixed(2) : "—"}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="px-3 pb-2 text-[10px] text-muted-foreground italic">
                  Live preview — adjust rates to see profit impact.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Notes <InfoTip text="Internal notes — not shared with client" /></FormLabel>
                  <FormControl><Textarea placeholder="Internal notes..." rows={1} {...field} data-testid="input-notes" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="notificationNotes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Client Note <InfoTip text="Shared with client in WhatsApp notification" /></FormLabel>
                  <FormControl><Textarea placeholder="Note for client..." rows={1} {...field} data-testid="input-notification-notes" /></FormControl>
                </FormItem>
              )} />
            </div>

            {/* ── Submit row ── */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={onCancel} data-testid="button-cancel">Cancel</Button>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                {isInRecordedStage && (
                  <Badge className={STAGE_CONFIG["recorded"].color}>Recorded</Badge>
                )}
                {isTerminalStage && (
                  <Badge className={STAGE_CONFIG[editRecord!.processingStage]?.color ?? ""}>
                    {STAGE_CONFIG[editRecord!.processingStage]?.label ?? editRecord!.processingStage}
                  </Badge>
                )}
                {(!editRecord || editRecord.processingStage === "draft") && (
                  <FormField control={form.control} name="processingStage" render={({ field }) => (
                    <FormItem className="flex items-center gap-1.5 m-0 space-y-0">
                      <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium" role="group">
                        <button type="button" onClick={() => field.onChange("draft")} data-testid="stage-toggle-draft"
                          className={`px-2.5 py-1 transition-colors ${(field.value || "draft") === "draft" ? "bg-gray-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}>
                          Draft
                        </button>
                        <button type="button" onClick={() => field.onChange("recorded")} data-testid="stage-toggle-record"
                          className={`px-2.5 py-1 border-l border-border transition-colors ${field.value === "recorded" ? (watchCustomerId ? "bg-blue-600 text-white" : "bg-sky-600 text-white") : "bg-background text-muted-foreground hover:bg-muted"}`}>
                          Record
                        </button>
                      </div>
                    </FormItem>
                  )} />
                )}
              </div>
              {isInRecordedStage && (isMatched || !!watchCustomerId) && editRecord && (
                <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                  disabled={confirmMutation.isPending || mutation.isPending} onClick={() => confirmMutation.mutate()} data-testid="button-confirm-to-ledger">
                  {confirmMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />…</> : <><CheckCircle className="w-3.5 h-3.5" />Confirm</>}
                </Button>
              )}
              <Button type="submit" size="sm" disabled={mutation.isPending || confirmMutation.isPending || isSuspended} data-testid="button-save-record">
                {mutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />…</> : editRecord ? "Save" : "Create"}
              </Button>
            </div>

          </form>
        </Form>
    </div>
  );
}

// ─── Record Card ──────────────────────────────────────────────────────────────

function RecordCard({
  record,
  matchedCustomer,
  onView,
  onEdit,
  onAdvance,
}: {
  record: FinancialRecord;
  matchedCustomer?: Customer;
  onView: () => void;
  onEdit: () => void;
  onAdvance: (stage: string) => void;
}) {
  const cat = Object.entries(RECORD_TYPES).find(([, d]) => d.type === record.type && d.direction === record.direction);
  const catKey = cat?.[0] as RecordCategory | undefined;
  const def = catKey ? RECORD_TYPES[catKey] : null;
  const Icon = def?.icon ?? FileText;
  const stageCfg = STAGE_CONFIG[record.processingStage] ?? STAGE_CONFIG.recorded;
  // confirmed, used, and cancelled are all final — no further advance is ever allowed
  const isTerminal = record.processingStage === "confirmed" || record.processingStage === "used" || record.processingStage === "cancelled";
  const nextStage = !isTerminal ? stageCfg.next : undefined;

  // Context-aware quick buttons
  const MATCHED_STAGES = ["matched", "manual_matched", "auto_matched"];
  const stage = record.processingStage;
  const hasCustomer = !!record.customerId;
  // "Matched" is NOT a stage — it is derived from customerId IS NOT NULL.
  // Advance buttons: draft→recorded, recorded+customer→confirmed. Skip "matched" as a step.
  const isLegacyMatched = MATCHED_STAGES.includes(stage);
  const cardShowAdvance = !isTerminal && (
    stage === "draft" ||
    (stage === "recorded" && hasCustomer) ||
    isLegacyMatched
  );
  const cardAdvanceStage = stage === "draft" ? "recorded" : "confirmed";
  const cardAdvanceLabel = stage === "draft" ? "Record Now" : "Confirm to Ledger";

  return (
    <Card className={`hover-elevate ${isTerminal ? "opacity-60" : ""}`} data-testid={`card-record-${record.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl ${def?.bg ?? "bg-muted"} flex items-center justify-center shrink-0 relative`}>
            <Icon className={`w-4 h-4 ${def?.color ?? ""}`} />
            {isTerminal && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-500 flex items-center justify-center">
                <Lock className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-mono text-muted-foreground">{record.recordNumber}</span>
              {def && <Badge className={`text-xs ${def.bg} ${def.color}`}>{def.label}</Badge>}
              <Badge className={`text-xs ${stageCfg.color}`}>{stageCfg.label}</Badge>
              {record.recordMethod === "auto" && <Badge variant="outline" className="text-xs">Auto</Badge>}
            </div>

            <div className="flex items-center gap-3 mb-1.5">
              <p className="text-base font-bold text-foreground">
                {parseFloat(record.amount).toLocaleString()} {record.currency}
              </p>
              {record.usdEquivalent && record.currency !== "USD" && (
                <p className="text-sm text-muted-foreground">≈ ${parseFloat(record.usdEquivalent).toLocaleString()} USD</p>
              )}
            </div>

            <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap text-xs text-muted-foreground">
              {record.accountName && (
                <span className="flex items-center gap-1">
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${record.direction === "inflow" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"}`}>
                    {record.direction === "inflow" ? "DR" : "CR"}
                  </span>
                  <Building2 className="w-3 h-3" />{record.accountName}
                </span>
              )}
              {/* Contra account: derive display from matching status — never show stale "Unmatched" */}
              {record.contraAccountName && (
                <span className="flex items-center gap-1">
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${record.direction === "inflow" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"}`}>
                    {record.direction === "inflow" ? "CR" : "DR"}
                  </span>
                  <Building2 className="w-3 h-3 opacity-60" />
                  {/* If matched (customer linked), contra is always the customer's balance account */}
                  {matchedCustomer
                    ? `Customer Balance — ${matchedCustomer.fullName}`
                    : record.contraAccountName.includes("Unmatched")
                      ? "2101 · Customer Credits (Unmatched)"
                      : record.contraAccountName}
                </span>
              )}
              {record.assetOrProviderName && <span className="flex items-center gap-1"><Wallet className="w-3 h-3" />{record.assetOrProviderName}{record.networkOrId && ` (${record.networkOrId})`}</span>}
              {record.clientSenderName && <span className="flex items-center gap-1"><User className="w-3 h-3" />from {record.clientSenderName}</span>}
              {record.clientRecipientName && <span className="flex items-center gap-1"><User className="w-3 h-3" />to {record.clientRecipientName}</span>}
              {record.txidOrReferenceNumber && (
                <span className="flex items-center gap-1 font-mono">
                  <Hash className="w-3 h-3" />
                  {record.txidOrReferenceNumber.length > 20
                    ? `${record.txidOrReferenceNumber.slice(0, 10)}...${record.txidOrReferenceNumber.slice(-6)}`
                    : record.txidOrReferenceNumber}
                </span>
              )}
              {record.transactionId && (
                <span className="flex items-center gap-1 font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                  <BookOpen className="w-3 h-3" />
                  {record.transactionId}
                </span>
              )}
            </div>
            {matchedCustomer ? (
              <div className="flex items-center gap-1 mt-1 text-xs">
                <UserCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-semibold text-emerald-700 dark:text-emerald-400 truncate">{matchedCustomer.fullName}</span>
                <span className="text-muted-foreground/60">·</span>
                <span className="font-mono text-muted-foreground">{matchedCustomer.customerId}</span>
                <span className="ml-1 text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 rounded px-1 py-0.5 font-semibold">matched</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 mt-1 text-xs text-amber-600 dark:text-amber-400">
                <UserX className="w-3 h-3 shrink-0" />
                <span>Unmatched — no customer linked</span>
              </div>
            )}
            {record.notes && <p className="text-xs text-muted-foreground/70 mt-1">{record.notes}</p>}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="text-right text-xs text-muted-foreground">
              <p>{format(new Date(record.createdAt), "MMM d, yyyy")}</p>
              <p>{format(new Date(record.createdAt), "HH:mm")}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onView} data-testid={`button-view-record-${record.id}`}>
                <Eye className="w-3 h-3 mr-1" />View
              </Button>
              {!isTerminal && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onEdit} data-testid={`button-edit-record-${record.id}`}>
                  <Edit2 className="w-3 h-3 mr-1" />Edit
                </Button>
              )}
              {!isTerminal && stageCfg?.canCancel && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => onAdvance("cancelled")} data-testid={`button-cancel-${record.id}`}>
                  <XCircle className="w-3 h-3 mr-1" />Cancel
                </Button>
              )}
              <InvoiceDownloadButton record={record} customer={matchedCustomer} />
              {cardShowAdvance && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAdvance(cardAdvanceStage)} data-testid={`button-advance-${record.id}`}>
                  {cardAdvanceStage === "recorded" ? <BookOpen className="w-3 h-3 mr-1" /> : <ArrowRight className="w-3 h-3 mr-1" />}
                  {cardAdvanceLabel}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ActiveTab = "all" | RecordCategory;

export default function Records() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [viewRecord, setViewRecord] = useState<FinancialRecord | null>(null);
  const [editRecord, setEditRecord] = useState<FinancialRecord | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tabDef = activeTab !== "all" ? RECORD_TYPES[activeTab] : null;

  const { data: allRecords, isLoading } = useQuery<FinancialRecord[]>({
    queryKey: ["/api/records", tabDef?.type, tabDef?.direction],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tabDef) { params.set("type", tabDef.type); params.set("direction", tabDef.direction); }
      const res = await fetch(`/api/records?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: allCustomers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const customersById = useMemo<Record<string, Customer>>(() => {
    if (!allCustomers) return {};
    return Object.fromEntries(allCustomers.map(c => [c.id, c]));
  }, [allCustomers]);

  const advanceMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      apiRequest("PATCH", `/api/records/${id}`, { processingStage: stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance-alerts"] });
      toast({ title: "Stage updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!allRecords) return [];
    let list = allRecords;
    if (stageFilter !== "all") list = list.filter(r => r.processingStage === stageFilter);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(r =>
      r.recordNumber.toLowerCase().includes(q) ||
      r.clientName?.toLowerCase().includes(q) ||
      r.clientSenderName?.toLowerCase().includes(q) ||
      r.accountName?.toLowerCase().includes(q) ||
      r.assetOrProviderName?.toLowerCase().includes(q) ||
      r.txidOrReferenceNumber?.toLowerCase().includes(q) ||
      r.currency.toLowerCase().includes(q)
    );
  }, [allRecords, search, stageFilter]);

  const counts = useMemo(() => {
    const all = allRecords ?? [];
    return {
      all: all.length,
      cash_inflow:    all.filter(r => r.type === "cash"   && r.direction === "inflow").length,
      cash_outflow:   all.filter(r => r.type === "cash"   && r.direction === "outflow").length,
      crypto_inflow:  all.filter(r => r.type === "crypto" && r.direction === "inflow").length,
      crypto_outflow: all.filter(r => r.type === "crypto" && r.direction === "outflow").length,
    };
  }, [allRecords]);

  const tabs: { key: ActiveTab; label: string; icon: typeof Banknote; count: number }[] = [
    { key: "all",           label: "All",           icon: FileText,     count: counts.all },
    { key: "cash_inflow",   label: "Cash Inflow",   icon: Banknote,     count: counts.cash_inflow },
    { key: "cash_outflow",  label: "Cash Outflow",  icon: TrendingDown, count: counts.cash_outflow },
    { key: "crypto_inflow", label: "Crypto Inflow", icon: Bitcoin,      count: counts.crypto_inflow },
    { key: "crypto_outflow",label: "Crypto Outflow",icon: TrendingUp,   count: counts.crypto_outflow },
  ];

  if (formMode !== null) {
    return (
      <RecordFormPage
        key={editRecord?.id ?? "new"}
        onCancel={() => { setFormMode(null); setEditRecord(null); }}
        defaultCategory={activeTab !== "all" ? activeTab as RecordCategory : "cash_inflow"}
        editRecord={editRecord ?? undefined}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Records</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cash & Crypto inflow and outflow records</p>
        </div>
        <Button onClick={() => { setEditRecord(null); setFormMode("create"); }} data-testid="button-new-record">
          <Plus className="w-4 h-4 mr-2" />New Record
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const def = tab.key !== "all" ? RECORD_TYPES[tab.key] : null;
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} data-testid={`tab-records-${tab.key}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all whitespace-nowrap ${isActive ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"}`}
            >
              {def ? (
                <div className={`w-5 h-5 rounded ${def.bg} flex items-center justify-center`}>
                  <Icon className={`w-3 h-3 ${def.color}`} />
                </div>
              ) : <Icon className="w-4 h-4" />}
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + Stage filter */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by number, customer, provider, hash..." className="pl-9 pr-9" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-muted-foreground hover:text-foreground" /></button>}
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-44" data-testid="select-stage-filter">
            <Filter className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Records list */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !filtered.length ? (
        <Card>
          <div className="flex flex-col items-center py-16">
            <FileText className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">
              {search || stageFilter !== "all" ? "No records match your filters" : `No ${activeTab !== "all" ? RECORD_TYPES[activeTab as RecordCategory]?.label : ""} records yet`}
            </p>
            {!search && stageFilter === "all" && (
              <Button className="mt-4" onClick={() => { setEditRecord(null); setFormMode("create"); }}>
                <Plus className="w-4 h-4 mr-2" />Create First Record
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(r => (
            <RecordCard
              key={r.id}
              record={r}
              matchedCustomer={r.customerId ? customersById[r.customerId] : undefined}
              onView={() => setViewRecord(r)}
              onEdit={() => { setEditRecord(r); setFormMode("edit"); }}
              onAdvance={stage => advanceMutation.mutate({ id: r.id, stage })}
            />
          ))}
        </div>
      )}

      {/* Detail dialog */}
      {viewRecord && (
        <RecordDetailDialog
          record={viewRecord}
          customer={viewRecord.customerId ? customersById[viewRecord.customerId] : undefined}
          onClose={() => setViewRecord(null)}
          onEdit={() => { setEditRecord(viewRecord); setViewRecord(null); setFormMode("edit"); }}
          onAdvanceStage={stage => advanceMutation.mutate({ id: viewRecord.id, stage })}
        />
      )}
    </div>
  );
}
