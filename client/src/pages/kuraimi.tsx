import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Landmark, Send, RotateCcw, Search, AlertTriangle, CheckCircle,
  XCircle, Clock, Link2, ChevronLeft, ChevronRight, RefreshCw,
  Wallet, ArrowDownLeft, ArrowUpRight, Activity,
} from "lucide-react";
import { format } from "date-fns";

interface AccountStatementResult {
  balance: any;
  lastTransaction: any;
  rawResponse: any;
}

interface KuraimiPayment {
  id: string;
  refNo: string;
  bankRefNo: string | null;
  customerId: string | null;
  customerName: string | null;
  scustId: string;
  amount: string;
  currency: string;
  merchantName: string;
  direction: string;
  status: string;
  recordId: string | null;
  apiCode: number | null;
  apiMessage: string | null;
  apiMessageDesc: string | null;
  reversedAt: string | null;
  reversalRefNo: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaymentsResponse {
  data: KuraimiPayment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  pending:  { label: "Pending",  icon: Clock,       className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  success:  { label: "Success",  icon: CheckCircle, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  failed:   { label: "Failed",   icon: XCircle,     className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  reversed: { label: "Reversed", icon: RotateCcw,   className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
};

function NewPaymentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scustId, setScustId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("YER");
  const [pinPass, setPinPass] = useState("");
  const [customerName, setCustomerName] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/kuraimi/send-payment", {
        scustId, amount: parseFloat(amount), currency, pinPass, customerName,
      });
    },
    onSuccess: async (res: any) => {
      const data = await res.json?.() ?? res;
      queryClient.invalidateQueries({ queryKey: ["/api/kuraimi/payments"] });
      if (data.apiResponse?.Code === 1) {
        toast({ title: "Payment sent successfully", description: `Bank Ref: ${data.apiResponse.ResultSet?.PH_REF_NO || "N/A"}` });
      } else {
        toast({ title: "Payment submitted", description: data.apiResponse?.Message || "Check status", variant: "destructive" });
      }
      onClose();
      resetForm();
    },
    onError: (e: any) => {
      toast({ title: "Payment failed", description: e.message, variant: "destructive" });
    },
  });

  const resetForm = () => { setScustId(""); setAmount(""); setCurrency("YER"); setPinPass(""); setCustomerName(""); };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); resetForm(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            Send Kuraimi Payment
          </DialogTitle>
          <DialogDescription>
            Send a payment through Kuraimi Bank ePay
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Customer ID (SCustID) *</label>
            <Input
              value={scustId} onChange={e => setScustId(e.target.value)}
              placeholder="e.g. CUST001"
              data-testid="input-kuraimi-scustid"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Customer Name</label>
            <Input
              value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="Optional — for your records"
              data-testid="input-kuraimi-customer-name"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Amount *</label>
              <Input
                type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                data-testid="input-kuraimi-amount"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger data-testid="select-kuraimi-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YER">YER</SelectItem>
                  <SelectItem value="SAR">SAR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">PIN / Password *</label>
            <Input
              type="password" value={pinPass} onChange={e => setPinPass(e.target.value)}
              placeholder="4-digit PIN"
              maxLength={6}
              data-testid="input-kuraimi-pin"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); resetForm(); }}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !scustId || !amount || !pinPass}
            data-testid="button-kuraimi-send"
          >
            {mutation.isPending ? "Sending..." : "Send Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDetailDialog({ payment, onClose }: { payment: KuraimiPayment; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canReverse = user?.role === "admin" || user?.role === "operations_manager";

  const reverseMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/kuraimi/reverse-payment/${payment.id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kuraimi/payments"] });
      toast({ title: "Payment reversed" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Reversal failed", description: e.message, variant: "destructive" }),
  });

  const sc = statusConfig[payment.status] || statusConfig.pending;
  const StatusIcon = sc.icon;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            Payment Details
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{payment.refNo}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge className={`${sc.className} flex items-center gap-1`}>
              <StatusIcon className="w-3 h-3" />{sc.label}
            </Badge>
            {payment.bankRefNo && (
              <span className="text-xs text-muted-foreground">Bank Ref: {payment.bankRefNo}</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Customer ID</p>
              <p className="font-semibold">{payment.scustId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Customer Name</p>
              <p className="font-semibold">{payment.customerName || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Amount</p>
              <p className="font-bold text-lg">{parseFloat(payment.amount).toLocaleString()} {payment.currency}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Merchant</p>
              <p className="font-semibold">{payment.merchantName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="font-semibold">{format(new Date(payment.createdAt), "MMM d, yyyy HH:mm")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Linked Record</p>
              <p className="font-semibold">{payment.recordId || "—"}</p>
            </div>
          </div>

          {payment.apiMessage && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="text-xs text-muted-foreground mb-1">API Response</p>
              <p>{payment.apiMessage}</p>
              {payment.apiMessageDesc && <p className="text-muted-foreground mt-1">{payment.apiMessageDesc}</p>}
            </div>
          )}

          {payment.reversedAt && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-sm">
              <p className="text-xs text-muted-foreground mb-1">Reversed</p>
              <p>{format(new Date(payment.reversedAt), "MMM d, yyyy HH:mm")}</p>
              {payment.reversalRefNo && <p className="text-xs text-muted-foreground">Ref: {payment.reversalRefNo}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {canReverse && payment.status === "success" && !payment.reversedAt && (
            <Button
              variant="destructive"
              onClick={() => { if (confirm("Are you sure you want to reverse this payment?")) reverseMutation.mutate(); }}
              disabled={reverseMutation.isPending}
              data-testid="button-kuraimi-reverse"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {reverseMutation.isPending ? "Reversing..." : "Reverse Payment"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountStatementCard({ configured }: { configured: boolean }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [result, setResult] = useState<AccountStatementResult | null>(null);
  const [probeResult, setProbeResult] = useState<Record<string, any> | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showProbe, setShowProbe] = useState(false);
  const isAdmin = user?.role === "admin" || user?.role === "operations_manager";

  const fetchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/kuraimi/account-statement", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch account statement");
      return data as AccountStatementResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "Account statement fetched successfully" });
    },
    onError: (e: any) => {
      toast({ title: "Failed to fetch account statement", description: e.message, variant: "destructive" });
    },
  });

  const probeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/kuraimi/probe", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Probe failed");
      return data;
    },
    onSuccess: (data) => {
      setProbeResult(data);
      setShowProbe(true);
      toast({ title: "API probe complete", description: "Check results below" });
    },
    onError: (e: any) => {
      toast({ title: "Probe failed", description: e.message, variant: "destructive" });
    },
  });

  const tx = result?.lastTransaction;
  const balance = result?.balance;

  function renderTxField(label: string, value: any) {
    if (value === null || value === undefined || value === "") return null;
    return (
      <div key={label}>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold text-sm">{String(value)}</p>
      </div>
    );
  }

  function flattenObj(obj: any, prefix = ""): Record<string, string> {
    if (!obj || typeof obj !== "object") return {};
    return Object.entries(obj).reduce((acc: Record<string, string>, [k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        Object.assign(acc, flattenObj(v, key));
      } else {
        acc[key] = String(v);
      }
      return acc;
    }, {});
  }

  return (
    <Card className="mb-4 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            Kuraimi Account — Last Transaction
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <Button
                variant="ghost" size="sm"
                onClick={() => probeMutation.mutate()}
                disabled={probeMutation.isPending || !configured}
                data-testid="button-kuraimi-probe"
              >
                <Activity className="w-3.5 h-3.5 mr-1" />
                {probeMutation.isPending ? "Probing..." : "Probe API"}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => fetchMutation.mutate()}
              disabled={fetchMutation.isPending || !configured}
              data-testid="button-kuraimi-fetch-statement"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${fetchMutation.isPending ? "animate-spin" : ""}`} />
              {fetchMutation.isPending ? "Fetching..." : result ? "Refresh" : "Fetch Last Transaction"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!configured && (
          <p className="text-sm text-muted-foreground">Configure Kuraimi credentials to enable account inquiry.</p>
        )}

        {configured && !result && !fetchMutation.isPending && (
          <p className="text-sm text-muted-foreground">
            Click "Fetch Last Transaction" to retrieve your latest Kuraimi Jawal bank transaction.
          </p>
        )}

        {fetchMutation.isPending && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {result && !fetchMutation.isPending && (
          <div className="space-y-4">
            {balance !== null && balance !== undefined && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                <p className="text-xs text-muted-foreground mb-1">Current Balance</p>
                <p className="text-2xl font-bold text-primary" data-testid="text-kuraimi-balance">
                  {typeof balance === "number" ? balance.toLocaleString() : balance}
                </p>
              </div>
            )}

            {tx && (
              <div className="rounded-lg bg-muted/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    {(tx.Type || tx.type || tx.TxType || "").toLowerCase().includes("credit")
                      ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                      : <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />
                    }
                  </div>
                  <p className="text-sm font-semibold">Last Transaction</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(flattenObj(tx)).map(([k, v]) => renderTxField(k, v))}
                </div>
              </div>
            )}

            {!tx && (
              <div className="text-sm text-muted-foreground rounded-lg bg-muted/40 p-4">
                No transaction details found in response.
                <button
                  className="ml-2 text-primary underline text-xs"
                  onClick={() => setShowRaw(!showRaw)}
                >
                  {showRaw ? "Hide" : "Show"} raw response
                </button>
              </div>
            )}

            {(showRaw || tx) && result.rawResponse && (
              <div>
                <button
                  className="text-xs text-muted-foreground underline mb-2"
                  onClick={() => setShowRaw(!showRaw)}
                >
                  {showRaw ? "Hide" : "Show"} raw API response
                </button>
                {showRaw && (
                  <pre className="text-xs bg-muted rounded-lg p-3 overflow-auto max-h-64 border border-border"
                    data-testid="text-kuraimi-raw-response"
                  >
                    {JSON.stringify(result.rawResponse, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {showProbe && probeResult && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endpoint Probe Results</p>
              <button className="text-xs text-muted-foreground underline" onClick={() => setShowProbe(false)}>Hide</button>
            </div>
            <pre className="text-xs bg-muted rounded-lg p-3 overflow-auto max-h-80 border border-border"
              data-testid="text-kuraimi-probe-results"
            >
              {JSON.stringify(probeResult, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function KuraimiPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<KuraimiPayment | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: status } = useQuery<{ configured: boolean }>({ queryKey: ["/api/kuraimi/status"] });
  const { data: paymentsRes, isLoading } = useQuery<PaymentsResponse>({
    queryKey: ["/api/kuraimi/payments", page],
    queryFn: async () => {
      const res = await fetch(`/api/kuraimi/payments?page=${page}&limit=20`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const payments = paymentsRes?.data || [];
  const filtered = payments.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        p.refNo.toLowerCase().includes(s) ||
        p.scustId.toLowerCase().includes(s) ||
        (p.customerName || "").toLowerCase().includes(s) ||
        (p.bankRefNo || "").toLowerCase().includes(s) ||
        p.amount.includes(s)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" />
            Kuraimi ePay
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Send & manage bank payments via Kuraimi
          </p>
        </div>
        <Button onClick={() => setShowNewPayment(true)} disabled={!status?.configured} data-testid="button-new-kuraimi-payment">
          <Send className="w-4 h-4 mr-2" />New Payment
        </Button>
      </div>

      {!status?.configured && (
        <Alert className="mb-4 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
          <AlertDescription className="text-sm">
            Kuraimi is not configured. Add <strong>KURAIMI_USERNAME</strong> and <strong>KURAIMI_PASSWORD</strong> in
            your environment secrets to enable payments. Optionally set <strong>KURAIMI_ENV</strong> (UAT/PROD),
            <strong> KURAIMI_MERCHANT_NAME</strong>, and <strong>KURAIMI_BASE_URL</strong>.
          </AlertDescription>
        </Alert>
      )}

      <AccountStatementCard configured={!!status?.configured} />

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ref, customer, amount..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-kuraimi-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-kuraimi-status-filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : !filtered.length ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <Landmark className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">No payments found</p>
              <p className="text-xs mt-1">Send your first Kuraimi payment to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(p => {
                const sc = statusConfig[p.status] || statusConfig.pending;
                const StatusIcon = sc.icon;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setSelectedPayment(p)}
                    data-testid={`kuraimi-payment-${p.id}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Landmark className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{p.customerName || p.scustId}</span>
                        <Badge className={`text-[10px] ${sc.className} shrink-0`}>
                          <StatusIcon className="w-2.5 h-2.5 mr-0.5" />{sc.label}
                        </Badge>
                        {p.recordId && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            <Link2 className="w-2.5 h-2.5 mr-0.5" />Linked
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono">{p.refNo}</span>
                        {p.bankRefNo && <span>Bank: {p.bankRefNo}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm">{parseFloat(p.amount).toLocaleString()} {p.currency}</p>
                      <p className="text-[11px] text-muted-foreground">{format(new Date(p.createdAt), "MMM d, HH:mm")}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {paymentsRes && paymentsRes.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {paymentsRes.page} of {paymentsRes.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= paymentsRes.totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <NewPaymentDialog open={showNewPayment} onClose={() => setShowNewPayment(false)} />
      {selectedPayment && <PaymentDetailDialog payment={selectedPayment} onClose={() => setSelectedPayment(null)} />}
    </div>
  );
}
