import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertWatchedWalletSchema } from "@shared/schema";
import type { WatchedWallet, ChartOfAccount, Provider } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus, Pencil, Trash2, RefreshCw, Wallet, CheckCircle2,
  AlertCircle, Clock, ExternalLink, Copy, Check, ShieldAlert, Loader2, KeyRound,
  RotateCcw, ArrowDownCircle, ChevronDown, ChevronUp
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const SUPPORTED_NETWORKS = [
  { value: "bep20",    label: "BEP20 (Binance Smart Chain)",  asset: "USDT" },
  { value: "trc20",    label: "TRC20 (Tron Network)",         asset: "USDT" },
  { value: "erc20",    label: "ERC20 (Ethereum)",             asset: "USDT" },
  { value: "polygon",  label: "Polygon (MATIC)",               asset: "USDT" },
  { value: "arbitrum", label: "Arbitrum One",                  asset: "USDT" },
  { value: "avalanche",label: "Avalanche C-Chain",             asset: "USDT" },
];

const EXPLORER_URLS: { [k: string]: string } = {
  bep20:    "https://bscscan.com/address/",
  trc20:    "https://tronscan.org/#/address/",
  erc20:    "https://etherscan.io/address/",
  polygon:  "https://polygonscan.com/address/",
  arbitrum: "https://arbiscan.io/address/",
  avalanche:"https://snowtrace.io/address/",
};

const formSchema = insertWatchedWalletSchema.extend({
  label:           z.string().min(2, "Label required"),
  walletAddress:   z.string().min(10, "Wallet address required"),
  network:         z.string().min(2, "Network required"),
  assetCurrency:   z.string().default("USDT"),
  lastSyncedBlock: z.number().int().positive().optional().nullable(),
});
type WalletForm = z.infer<typeof formSchema>;

const NETWORK_CODE_MAP: Record<string, string> = {
  BEP20: "bep20", TRC20: "trc20", ERC20: "erc20",
  Polygon: "polygon", Arbitrum: "arbitrum", Avalanche: "avalanche",
};

function WalletFormDialog({ open, onClose, initial, accounts, providers }: {
  open: boolean; onClose: () => void; initial?: WatchedWallet;
  accounts: ChartOfAccount[]; providers: Provider[];
}) {
  const { toast } = useToast();
  const form = useForm<WalletForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      label:           initial?.label           ?? "",
      walletAddress:   initial?.walletAddress   ?? "",
      network:         initial?.network         ?? "bep20",
      assetCurrency:   initial?.assetCurrency   ?? "USDT",
      accountId:       initial?.accountId       ?? undefined,
      accountName:     initial?.accountName     ?? "",
      providerCode:    initial?.providerCode    ?? undefined,
      isActive:        initial?.isActive        ?? true,
      lastSyncedBlock: initial?.lastSyncedBlock ?? null,
      notes:           initial?.notes           ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: WalletForm) => initial
      ? apiRequest("PATCH", `/api/accounting/watched-wallets/${initial.id}`, data)
      : apiRequest("POST", "/api/accounting/watched-wallets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/watched-wallets"] });
      toast({ title: initial ? "Wallet updated" : "Wallet added — syncing will start within 2 minutes" });
      onClose(); form.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const watchAccountId = form.watch("accountId");
  const watchNetwork = form.watch("network");

  // Accounts that have a crypto address-type provider linked
  const cryptoAccounts = accounts.filter(a => {
    if (!a.isActive) return false;
    const prov = providers.find(p => p.id === a.providerId);
    if (!prov) return false;
    return prov.fieldType === "address" && (prov as any).networkCode;
  });

  // Get the provider linked to the currently selected account
  const selectedAccount = accounts.find(a => a.id === watchAccountId);
  const linkedProvider = selectedAccount ? providers.find(p => p.id === selectedAccount.providerId) : undefined;

  // Auto-fill network, assetCurrency, providerCode when account changes
  useEffect(() => {
    if (!watchAccountId || initial?.accountId === watchAccountId) return;
    const acc = accounts.find(a => a.id === watchAccountId);
    if (!acc) return;
    form.setValue("accountName", acc.name);
    const prov = providers.find(p => p.id === acc.providerId);
    if (prov) {
      const netCode = (prov as any).networkCode ?? "";
      const mappedNet = NETWORK_CODE_MAP[netCode] ?? netCode.toLowerCase();
      if (mappedNet) form.setValue("network", mappedNet, { shouldValidate: true });
      if ((prov as any).currency) form.setValue("assetCurrency", (prov as any).currency, { shouldValidate: true });
      if (prov.code) form.setValue("providerCode", prov.code, { shouldValidate: true });
      if (!form.getValues("label")) form.setValue("label", acc.name);
    }
  }, [watchAccountId]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Watched Wallet" : "Add Wallet to Watch"}</DialogTitle>
          <DialogDescription>
            Select the ledger account for this wallet — network, asset, and provider are automatically determined from the account's linked provider.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">

            {/* ── Step 1: Ledger account — everything derives from this ── */}
            <FormField control={form.control} name="accountId" render={({ field }) => (
              <FormItem>
                <FormLabel>Ledger Account <span className="text-destructive">*</span></FormLabel>
                <Select onValueChange={v => { field.onChange(v); }} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-wallet-account"><SelectValue placeholder="Select CoA account…" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {cryptoAccounts.length === 0 ? (
                      <SelectItem value="none" disabled>No crypto accounts with address providers found</SelectItem>
                    ) : cryptoAccounts.map(a => {
                      const prov = providers.find(p => p.id === a.providerId);
                      return (
                        <SelectItem key={a.id} value={a.id}>
                          {a.code} — {a.name}
                          {prov && <span className="ml-1 text-xs text-muted-foreground">({(prov as any).networkCode})</span>}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FormDescription className="text-xs">
                  Journal entries for auto-synced inflows will be posted to this account.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />

            {/* ── Provider info panel — auto-derived ── */}
            {linkedProvider && (
              <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs space-y-1">
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">Auto-configured from provider</p>
                <div className="flex flex-wrap gap-3 text-emerald-600 dark:text-emerald-400">
                  <span>Provider: <strong>{linkedProvider.name}</strong></span>
                  <span>Network: <strong>{(linkedProvider as any).networkCode ?? "—"}</strong></span>
                  <span>Asset: <strong>{(linkedProvider as any).currency ?? "—"}</strong></span>
                  <span>Matches: <strong>{linkedProvider.fieldName}</strong></span>
                </div>
                <p className="text-emerald-500 italic">
                  When a transfer arrives, Ankr will look up customers who have this provider's wallet address matching the sender.
                </p>
              </div>
            )}

            {/* ── Wallet address ── */}
            <FormField control={form.control} name="walletAddress" render={({ field }) => (
              <FormItem>
                <FormLabel>Company Wallet Address <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input
                    placeholder={watchNetwork === "trc20" ? "T… (Tron address)" : "0x… (EVM address)"}
                    className="font-mono text-xs"
                    {...field}
                    data-testid="input-wallet-address"
                  />
                </FormControl>
                <FormDescription className="text-xs">Your company's wallet address — incoming transfers to this address create crypto inflow records.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="label" render={({ field }) => (
              <FormItem>
                <FormLabel>Label <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="e.g. BEP20 Main Wallet, TRON Operations" {...field} data-testid="input-wallet-label" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Starting block — only meaningful at creation; during syncing it advances automatically */}
            <FormField control={form.control} name="lastSyncedBlock" render={({ field }) => (
              <FormItem>
                <FormLabel>Starting Block {!initial && <span className="text-xs text-muted-foreground font-normal ml-1">(optional)</span>}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder={initial ? String(initial.lastSyncedBlock ?? "not yet synced") : "e.g. 45000000 — leave blank to start from latest"}
                    value={field.value ?? ""}
                    onChange={e => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                    data-testid="input-wallet-start-block"
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  The block number to start (or resume) scanning from. Advances automatically after each sync run. Set to an older block to re-import history.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="!mt-0">Active (auto-sync enabled)</FormLabel>
              </FormItem>
            )} />

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea rows={2} placeholder="Optional notes…" {...field} /></FormControl>
              </FormItem>
            )} />

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-wallet">
                {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Wallet"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddressCopy({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      className="font-mono text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      title="Click to copy"
    >
      <span className="truncate max-w-[140px]">{address}</span>
      {copied ? <Check className="w-3 h-3 text-emerald-500 shrink-0" /> : <Copy className="w-3 h-3 shrink-0 opacity-50" />}
    </button>
  );
}

export default function WalletSyncPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WatchedWallet | undefined>();
  const [expandedRecords, setExpandedRecords] = useState<{ [walletId: string]: boolean }>({});

  const { data: wallets = [], isLoading } = useQuery<WatchedWallet[]>({
    queryKey: ["/api/accounting/watched-wallets"],
  });
  const { data: ankrStatus } = useQuery<{ configured: boolean; keyHint: string | null }>({
    queryKey: ["/api/accounting/ankr-status"],
  });
  const { data: accounts = [] } = useQuery<ChartOfAccount[]>({
    queryKey: ["/api/accounting/accounts"],
  });
  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ["/api/accounting/providers"],
  });
  const { data: syncedRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/records", "ankr_sync"],
    queryFn: () => fetch("/api/records?source=ankr_sync&limit=50", { credentials: "include" }).then(r => r.json()),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/accounting/watched-wallets/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/accounting/watched-wallets"] }); toast({ title: "Wallet removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const syncMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/accounting/watched-wallets/${id}/sync`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/watched-wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/records", "ankr_sync"] });
      if (data.error) {
        toast({ title: "Sync error", description: data.error, variant: "destructive" });
      } else if (data.created > 0) {
        const desc = data.hasMore
          ? `More transfers pending — next sync will continue from block ${(data.highestBlock ?? 0).toLocaleString()}`
          : data.skipped > 0 ? `${data.skipped} duplicate${data.skipped !== 1 ? "s" : ""} filtered` : undefined;
        toast({ title: `Sync complete — ${data.created} new record${data.created !== 1 ? "s" : ""} created`, description: desc });
      } else {
        const block = data.highestBlock ? ` — checked up to block ${data.highestBlock.toLocaleString()}` : "";
        toast({ title: "Already up to date", description: `No new transfers found on chain${block}` });
      }
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const rescanMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/accounting/watched-wallets/${id}/rescan`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/watched-wallets"] });
      toast({ title: "Re-scan scheduled", description: "Block checkpoint cleared. Triggering full history sync now…" });
      setTimeout(() => syncMut.mutate(id), 400);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/accounting/watched-wallets/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/accounting/watched-wallets"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalSynced = wallets.reduce((s, w) => s + (w.totalSynced ?? 0), 0);
  const activeCount = wallets.filter(w => w.isActive).length;
  const errorCount  = wallets.filter(w => w.lastSyncError).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-border bg-background/95 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Blockchain Wallet Sync
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ankr API auto-creates crypto inflow records every 2 minutes for watched wallets
          </p>
        </div>
        <Button onClick={() => { setEditTarget(undefined); setFormOpen(true); }} data-testid="button-add-wallet">
          <Plus className="w-4 h-4 mr-2" />Add Wallet
        </Button>
      </div>

      {/* API Key Status Banner */}
      <div className="px-3 sm:px-6 pt-4">
        {ankrStatus?.configured ? (
          <Alert className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-emerald-800/50">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-700 dark:text-emerald-300 text-sm">
              <span className="font-semibold">Ankr API key configured</span>
              {ankrStatus.keyHint && <span className="ml-2 font-mono text-xs opacity-70">{ankrStatus.keyHint}</span>}
              <span className="ml-2">— blockchain polling is active</span>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800/50">
            <KeyRound className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
              <span className="font-semibold">Ankr API key not set.</span>
              {" "}Add the secret <span className="font-mono text-xs bg-background border border-border rounded px-1">ANKR_API_KEY</span> in{" "}
              <a href="https://www.ankr.com/rpc/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 inline-flex items-center gap-0.5">
                ankr.com/rpc <ExternalLink className="w-3 h-3" />
              </a>
              {" "}to enable auto-sync. You can add wallets now and sync will start once the key is added.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-3 sm:px-6 pt-4 pb-2">
        <div className="rounded-lg border border-border p-3 bg-muted/30">
          <p className="text-2xl font-bold">{wallets.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Watched Wallets</p>
        </div>
        <div className="rounded-lg border border-border p-3 bg-emerald-50 dark:bg-emerald-900/20">
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{totalSynced}</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Records Auto-Created</p>
        </div>
        <div className={`rounded-lg border p-3 ${errorCount > 0 ? "border-red-200 bg-red-50 dark:bg-red-900/20" : "border-border bg-muted/30"}`}>
          <p className={`text-2xl font-bold ${errorCount > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{activeCount}</p>
          <p className={`text-xs mt-0.5 ${errorCount > 0 ? "text-red-500" : "text-muted-foreground"}`}>
            {errorCount > 0 ? `${errorCount} with errors` : "Active Wallets"}
          </p>
        </div>
      </div>

      {/* Wallet List */}
      <div className="flex-1 overflow-auto px-3 sm:px-6 pb-3 sm:pb-6 space-y-3 mt-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : wallets.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-xl p-10 text-center">
            <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-foreground mb-1">No wallets configured yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Add your company wallet addresses to start auto-syncing incoming USDT transfers
            </p>
            <Button onClick={() => setFormOpen(true)} data-testid="button-add-first-wallet">
              <Plus className="w-4 h-4 mr-2" />Add First Wallet
            </Button>
          </div>
        ) : (
          wallets.map(w => {
            const netInfo = SUPPORTED_NETWORKS.find(n => n.value === w.network);
            const explorerUrl = EXPLORER_URLS[w.network];
            const isSyncing = syncMut.isPending && (syncMut.variables as string) === w.id;

            return (
              <div key={w.id} className={`border rounded-xl p-4 transition-colors ${w.isActive ? "border-border bg-card" : "border-border/50 bg-muted/20 opacity-70"}`} data-testid={`wallet-card-${w.id}`}>
                <div className="flex items-start gap-4">
                  {/* Icon + Toggle */}
                  <div className="flex flex-col items-center gap-2 pt-0.5">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${w.isActive ? "bg-primary/10" : "bg-muted"}`}>
                      <Wallet className={`w-4 h-4 ${w.isActive ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <Switch
                      checked={w.isActive}
                      onCheckedChange={v => toggleMut.mutate({ id: w.id, isActive: v })}
                      className="scale-75"
                      data-testid={`switch-wallet-active-${w.id}`}
                    />
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-foreground">{w.label}</span>
                      <Badge className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                        {netInfo?.label ?? w.network.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-xs font-mono">{w.assetCurrency}</Badge>
                      {w.isActive
                        ? <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Active</Badge>
                        : <Badge variant="secondary" className="text-xs">Paused</Badge>
                      }
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <AddressCopy address={w.walletAddress} />
                      {explorerUrl && (
                        <a href={`${explorerUrl}${w.walletAddress}`} target="_blank" rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary transition-colors" title="View on explorer">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {w.accountName && (
                        <span className="flex items-center gap-1">
                          <span className="text-foreground font-medium">Account:</span> {w.accountName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <span className="text-foreground font-medium">Synced:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{w.totalSynced ?? 0}</span> records
                      </span>
                      {w.lastSyncAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(w.lastSyncAt), { addSuffix: true })}
                        </span>
                      )}
                      {(w as any).lastSyncedBlock != null && (
                        <span className="flex items-center gap-1 font-mono" title="Block checkpoint — next sync starts from block+1">
                          <span className="text-foreground font-medium">Block:</span>
                          <span className="text-blue-600 dark:text-blue-400">{((w as any).lastSyncedBlock as number).toLocaleString()}</span>
                        </span>
                      )}
                    </div>

                    {w.lastSyncError && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="font-mono">{w.lastSyncError}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                      disabled={isSyncing || !ankrStatus?.configured}
                      onClick={() => syncMut.mutate(w.id)}
                      data-testid={`button-sync-wallet-${w.id}`}
                      title={!ankrStatus?.configured ? "Configure ANKR_API_KEY first" : "Sync now"}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                      {isSyncing ? "Syncing…" : "Sync Now"}
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground"
                      disabled={rescanMut.isPending && (rescanMut.variables as string) === w.id}
                      onClick={() => { if (confirm("Re-scan full history? This clears the block checkpoint and re-fetches all transfers. Duplicates are automatically filtered.")) rescanMut.mutate(w.id); }}
                      data-testid={`button-rescan-wallet-${w.id}`}
                      title="Re-scan blockchain history from genesis"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Re-scan
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8"
                      onClick={() => { setEditTarget(w); setFormOpen(true); }}
                      data-testid={`button-edit-wallet-${w.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Remove "${w.label}" from watched wallets?`)) deleteMut.mutate(w.id); }}
                      data-testid={`button-delete-wallet-${w.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Synced Records for this wallet */}
                {(() => {
                  const wRecords = syncedRecords.filter((r: any) => r.endpointName === w.label);
                  if (wRecords.length === 0) return null;
                  const isExpanded = expandedRecords[w.id];
                  return (
                    <div className="mt-3 border-t border-border/60 pt-3">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
                        onClick={() => setExpandedRecords(prev => ({ ...prev, [w.id]: !prev[w.id] }))}
                        data-testid={`button-toggle-records-${w.id}`}
                      >
                        <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-500" />
                        {wRecords.length} auto-synced record{wRecords.length !== 1 ? "s" : ""}
                        {isExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                      </button>
                      {isExpanded && (
                        <div className="rounded-lg border border-border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Record #</th>
                                <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Amount</th>
                                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">From</th>
                                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Block</th>
                                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {wRecords.map((r: any, idx: number) => (
                                <tr key={r.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"} data-testid={`row-synced-record-${r.id}`}>
                                  <td className="px-3 py-1.5 font-mono text-foreground">{r.recordNumber}</td>
                                  <td className="px-3 py-1.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                    {parseFloat(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} <span className="text-muted-foreground font-normal">{r.currency}</span>
                                  </td>
                                  <td className="px-3 py-1.5 font-mono truncate max-w-[100px]" title={r.networkOrId}>{r.networkOrId ? `${r.networkOrId.slice(0, 6)}…${r.networkOrId.slice(-4)}` : "—"}</td>
                                  <td className="px-3 py-1.5 font-mono text-blue-600 dark:text-blue-400">{r.blockNumberOrBatchId ?? "—"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{format(new Date(r.createdAt), "MMM d, yyyy HH:mm")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>

      {/* Info footer */}
      <div className="px-6 pb-4">
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1.5">
          <p className="font-semibold text-sm text-foreground flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-amber-500" />How it works</p>
          <p><strong>Auto-sync:</strong> Every 2 minutes, the server polls Ankr API for each active wallet and creates a crypto inflow record for any new incoming transfers found (deduplication prevents double-counting by txHash).</p>
          <p><strong>Records created:</strong> Auto-synced records are tagged with source <span className="font-mono bg-background border border-border rounded px-1">ankr_sync</span> and processingStage <span className="font-mono bg-background border border-border rounded px-1">recorded</span> — staff must confirm and link them to transactions.</p>
          <p><strong>API key:</strong> Get a free Ankr API key at <a href="https://www.ankr.com/rpc/" target="_blank" rel="noopener noreferrer" className="underline text-primary">ankr.com/rpc</a>, then add it as the secret <span className="font-mono bg-background border border-border rounded px-1">ANKR_API_KEY</span> in the project secrets.</p>
        </div>
      </div>

      {formOpen && (
        <WalletFormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditTarget(undefined); }}
          initial={editTarget}
          accounts={accounts}
          providers={providers}
        />
      )}
    </div>
  );
}
