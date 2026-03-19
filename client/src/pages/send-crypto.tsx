import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Send, Wallet, RefreshCw, CheckCircle2, XCircle, Clock,
  AlertCircle, ChevronsUpDown, Check, Copy, ExternalLink,
  Loader2, ShieldAlert, ArrowRight, Zap, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { Customer, CustomerWallet, ExchangeRate, CryptoSend } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

const BSCSCAN_TX = "https://bscscan.com/tx/";
const BSCSCAN_ADDR = "https://bscscan.com/address/";
const FIAT_CURRENCIES = ["USD", "YER", "SAR", "AED", "KWD"];
const PAGE_SIZE = 50;

interface AccountInfo {
  account: { id: string; code: string; name: string };
  provider: {
    id: string; name: string; networkCode: string;
    depositFeeRate: number; withdrawFeeRate: number; networkFeeUsd: number;
    fieldType: string; fieldName: string;
  };
  wallet: { address: string; usdtBalance: string; bnbBalance: string; configured: boolean };
}

interface PreviewResult {
  customerName: string; recipientAddress: string; usdtAmount: string;
  fiatAmount: string; fiatCurrency: string; currency: string; network: string;
  exchangeRate: string; depositFeeRate: string; depositFeeFiat: string;
  networkFeeUsd: string; totalDebitFiat: string; fromAccountId: string;
  fromAccountCode: string; fromAccountName: string; providerId: string;
  providerName: string; providerDepositFeeRate: string;
  walletBalance: string; bnbBalance: string; walletConfigured: boolean; sufficientBalance: boolean;
}

interface PaginatedSends { data: CryptoSend[]; total: number; page: number; limit: number; totalPages: number; }
interface ReverseLookupResult { wallet: CustomerWallet; customer: Customer | null; }

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    pending:      { label: "Pending",      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: <Clock className="w-3 h-3" /> },
    broadcasting: { label: "Broadcasting", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",       icon: <Zap className="w-3 h-3" /> },
    confirmed:    { label: "Confirmed",    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",    icon: <CheckCircle2 className="w-3 h-3" /> },
    failed:       { label: "Failed",       className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",            icon: <XCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground", icon: null };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.icon}{s.label}</span>;
}

function shortHash(h: string) { return h ? `${h.slice(0, 8)}…${h.slice(-6)}` : ""; }
function shortAddr(a: string) { return a ? `${a.slice(0, 8)}…${a.slice(-6)}` : ""; }

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="text-muted-foreground hover:text-primary" data-testid="button-copy">
      {ok ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className={`text-sm text-right ${bold ? "text-base font-bold font-mono" : "font-medium"}`}>{value}</span>
    </div>
  );
}

export default function SendCrypto() {
  const { toast } = useToast();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [fiatAmount, setFiatAmount] = useState("");
  const [fiatCurrency, setFiatCurrency] = useState("USD");
  const [buyRate, setBuyRate] = useState("");
  const [depositFeeRate, setDepositFeeRate] = useState<string>("");
  const [feeRateInit, setFeeRateInit] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrMatch, setAddrMatch] = useState<string | null>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Manual USDT entry mode
  const [amountMode, setAmountMode] = useState<"fiat" | "usdt">("fiat");
  const [manualUsdt, setManualUsdt] = useState("");
  // Pagination
  const [histPage, setHistPage] = useState(1);

  const { data: acctInfo, isLoading: acctLoading, error: acctError } = useQuery<AccountInfo>({
    queryKey: ["/api/crypto-sends/account-info"],
    refetchInterval: 30_000,
  });

  const prov = acctInfo?.provider;
  const acct = acctInfo?.account;
  const wlt = acctInfo?.wallet;
  const configured = wlt?.configured ?? false;
  const wltUsdt = parseFloat(wlt?.usdtBalance ?? "0");

  useEffect(() => {
    if (prov && !feeRateInit) { setDepositFeeRate(String(prov.depositFeeRate)); setFeeRateInit(true); }
  }, [prov, feeRateInit]);

  const numFiat = parseFloat(fiatAmount) || 0;
  const numRate = parseFloat(buyRate) || 0;
  const feeRate = parseFloat(depositFeeRate) || 0;

  // Calculate USDT depending on mode
  const usdtFromFiat = numRate > 0 ? numFiat / numRate / (1 + feeRate / 100) : 0;
  const usdtToSend = amountMode === "usdt" ? (parseFloat(manualUsdt) || 0) : usdtFromFiat;
  const feeUsd = usdtToSend * (feeRate / 100);

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: custWallets = [] } = useQuery<CustomerWallet[]>({
    queryKey: ["/api/customers", selectedCustomer?.id, "wallets"],
    queryFn: () => selectedCustomer
      ? fetch(`/api/customers/${selectedCustomer.id}/wallets`, { credentials: "include" }).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!selectedCustomer,
  });
  const { data: rates = [] } = useQuery<ExchangeRate[]>({ queryKey: ["/api/accounting/exchange-rates"] });
  const { data: histResult, isLoading: histLoading } = useQuery<PaginatedSends>({
    queryKey: ["/api/crypto-sends", histPage],
    queryFn: () => fetch(`/api/crypto-sends?page=${histPage}&limit=${PAGE_SIZE}`, { credentials: "include" }).then(r => r.json()),
  });
  const history = histResult?.data ?? [];
  const totalPages = histResult?.totalPages ?? 1;

  useEffect(() => {
    if (fiatCurrency === "USD") { setBuyRate("1.000000"); return; }
    if (rates.length === 0) { setBuyRate(""); return; }
    const m = rates.find(r =>
      (r.fromCurrency === fiatCurrency && r.toCurrency === "USD") ||
      (r.fromCurrency === "USD" && r.toCurrency === fiatCurrency)
    );
    setBuyRate(m?.buyRate ? parseFloat(String(m.buyRate)).toFixed(6) : "");
  }, [fiatCurrency, rates.length]);

  // Auto-fill address when customer selected (matching provider)
  useEffect(() => {
    if (!selectedCustomer || custWallets.length === 0) return;
    const provId = prov?.id;
    const pn = prov?.name?.toLowerCase();
    // Match by providerId first, then by provider name
    const dw = custWallets.find(w => w.providerId === provId && w.isDefault)
      ?? custWallets.find(w => w.providerId === provId)
      ?? custWallets.find(w => w.providerName?.toLowerCase() === pn && w.isDefault)
      ?? custWallets.find(w => w.providerName?.toLowerCase() === pn);
    if (dw) { setRecipientAddress(dw.addressOrId); setAddrMatch(null); }
  }, [custWallets, selectedCustomer, prov]);

  // Reverse lookup: auto-select customer when address is entered
  const doLookup = useCallback(async (addr: string) => {
    if (addr.length < 10) { setAddrMatch(null); return; }
    setAddrLoading(true);
    try {
      const res = await fetch(`/api/customer-wallets/lookup?address=${encodeURIComponent(addr)}`, { credentials: "include" });
      if (!res.ok) { setAddrLoading(false); return; }
      const data: ReverseLookupResult | null = await res.json();
      if (data?.customer && !selectedCustomer) {
        setSelectedCustomer(data.customer);
        setAddrMatch(`Auto-detected: ${data.customer.fullName}`);
      } else if (data?.customer) {
        setAddrMatch(`Whitelisted for ${data.customer.fullName}`);
      } else { setAddrMatch(null); }
    } catch { setAddrMatch(null); }
    finally { setAddrLoading(false); }
  }, [selectedCustomer]);

  const onAddrChange = (v: string) => {
    setRecipientAddress(v); setAddrMatch(null);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(() => doLookup(v), 600);
  };

  const previewMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/crypto-sends/preview", {
        customerId: selectedCustomer?.id, recipientAddress,
        amount: usdtToSend.toFixed(6),
        fiatAmount: amountMode === "fiat" ? numFiat.toFixed(4) : (usdtToSend * numRate * (1 + feeRate / 100)).toFixed(4),
        fiatCurrency, exchangeRate: buyRate, depositFeeRate,
        fromAccountId: acct?.code || "1521",
      }),
    onSuccess: (d: PreviewResult) => { setPreview(d); setConfirmOpen(true); },
    onError: (e: Error) => toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
  });

  const execMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/crypto-sends/execute", {
        customerId: selectedCustomer?.id, recipientAddress,
        amount: usdtToSend.toFixed(6),
        fiatAmount: amountMode === "fiat" ? numFiat.toFixed(4) : (usdtToSend * numRate * (1 + feeRate / 100)).toFixed(4),
        fiatCurrency, exchangeRate: buyRate, depositFeeRate,
        fromAccountId: preview?.fromAccountId || acct?.code || "1521",
      }),
    onSuccess: (d: CryptoSend) => {
      setConfirmOpen(false);
      toast({ title: "USDT Sent", description: `${d.sendNumber} — TX: ${shortHash(d.txHash ?? "")}` });
      setFiatAmount(""); setManualUsdt(""); setRecipientAddress(""); setSelectedCustomer(null);
      setAddrMatch(null); setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["/api/crypto-sends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crypto-sends/account-info"] });
    },
    onError: (e: Error) => { setConfirmOpen(false); toast({ title: "Send failed", description: e.message, variant: "destructive" }); },
  });

  const filtered = customers.filter(c =>
    !customerSearch ||
    c.fullName?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phonePrimary?.includes(customerSearch) ||
    c.customerId?.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const canPreview = !!selectedCustomer && recipientAddress.length > 10 && usdtToSend > 0;
  const provWallets = custWallets.filter(w =>
    w.providerId === prov?.id || w.providerName?.toLowerCase() === prov?.name?.toLowerCase()
  );
  const rateOptions = rates.filter(r =>
    (r.fromCurrency === fiatCurrency && r.toCurrency === "USD") ||
    (r.fromCurrency === "USD" && r.toCurrency === fiatCurrency)
  ).slice(0, 3);

  if (acctLoading) {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="grid grid-cols-1 xl:grid-cols-[460px_1fr] gap-6">
            <Skeleton className="h-[500px] rounded-xl" />
            <Skeleton className="h-[500px] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (acctError || !acctInfo) {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Alert variant="destructive">
            <ShieldAlert className="w-4 h-4" />
            <AlertDescription>
              <strong>Cannot load Send Crypto.</strong>{" "}
              {(acctError as Error)?.message || "Account 1521 (Auto Send Wallet) or its provider is not configured."}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Header — compact */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Send Crypto
          </h1>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/crypto-sends/account-info"] })}
            data-testid="button-refresh-balance">
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
        </div>

        {/* Wallet strip */}
        {!configured ? (
          <Alert variant="destructive">
            <ShieldAlert className="w-4 h-4" />
            <AlertDescription>
              Wallet not configured. Set <code className="bg-muted px-1 rounded text-xs">TRUST_WALLET_PRIVATE_KEY</code> to enable sending.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-2.5">
            <Wallet className="w-4 h-4 text-primary shrink-0" />
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
              <span>{shortAddr(wlt!.address)}</span>
              <CopyBtn value={wlt!.address} />
              <a href={`${BSCSCAN_ADDR}${wlt!.address}`} target="_blank" rel="noreferrer" className="hover:text-primary" data-testid="link-bscscan-wallet">
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <span className="text-sm font-bold font-mono">{wltUsdt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
            <span className="text-xs text-muted-foreground">USDT</span>
            <Separator orientation="vertical" className="h-5" />
            <span className="text-xs font-mono text-muted-foreground">{parseFloat(wlt!.bnbBalance).toFixed(4)} BNB</span>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[460px_1fr] gap-6">

          {/* ── Form ── */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b bg-muted/30">
              <h2 className="text-sm font-semibold">New Outflow</h2>
            </div>

            <div className="p-5 space-y-4">

              {/* Customer */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Customer <span className="text-destructive">*</span></label>
                <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                  <PopoverTrigger asChild>
                    <button data-testid="button-select-customer"
                      className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-left hover:bg-accent/50 transition-colors">
                      {selectedCustomer
                        ? <span className="font-medium">{selectedCustomer.fullName}</span>
                        : <span className="text-muted-foreground">Select customer…</span>}
                      <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[420px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Name, phone, or ID…" value={customerSearch}
                        onValueChange={setCustomerSearch} data-testid="input-customer-search" />
                      <CommandList className="max-h-56">
                        <CommandEmpty>No customers found.</CommandEmpty>
                        <CommandGroup>
                          {filtered.slice(0, 50).map(c => (
                            <CommandItem key={c.id} value={c.fullName}
                              onSelect={() => { setSelectedCustomer(c); setCustomerOpen(false); setCustomerSearch(""); setRecipientAddress(""); setAddrMatch(null); }}
                              data-testid={`item-customer-${c.id}`}>
                              <Check className={`w-3.5 h-3.5 mr-2 shrink-0 ${selectedCustomer?.id === c.id ? "opacity-100" : "opacity-0"}`} />
                              <div className="flex flex-col">
                                <span className="font-medium text-sm">{c.fullName}</span>
                                <span className="text-xs text-muted-foreground">{c.customerId} · {c.phonePrimary}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedCustomer && (
                  <button onClick={() => { setSelectedCustomer(null); setRecipientAddress(""); setAddrMatch(null); }}
                    className="text-[11px] text-muted-foreground hover:text-destructive" data-testid="button-clear-customer">
                    Clear
                  </button>
                )}
              </div>

              {/* Wallet address */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Recipient Address <span className="text-destructive">*</span></label>
                <div className="relative">
                  <Input data-testid="input-recipient-address" placeholder="0x…" value={recipientAddress}
                    onChange={e => onAddrChange(e.target.value)} className="font-mono text-xs pr-8 h-9" />
                  {addrLoading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                </div>
                {addrMatch && (
                  <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {addrMatch}
                  </p>
                )}
                {provWallets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {provWallets.map(w => (
                      <button key={w.id} onClick={() => { setRecipientAddress(w.addressOrId); setAddrMatch(null); }}
                        data-testid={`button-wallet-${w.id}`}
                        className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-mono transition-colors hover:bg-accent ${
                          recipientAddress === w.addressOrId ? "border-primary bg-primary/5" : "border-border"}`}>
                        {shortAddr(w.addressOrId)}
                        {w.isDefault && <Badge variant="secondary" className="text-[9px] h-3.5 px-1 py-0">Default</Badge>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Amount mode toggle */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Amount Entry:</label>
                <div className="flex rounded-md border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setAmountMode("fiat")}
                    className={`px-3 py-1 transition-colors ${amountMode === "fiat" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
                    data-testid="button-mode-fiat"
                  >
                    Fiat → USDT
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountMode("usdt")}
                    className={`px-3 py-1 transition-colors ${amountMode === "usdt" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
                    data-testid="button-mode-usdt"
                  >
                    Direct USDT
                  </button>
                </div>
              </div>

              {amountMode === "fiat" ? (
                <>
                  {/* Amount + Currency — same line */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Fiat Amount</label>
                    <div className="flex gap-2">
                      <Input data-testid="input-fiat-amount" type="number" step="0.01" min="0" placeholder="0.00"
                        value={fiatAmount} onChange={e => setFiatAmount(e.target.value)} className="font-mono flex-1 h-9" />
                      <Select value={fiatCurrency} onValueChange={v => { setFiatCurrency(v); setBuyRate(""); }}>
                        <SelectTrigger className="w-20 shrink-0 h-9 text-xs" data-testid="select-fiat-currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIAT_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Rate + Fee — same line */}
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Rate ({fiatCurrency}/USDT)</label>
                      <Input data-testid="input-buy-rate" type="number" step="0.000001" min="0" placeholder="e.g. 530"
                        value={buyRate} onChange={e => setBuyRate(e.target.value)} className="font-mono h-9" />
                      {fiatCurrency !== "USD" && rateOptions.length > 0 && (
                        <div className="flex gap-1.5">
                          {rateOptions.map(r => (
                            <button key={r.id} onClick={() => setBuyRate(parseFloat(String(r.buyRate ?? r.rate)).toFixed(6))}
                              data-testid={`button-rate-${r.id}`} className="text-[10px] text-primary hover:underline">
                              Sync {parseFloat(String(r.buyRate ?? r.rate)).toLocaleString()}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-28 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Fee %</label>
                      <div className="relative">
                        <Input data-testid="input-deposit-fee-rate" type="number" step="0.01" min="0" max="100"
                          value={depositFeeRate} onChange={e => setDepositFeeRate(e.target.value)}
                          className="font-mono h-9 pr-6" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                      </div>
                      {feeRate !== prov!.depositFeeRate && (
                        <button onClick={() => setDepositFeeRate(String(prov!.depositFeeRate))}
                          className="text-[10px] text-primary hover:underline" data-testid="button-reset-fee">
                          Reset {prov!.depositFeeRate}%
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Direct USDT input */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">USDT Amount</label>
                    <Input data-testid="input-manual-usdt" type="number" step="0.000001" min="0" placeholder="0.000000"
                      value={manualUsdt} onChange={e => setManualUsdt(e.target.value)} className="font-mono h-9" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Fee %</label>
                      <div className="relative">
                        <Input data-testid="input-deposit-fee-rate-manual" type="number" step="0.01" min="0" max="100"
                          value={depositFeeRate} onChange={e => setDepositFeeRate(e.target.value)}
                          className="font-mono h-9 pr-6" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Rate (optional)</label>
                      <Input data-testid="input-buy-rate-manual" type="number" step="0.000001" min="0" placeholder="e.g. 530"
                        value={buyRate} onChange={e => setBuyRate(e.target.value)} className="font-mono h-9" />
                    </div>
                  </div>
                </>
              )}

              {/* USDT result */}
              <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs font-medium">USDT to send</span>
                <span className="text-lg font-bold font-mono text-primary">
                  {usdtToSend > 0 ? usdtToSend.toFixed(6) : "—"}
                </span>
              </div>

              {usdtToSend > 0 && configured && usdtToSend > wltUsdt && (
                <p className="text-[11px] text-destructive">
                  Exceeds balance ({wltUsdt.toFixed(4)} USDT available)
                </p>
              )}

              {/* Debit breakdown — compact */}
              <div className="rounded-md border divide-y text-xs">
                <div className="px-3 py-1.5 flex justify-between text-muted-foreground">
                  <span>USDT to send</span>
                  <span className="font-mono">{usdtToSend > 0 ? usdtToSend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "—"} USDT</span>
                </div>
                <div className="px-3 py-1.5 flex justify-between text-muted-foreground">
                  <span>Fee ({feeRate}%)</span>
                  <span className="font-mono">{feeUsd > 0 ? `+${feeUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : "—"} USD</span>
                </div>
                <div className="px-3 py-2 flex justify-between font-semibold bg-muted/30">
                  <span>Total Debit</span>
                  <span className="font-mono">{(usdtToSend + feeUsd) > 0 ? (usdtToSend + feeUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "—"} USD</span>
                </div>
              </div>

              <Button data-testid="button-preview-send" className="w-full gap-2 h-10"
                disabled={!canPreview || !configured || previewMut.isPending}
                onClick={() => previewMut.mutate()}>
                {previewMut.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculating…</>
                  : <><ArrowRight className="w-4 h-4" /> Review & Send</>}
              </Button>

              {!configured && (
                <p className="text-[11px] text-center text-destructive">Set TRUST_WALLET_PRIVATE_KEY to enable.</p>
              )}
            </div>
          </div>

          {/* ── History ── */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between">
              <h2 className="text-sm font-semibold">History <span className="text-muted-foreground font-normal ml-1 text-xs">{histResult?.total ?? 0}</span></h2>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/crypto-sends"] })}
                data-testid="button-refresh-history">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="overflow-x-auto">
              {histLoading ? (
                <div className="p-4 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <Send className="w-8 h-8 text-muted-foreground/20 mb-2" />
                  <p className="text-xs text-muted-foreground">No transactions yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent text-[11px]">
                      <TableHead className="pl-4">Send #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>USDT</TableHead>
                      <TableHead>Fiat</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>Total Debit</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>TX</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map(s => (
                      <TableRow key={s.id} data-testid={`row-send-${s.id}`} className="text-xs">
                        <TableCell className="pl-4 font-mono font-medium whitespace-nowrap">{s.sendNumber}</TableCell>
                        <TableCell className="max-w-[90px] truncate">{s.customerName}</TableCell>
                        <TableCell className="font-mono font-semibold whitespace-nowrap">
                          {parseFloat(String(s.amount)).toFixed(4)}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                          {s.usdEquivalent ? parseFloat(String(s.usdEquivalent)).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                          {s.depositFeeUsd ? parseFloat(String(s.depositFeeUsd)).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "0"}
                        </TableCell>
                        <TableCell className="font-mono font-semibold whitespace-nowrap">
                          {s.totalDebitUsd ? parseFloat(String(s.totalDebitUsd)).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                        </TableCell>
                        <TableCell className="font-mono whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {shortAddr(s.recipientAddress)}
                            <CopyBtn value={s.recipientAddress} />
                          </span>
                        </TableCell>
                        <TableCell><StatusBadge status={s.status} /></TableCell>
                        <TableCell className="font-mono whitespace-nowrap">
                          {s.txHash ? (
                            <span className="inline-flex items-center gap-1">
                              {shortHash(s.txHash)}
                              <CopyBtn value={s.txHash} />
                              <a href={`${BSCSCAN_TX}${s.txHash}`} target="_blank" rel="noreferrer"
                                className="text-muted-foreground hover:text-primary" data-testid={`link-bscscan-${s.id}`}>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {s.createdAt ? formatDistanceToNow(new Date(s.createdAt), { addSuffix: true }) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  Page {histPage} of {totalPages} ({histResult?.total ?? 0} total)
                </span>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs"
                    disabled={histPage <= 1}
                    onClick={() => setHistPage(p => Math.max(1, p - 1))}
                    data-testid="button-page-prev">
                    <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs"
                    disabled={histPage >= totalPages}
                    onClick={() => setHistPage(p => p + 1)}
                    data-testid="button-page-next">
                    Next <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirm Dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={v => { if (!execMut.isPending) setConfirmOpen(v); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-confirm-send">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              Confirm Send
            </DialogTitle>
            <DialogDescription className="text-xs">
              Irreversible blockchain transaction. Check all details carefully.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-2.5 py-1">
              <div className="rounded-md border divide-y text-sm">
                <div className="px-3 py-2 space-y-0.5">
                  <Row label="Customer" value={preview.customerName} />
                  <Row label="To" value={<span className="font-mono text-xs">{shortAddr(preview.recipientAddress)}</span>} />
                </div>
                <div className="px-3 py-2.5">
                  <Row label="USDT to Send" value={
                    <span className="text-primary font-mono">{parseFloat(preview.usdtAmount).toFixed(6)} USDT</span>
                  } bold />
                  <Row label="Rate" value={<span className="font-mono text-xs">{parseFloat(preview.exchangeRate).toLocaleString()} {preview.fiatCurrency}/USDT</span>} />
                </div>
                <div className="px-3 py-2 space-y-0.5">
                  <Row label="USDT on-chain" value={<span className="font-mono">{parseFloat(preview.usdtAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })} USDT</span>} />
                  <Row label={`Fee (${parseFloat(preview.depositFeeRate).toFixed(2)}%)`} value={<span className="font-mono">+{parseFloat(preview.depositFeeFiat).toLocaleString("en-US", { minimumFractionDigits: 2 })} USD</span>} />
                  <Separator className="my-1" />
                  <Row label="Total Debit" value={
                    <span className="font-mono">{(parseFloat(preview.usdtAmount) + parseFloat(preview.depositFeeFiat)).toLocaleString("en-US", { minimumFractionDigits: 2 })} USD</span>
                  } bold />
                </div>
              </div>

              {!preview.sufficientBalance ? (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <AlertDescription className="text-xs">
                    Insufficient USDT. Need {parseFloat(preview.usdtAmount).toFixed(4)}, have {parseFloat(preview.walletBalance).toFixed(4)}.
                  </AlertDescription>
                </Alert>
              ) : (
                <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1 px-1">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  Balance OK — {parseFloat(preview.walletBalance).toFixed(4)} USDT
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={execMut.isPending} data-testid="button-cancel-send">
              Cancel
            </Button>
            <Button size="sm" onClick={() => execMut.mutate()}
              disabled={execMut.isPending || !preview?.sufficientBalance}
              className="gap-1.5 min-w-[120px]" data-testid="button-confirm-send">
              {execMut.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
              ) : (
                <><Send className="w-3.5 h-3.5" /> Send {preview ? parseFloat(preview.usdtAmount).toFixed(4) : "—"} USDT</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
