import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle, ShieldAlert, Zap, AlertCircle, CheckCircle2,
  TrendingDown, Clock, User, RefreshCw, Info, XCircle, Eye
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface ComplianceAlert {
  id: string;
  alertType: "structuring" | "kyc_limit_breach" | "blacklist_hit" | "liquidity_warning" | "orphan_record" | "velocity_breach" | "large_transaction";
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "resolved" | "false_positive";
  customerId?: string;
  customerName?: string;
  recordId?: string;
  transactionId?: string;
  title: string;
  description: string;
  detectedValue?: string;
  thresholdValue?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const alertTypeConfig: { [k: string]: { label: string; icon: typeof AlertTriangle; color: string; bg: string } } = {
  structuring:      { label: "Structuring",      icon: AlertTriangle,  color: "text-red-700 dark:text-red-300",    bg: "bg-red-100 dark:bg-red-900/30"    },
  kyc_limit_breach: { label: "KYC Limit",        icon: ShieldAlert,    color: "text-amber-700 dark:text-amber-300",bg: "bg-amber-100 dark:bg-amber-900/30"},
  blacklist_hit:    { label: "Blacklist Hit",     icon: XCircle,        color: "text-rose-700 dark:text-rose-300",  bg: "bg-rose-100 dark:bg-rose-900/30"  },
  liquidity_warning:{ label: "Liquidity",         icon: TrendingDown,   color: "text-orange-700 dark:text-orange-300",bg:"bg-orange-100 dark:bg-orange-900/30"},
  orphan_record:    { label: "Orphan Record",     icon: Clock,          color: "text-yellow-700 dark:text-yellow-300",bg:"bg-yellow-100 dark:bg-yellow-900/30"},
  velocity_breach:  { label: "Velocity Breach",   icon: Zap,            color: "text-purple-700 dark:text-purple-300",bg:"bg-purple-100 dark:bg-purple-900/30"},
  large_transaction:{ label: "Large Transaction", icon: AlertCircle,    color: "text-blue-700 dark:text-blue-300",  bg: "bg-blue-100 dark:bg-blue-900/30"  },
};

const severityConfig: { [k: string]: { label: string; color: string; dot: string } } = {
  critical: { label: "Critical", color: "text-red-600 dark:text-red-400",    dot: "bg-red-500 animate-pulse" },
  warning:  { label: "Warning",  color: "text-amber-600 dark:text-amber-400",dot: "bg-amber-500" },
  info:     { label: "Info",     color: "text-blue-600 dark:text-blue-400",  dot: "bg-blue-400"  },
};

const statusConfig: { [k: string]: { label: string; color: string; bg: string } } = {
  open:           { label: "Open",           color: "text-red-700 dark:text-red-300",    bg: "bg-red-100 dark:bg-red-900/30"         },
  acknowledged:   { label: "Acknowledged",   color: "text-amber-700 dark:text-amber-300",bg: "bg-amber-100 dark:bg-amber-900/30"     },
  resolved:       { label: "Resolved",       color: "text-emerald-700 dark:text-emerald-300",bg:"bg-emerald-100 dark:bg-emerald-900/30"},
  false_positive: { label: "False Positive", color: "text-gray-600 dark:text-gray-400",  bg: "bg-gray-100 dark:bg-gray-800/50"       },
};

// ─── Resolve Dialog ───────────────────────────────────────────────────────────

function ResolveDialog({ alert, onClose }: { alert: ComplianceAlert; onClose: () => void }) {
  const { toast } = useToast();
  const [newStatus, setNewStatus] = useState<string>("resolved");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/compliance/alerts/${alert.id}`, { status: newStatus, resolutionNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/alerts/count"] });
      toast({ title: `Alert ${newStatus}` });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Alert Status</DialogTitle>
          <DialogDescription>{alert.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">New Status</label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="acknowledged">Acknowledge (under investigation)</SelectItem>
                <SelectItem value="resolved">Resolve (issue addressed)</SelectItem>
                <SelectItem value="false_positive">False Positive (dismiss)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Resolution Notes</label>
            <Textarea
              className="mt-1"
              rows={3}
              placeholder="Explain the resolution, actions taken, or why this is a false positive…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              data-testid="textarea-resolution-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-confirm-status">
            {mutation.isPending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ComplianceAlertsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter]     = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter]         = useState<string>("all");
  const [search, setSearch]                 = useState("");
  const [resolveTarget, setResolveTarget]   = useState<ComplianceAlert | null>(null);

  const { data: alerts = [], isLoading, refetch } = useQuery<ComplianceAlert[]>({
    queryKey: ["/api/compliance/alerts"],
  });

  const ackMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/compliance/alerts/${id}`, { status: "acknowledged" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/alerts/count"] });
      toast({ title: "Alert acknowledged" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Filter
  const filtered = alerts.filter(a => {
    if (statusFilter !== "all"   && a.status    !== statusFilter)   return false;
    if (severityFilter !== "all" && a.severity  !== severityFilter) return false;
    if (typeFilter !== "all"     && a.alertType !== typeFilter)     return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !(a.customerName?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const openCriticals = alerts.filter(a => a.status === "open" && a.severity === "critical").length;
  const openWarnings  = alerts.filter(a => a.status === "open" && a.severity === "warning").length;
  const resolvedToday = alerts.filter(a => {
    if (a.status !== "resolved") return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(a.updatedAt) >= today;
  }).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/95">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            Compliance Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AML, KYC, structuring detection, and liquidity warnings
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-alerts">
          <RefreshCw className="w-4 h-4 mr-2" />Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 px-6 pt-4">
        <div className={`rounded-lg border p-3 ${openCriticals > 0 ? "border-red-200 bg-red-50 dark:bg-red-900/20" : "border-border bg-muted/30"}`}>
          <p className={`text-2xl font-bold ${openCriticals > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{openCriticals}</p>
          <p className={`text-xs mt-0.5 ${openCriticals > 0 ? "text-red-500" : "text-muted-foreground"}`}>Open Criticals</p>
        </div>
        <div className={`rounded-lg border p-3 ${openWarnings > 0 ? "border-amber-200 bg-amber-50 dark:bg-amber-900/20" : "border-border bg-muted/30"}`}>
          <p className={`text-2xl font-bold ${openWarnings > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{openWarnings}</p>
          <p className={`text-xs mt-0.5 ${openWarnings > 0 ? "text-amber-500" : "text-muted-foreground"}`}>Open Warnings</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 p-3">
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{resolvedToday}</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Resolved Today</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-6 pt-3 pb-2 flex-wrap">
        <Input
          placeholder="Search alerts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 w-48 text-sm"
          data-testid="input-search-alerts"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="false_positive">False Positive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(alertTypeConfig).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(statusFilter !== "all" || severityFilter !== "all" || typeFilter !== "all" || search) && (
          <Button size="sm" variant="ghost" className="h-8 text-xs"
            onClick={() => { setStatusFilter("all"); setSeverityFilter("all"); setTypeFilter("all"); setSearch(""); }}>
            Clear
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} alert{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Alert List */}
      <div className="flex-1 overflow-auto px-6 pb-6 space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-xl p-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="font-semibold text-foreground mb-1">No alerts matching filters</p>
            <p className="text-sm text-muted-foreground">
              {alerts.length === 0 ? "The compliance engine is running — alerts will appear here when triggered." : "Try adjusting your filters."}
            </p>
          </div>
        ) : (
          filtered.map(alert => {
            const typeCfg = alertTypeConfig[alert.alertType];
            const sevCfg  = severityConfig[alert.severity];
            const statCfg = statusConfig[alert.status];
            const TypeIcon = typeCfg?.icon ?? AlertTriangle;
            const isOpen   = alert.status === "open";

            return (
              <div key={alert.id}
                className={`border rounded-xl p-4 transition-colors ${isOpen && alert.severity === "critical" ? "border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-900/5" : "border-border bg-card"}`}
                data-testid={`alert-card-${alert.id}`}>
                <div className="flex items-start gap-3">
                  {/* Severity dot + icon */}
                  <div className="mt-0.5 flex flex-col items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${sevCfg?.dot ?? "bg-gray-400"}`} />
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${typeCfg?.bg ?? "bg-muted"}`}>
                      <TypeIcon className={`w-4 h-4 ${typeCfg?.color ?? "text-muted-foreground"}`} />
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm text-foreground">{alert.title}</span>
                      <Badge className={`text-xs ${typeCfg?.bg ?? ""} ${typeCfg?.color ?? ""}`}>{typeCfg?.label}</Badge>
                      <Badge className={`text-xs ${statCfg?.bg ?? ""} ${statCfg?.color ?? ""}`}>{statCfg?.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{alert.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {alert.customerName && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />{alert.customerName}
                        </span>
                      )}
                      {alert.detectedValue && alert.thresholdValue && (
                        <span className="font-mono">
                          Detected: <span className={`font-semibold ${sevCfg?.color}`}>${parseFloat(alert.detectedValue).toFixed(2)}</span>
                          {" "} / Threshold: ${parseFloat(alert.thresholdValue).toFixed(2)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    {alert.resolutionNotes && (
                      <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                        <span className="font-medium">Resolution: </span>{alert.resolutionNotes}
                        {alert.resolvedAt && <span className="ml-2 opacity-60">— {format(new Date(alert.resolvedAt), "PP")}</span>}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isOpen && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => ackMutation.mutate(alert.id)}
                        disabled={ackMutation.isPending}
                        data-testid={`button-ack-alert-${alert.id}`}>
                        <Eye className="w-3 h-3 mr-1" />Ack
                      </Button>
                    )}
                    {alert.status !== "resolved" && alert.status !== "false_positive" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => setResolveTarget(alert)}
                        data-testid={`button-resolve-alert-${alert.id}`}>
                        <CheckCircle2 className="w-3 h-3 mr-1" />Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {resolveTarget && (
        <ResolveDialog alert={resolveTarget} onClose={() => setResolveTarget(null)} />
      )}
    </div>
  );
}
