import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Webhook, Send, CheckCircle, XCircle, Copy, Terminal, AlertTriangle, Loader2,
  Plus, Trash2, Edit, ArrowUpDown, ArrowDownUp, Globe, List, History,
  Inbox, Play, RefreshCw, Clock, CheckCheck,
} from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import type { ChartOfAccount } from "@shared/schema";

interface SmsWebhookConfig {
  id: string;
  slug: string;
  name: string;
  accountId: string;
  accountName: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
}

interface SmsParsingRule {
  id: string;
  configId: string;
  name: string;
  direction: string;
  clientAfterString: string;
  clientBeforeString: string;
  amountAfterString: string;
  amountBeforeString: string;
  isActive: boolean;
  sortOrder: number;
}

interface SmsWebhookLog {
  id: string;
  configId: string;
  ruleId: string;
  rawMessage: string;
  parsedClient: string | null;
  parsedAmount: string | null;
  parsedDirection: string | null;
  matchedCustomerId: string | null;
  matchMethod: string | null;
  matchScore: number | null;
  recordId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface SmsRawInboxEntry {
  id: string;
  configId: string | null;
  slug: string;
  sender: string | null;
  rawMessage: string;
  status: string; // pending | done | failed | skipped
  ruleId: string | null;
  parsedClient: string | null;
  parsedAmount: string | null;
  parsedDirection: string | null;
  matchedCustomerId: string | null;
  matchMethod: string | null;
  matchScore: number | null;
  recordId: string | null;
  errorMessage: string | null;
  receivedAt: string;
  processedAt: string | null;
}

interface SystemSetting {
  key: string;
  value: any;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

const configFormSchema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  name: z.string().min(2),
  accountId: z.string().min(1, "Select an account"),
  currency: z.string().min(1),
  isActive: z.boolean().default(true),
});

const ruleFormSchema = z.object({
  name: z.string().min(2),
  direction: z.enum(["inflow", "outflow"]),
  clientAfterString: z.string().min(1),
  clientBeforeString: z.string().min(1),
  amountAfterString: z.string().min(1),
  amountBeforeString: z.string().min(1),
  isActive: z.boolean().default(true),
  sortOrder: z.number().default(0),
});

export default function Webhooks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("endpoints");
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SmsWebhookConfig | null>(null);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<SmsParsingRule | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<"all" | "pending" | "done" | "failed">("all");
  const [expandedInboxId, setExpandedInboxId] = useState<string | null>(null);

  const { data: configs, isLoading: configsLoading } = useQuery<SmsWebhookConfig[]>({
    queryKey: ["/api/sms-webhook-configs"],
  });

  const { data: coaAccounts } = useQuery<ChartOfAccount[]>({
    queryKey: ["/api/accounting/accounts"],
  });

  const { data: rules, isLoading: rulesLoading } = useQuery<SmsParsingRule[]>({
    queryKey: ["/api/sms-webhook-configs", selectedConfigId, "rules"],
    queryFn: async () => {
      if (!selectedConfigId) return [];
      const res = await fetch(`/api/sms-webhook-configs/${selectedConfigId}/rules`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rules");
      return res.json();
    },
    enabled: !!selectedConfigId,
  });

  const { data: logs } = useQuery<SmsWebhookLog[]>({
    queryKey: ["/api/sms-webhook-logs"],
  });

  const { data: inboxEntries, isLoading: inboxLoading, refetch: refetchInbox } = useQuery<SmsRawInboxEntry[]>({
    queryKey: ["/api/sms-raw-inbox"],
  });

  const processAllMutation = useMutation({
    mutationFn: (configId?: string) =>
      apiRequest("POST", "/api/sms-raw-inbox/process", { configId }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-raw-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-webhook-logs"] });
      toast({ title: `Processed ${data.processed} messages — ${data.succeeded} succeeded, ${data.failed} failed` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const processOneMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sms-raw-inbox/${id}/process`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-raw-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-webhook-logs"] });
      toast({ title: "Message processed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteInboxMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sms-raw-inbox/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-raw-inbox"] });
      toast({ title: "Deleted" });
    },
  });

  const clearGarbageMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/sms-raw-inbox`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-raw-inbox"] });
      toast({ title: `Cleared ${data?.deleted ?? 0} test entries` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const pendingCount = inboxEntries?.filter(e => e.status === "pending").length ?? 0;
  const filteredInbox = inboxEntries?.filter(e => inboxFilter === "all" || e.status === inboxFilter) ?? [];

  const { data: settings } = useQuery<SystemSetting[]>({ queryKey: ["/api/settings"] });

  const selectedConfig = configs?.find(c => c.id === selectedConfigId);

  const { data: publicConfig } = useQuery<{ smsWebhookSecret: string }>({
    queryKey: ["/api/public-config"],
  });

  const secret = publicConfig?.smsWebhookSecret ?? "";
  const edgeFnUrl = (slug: string) =>
    secret
      ? `/api/sms-ingest?secret=${secret}&slug=${slug}&message={body}&sender={sender}`
      : "loading…";

  // Config CRUD mutations
  const createConfigMutation = useMutation({
    mutationFn: async (data: z.infer<typeof configFormSchema>) => {
      const acct = coaAccounts?.find(a => a.id === data.accountId);
      return apiRequest("POST", "/api/sms-webhook-configs", {
        ...data,
        accountName: acct?.name ?? data.accountId,
        currency: acct?.currency ?? data.currency,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-webhook-configs"] });
      setShowConfigDialog(false);
      setEditingConfig(null);
      toast({ title: "Endpoint created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<z.infer<typeof configFormSchema>> }) => {
      if (data.accountId) {
        const acct = coaAccounts?.find(a => a.id === data.accountId);
        (data as any).accountName = acct?.name ?? data.accountId;
        (data as any).currency = acct?.currency ?? data.currency;
      }
      return apiRequest("PATCH", `/api/sms-webhook-configs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-webhook-configs"] });
      setShowConfigDialog(false);
      setEditingConfig(null);
      toast({ title: "Endpoint updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sms-webhook-configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-webhook-configs"] });
      setSelectedConfigId(null);
      setActiveTab("endpoints");
      toast({ title: "Endpoint deleted" });
    },
  });

  // Rule CRUD mutations
  const createRuleMutation = useMutation({
    mutationFn: (data: z.infer<typeof ruleFormSchema>) =>
      apiRequest("POST", `/api/sms-webhook-configs/${selectedConfigId}/rules`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-webhook-configs", selectedConfigId, "rules"] });
      setShowRuleDialog(false);
      setEditingRule(null);
      toast({ title: "Parsing rule created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<z.infer<typeof ruleFormSchema>> }) =>
      apiRequest("PATCH", `/api/sms-webhook-configs/${selectedConfigId}/rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-webhook-configs", selectedConfigId, "rules"] });
      setShowRuleDialog(false);
      setEditingRule(null);
      toast({ title: "Rule updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/sms-webhook-configs/${selectedConfigId}/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-webhook-configs", selectedConfigId, "rules"] });
      toast({ title: "Rule deleted" });
    },
  });

  // SMS Test
  async function runSmsTest() {
    if (!selectedConfig) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/webhooks/sms/${selectedConfig.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage }),
      });
      const data = await res.json();
      setTestResult({ ok: res.ok, status: res.status, data });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-webhook-logs"] });
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTestLoading(false);
    }
  }

  // Filter CoA accounts: only asset accounts (cash banks/wallets) that have currencies
  const assetAccounts = coaAccounts?.filter(a => a.type === "asset" && a.currency) ?? [];

  return (
    <div className="flex flex-col h-full overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2" data-testid="text-page-title">
          <Webhook className="w-6 h-6 text-primary" />
          SMS Webhook Manager
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create webhook endpoints for each bank/asset account, define parsing rules, and auto-generate cash records from incoming SMS
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-webhook">
          <TabsTrigger value="endpoints" data-testid="tab-endpoints">
            <Globe className="w-4 h-4 mr-1.5" />
            Endpoints
          </TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules" disabled={!selectedConfigId}>
            <List className="w-4 h-4 mr-1.5" />
            Parsing Rules
          </TabsTrigger>
          <TabsTrigger value="test" data-testid="tab-test" disabled={!selectedConfigId}>
            <Terminal className="w-4 h-4 mr-1.5" />
            Test
          </TabsTrigger>
          <TabsTrigger value="inbox" data-testid="tab-inbox">
            <Inbox className="w-4 h-4 mr-1.5" />
            Inbox
            {pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-bold">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-logs">
            <History className="w-4 h-4 mr-1.5" />
            Logs
          </TabsTrigger>
        </TabsList>

        {/* ── ENDPOINTS TAB ──────────────────────────────────────────────────── */}
        <TabsContent value="endpoints" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Endpoint → CoA account + currency mapping
            </p>
            <Button
              size="sm"
              onClick={() => { setEditingConfig(null); setShowConfigDialog(true); }}
              data-testid="button-add-endpoint"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Endpoint
            </Button>
          </div>

          {configsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !configs?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Globe className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No webhook endpoints configured yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Create one to start receiving SMS from your bank gateway.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {configs.map(config => (
                <Card
                  key={config.id}
                  className={`cursor-pointer transition-colors ${selectedConfigId === config.id ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/30"}`}
                  onClick={() => setSelectedConfigId(config.id)}
                  data-testid={`card-endpoint-${config.slug}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${config.isActive ? "bg-emerald-500" : "bg-gray-400"}`} />
                        <div>
                          <p className="font-medium text-sm" data-testid={`text-endpoint-name-${config.slug}`}>{config.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-xs">
                              /api/webhooks/sms/{config.slug}?message={"{msg}"}&amp;time={"{local-time}"}
                            </code>
                            <Badge variant="outline" className="text-xs">{config.currency}</Badge>
                            <span className="text-xs text-muted-foreground">{config.accountName}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {selectedConfigId === config.id && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab("rules");
                              }}
                              data-testid={`button-rules-${config.slug}`}
                            >
                              <List className="w-3 h-3 mr-1" />
                              Rules
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab("test");
                              }}
                              data-testid={`button-test-${config.slug}`}
                            >
                              <Terminal className="w-3 h-3 mr-1" />
                              Test
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(edgeFnUrl(config.slug));
                            toast({ title: "URL copied — paste into Forward SMS app" });
                          }}
                          data-testid={`button-copy-${config.slug}`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingConfig(config);
                            setShowConfigDialog(true);
                          }}
                          data-testid={`button-edit-${config.slug}`}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Delete this endpoint and all its rules?")) {
                              deleteConfigMutation.mutate(config.id);
                            }
                          }}
                          data-testid={`button-delete-${config.slug}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {selectedConfig && (
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Inbox className="w-4 h-4 text-primary" />
                      Forward SMS → Supabase Edge Function
                      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-0 font-normal">GET · No headers · No body</Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Paste the URL into Forward SMS. Set method to <strong>GET</strong>. Leave headers and body completely empty.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono shrink-0">{selectedConfig.slug}</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-0">

                {/* Architecture flow */}
                <div className="flex items-center gap-1.5 text-[11px] py-3 flex-wrap">
                  <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-medium">📱 Phone</span>
                  <span className="text-slate-400">→</span>
                  <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-medium">Forward SMS App</span>
                  <span className="text-slate-400">→</span>
                  <span className="bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-700 px-2 py-1 rounded font-medium text-emerald-800 dark:text-emerald-300">Supabase Edge Function</span>
                  <span className="text-slate-400">→</span>
                  <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-medium">sms_raw_inbox</span>
                </div>

                <Separator />

                <div className="divide-y divide-slate-100 dark:divide-slate-800 pt-1">

                  {/* Method */}
                  <div className="grid grid-cols-[90px_1fr] items-center py-2.5 gap-3 text-xs">
                    <span className="font-semibold text-muted-foreground uppercase tracking-wide">Method</span>
                    <Badge className="w-fit text-[10px] px-2 py-0 font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-0">GET</Badge>
                  </div>

                  {/* URL — full self-contained URL, copy and paste */}
                  <div className="grid grid-cols-[90px_1fr] items-start py-2.5 gap-3 text-xs">
                    <span className="font-semibold text-muted-foreground uppercase tracking-wide pt-2">URL</span>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-3 py-2 font-mono break-all leading-relaxed text-[11px]" data-testid={`text-supabase-url-${selectedConfig.slug}`}>
                          {edgeFnUrl(selectedConfig.slug)}
                        </code>
                        <Button type="button" variant="default" size="sm" className="h-9 px-3 shrink-0"
                          data-testid={`button-copy-url-${selectedConfig.slug}`}
                          onClick={() => { copyToClipboard(edgeFnUrl(selectedConfig.slug)); toast({ title: "URL copied", description: "Paste into Forward SMS → URL field." }); }}>
                          <Copy className="w-3.5 h-3.5 mr-1.5" />Copy URL
                        </Button>
                      </div>
                      <div className="text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded px-2.5 py-1.5">
                        <code className="font-mono">{"{body}"}</code> and <code className="font-mono">{"{sender}"}</code> are Forward SMS built-in variables — filled automatically from the SMS. Only <code className="font-mono">slug=</code> changes per endpoint.
                      </div>
                    </div>
                  </div>

                  {/* Headers */}
                  <div className="grid grid-cols-[90px_1fr] items-center py-2.5 gap-3 text-xs">
                    <span className="font-semibold text-muted-foreground uppercase tracking-wide">Headers</span>
                    <span className="text-muted-foreground italic">Leave empty</span>
                  </div>

                  {/* Body */}
                  <div className="grid grid-cols-[90px_1fr] items-center py-2.5 gap-3 text-xs">
                    <span className="font-semibold text-muted-foreground uppercase tracking-wide">Body</span>
                    <span className="text-muted-foreground italic">Leave empty</span>
                  </div>

                </div>

                <Separator className="mt-2 mb-3" />

                {/* Security note */}
                <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground">Secured with a shared secret</strong> embedded in the URL — requests without the correct{" "}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">?secret=</code> are rejected with 401.
                    Server-side function validates slug and only stores{" "}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">slug</code>,{" "}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">raw_message</code>,{" "}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">sender</code>.
                  </span>
                </div>

              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── PARSING RULES TAB ──────────────────────────────────────────────── */}
        <TabsContent value="rules" className="space-y-4 mt-4">
          {selectedConfig && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    Parsing Rules for <Badge variant="outline">{selectedConfig.name}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Extract client &amp; amount from SMS text (tried in sort order)
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => { setEditingRule(null); setShowRuleDialog(true); }}
                  data-testid="button-add-rule"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Rule
                </Button>
              </div>

              {rulesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : !rules?.length ? (
                <Card>
                  <CardContent className="py-10 text-center">
                    <List className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No parsing rules yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">Add rules to extract client name and amount from incoming SMS.</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Rule Name</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Client Extraction</TableHead>
                        <TableHead>Amount Extraction</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule, idx) => (
                        <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                          <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                          <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                          <TableCell>
                            <Badge variant={rule.direction === "inflow" ? "default" : "secondary"} className="text-xs">
                              {rule.direction === "inflow" ? (
                                <><ArrowDownUp className="w-3 h-3 mr-1" />Inflow</>
                              ) : (
                                <><ArrowUpDown className="w-3 h-3 mr-1" />Outflow</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 rounded">
                              after "<span className="text-primary">{rule.clientAfterString}</span>"
                              before "<span className="text-primary">{rule.clientBeforeString}</span>"
                            </code>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 rounded">
                              after "<span className="text-primary">{rule.amountAfterString}</span>"
                              before "<span className="text-primary">{rule.amountBeforeString}</span>"
                            </code>
                          </TableCell>
                          <TableCell>
                            <Badge variant={rule.isActive ? "default" : "secondary"} className="text-xs">
                              {rule.isActive ? "Active" : "Disabled"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => { setEditingRule(rule); setShowRuleDialog(true); }}
                                data-testid={`button-edit-rule-${rule.id}`}
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm("Delete this parsing rule?")) {
                                    deleteRuleMutation.mutate(rule.id);
                                  }
                                }}
                                data-testid={`button-delete-rule-${rule.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}

              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  <strong>How extraction works:</strong> For each incoming SMS, the system looks for text
                  between the "after" and "before" boundary strings you define. For example, if your SMS
                  reads <code className="bg-amber-100 dark:bg-amber-900 px-0.5 rounded">تحويل مبلغ 5000 ر.ي من علي محمد الى حساب</code>, set
                  Client After = <code className="bg-amber-100 dark:bg-amber-900 px-0.5 rounded">من </code> and
                  Client Before = <code className="bg-amber-100 dark:bg-amber-900 px-0.5 rounded"> الى</code> to extract "علي محمد".
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── TEST TAB ────────────────────────────────────────────────────────── */}
        <TabsContent value="test" className="space-y-4 mt-4">
          {selectedConfig && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" />
                  Test SMS — {selectedConfig.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Forward SMS quick reference */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <p className="text-xs font-semibold flex items-center gap-2 text-foreground">
                      <Inbox className="w-3.5 h-3.5 text-primary" />
                      Forward SMS → Supabase Edge Function
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-0 font-normal">GET · No headers · No body</Badge>
                      <Badge variant="outline" className="text-xs font-mono">{selectedConfig.slug}</Badge>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    <div className="grid grid-cols-[80px_1fr] items-center px-4 py-2.5 gap-3 text-xs">
                      <span className="font-semibold text-muted-foreground">Method</span>
                      <Badge className="w-fit text-[10px] px-2 py-0 font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-0">GET</Badge>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] items-start px-4 py-2.5 gap-3 text-xs">
                      <span className="font-semibold text-muted-foreground pt-2">URL</span>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono break-all leading-relaxed text-[11px]" data-testid="text-test-url">
                          {edgeFnUrl(selectedConfig.slug)}
                        </code>
                        <Button type="button" variant="outline" size="sm" className="h-7 shrink-0"
                          onClick={() => { copyToClipboard(edgeFnUrl(selectedConfig.slug)); toast({ title: "URL copied" }); }}
                          data-testid="button-copy-fwd-url">
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] items-center px-4 py-2.5 gap-3 text-xs">
                      <span className="font-semibold text-muted-foreground">Headers</span>
                      <span className="text-muted-foreground italic">Leave empty</span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] items-center px-4 py-2.5 gap-3 text-xs">
                      <span className="font-semibold text-muted-foreground">Body</span>
                      <span className="text-muted-foreground italic">Leave empty</span>
                    </div>
                    <div className="px-4 py-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-900/20">
                      <code className="font-mono">{"{body}"}</code> and <code className="font-mono">{"{sender}"}</code> are filled automatically by Forward SMS. Only <code className="font-mono">slug=</code> changes per endpoint.
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Manual Test — SMS Message Body</p>
                  <Textarea
                    value={testMessage}
                    onChange={e => setTestMessage(e.target.value)}
                    rows={4}
                    className="font-mono text-sm"
                    placeholder="Paste your SMS text here..."
                    data-testid="input-test-sms"
                  />
                </div>

                <Button
                  type="button"
                  onClick={runSmsTest}
                  disabled={testLoading || !testMessage.trim()}
                  data-testid="button-send-test"
                >
                  {testLoading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testing...</>
                    : <><Send className="w-4 h-4 mr-2" />Send Test SMS</>
                  }
                </Button>

                {testResult && (
                  <div className={`rounded-lg border p-4 ${testResult.ok ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.ok
                        ? <CheckCircle className="w-4 h-4 text-emerald-600" />
                        : <XCircle className="w-4 h-4 text-red-600" />
                      }
                      <span className={`text-sm font-semibold ${testResult.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                        {testResult.data?.status === "success"
                          ? `Record Created (${testResult.data.record?.recordNumber})`
                          : testResult.data?.status === "parse_failed"
                            ? "Parse Failed — no rule could extract data"
                            : `Error: ${testResult.data?.message || testResult.error || "Unknown"}`
                        }
                      </span>
                    </div>
                    {testResult.data?.parsed && (
                      <div className="text-xs space-y-1 font-mono mt-2">
                        <p><span className="text-muted-foreground">Client: </span><span className="font-bold">{testResult.data.parsed.client ?? "—"}</span></p>
                        <p><span className="text-muted-foreground">Amount: </span><span className="font-bold">{testResult.data.parsed.amount ?? "—"}</span></p>
                        <p><span className="text-muted-foreground">Direction: </span><span className="font-bold">{testResult.data.parsed.direction ?? "—"}</span></p>
                        {testResult.data.match ? (
                          <p>
                            <span className="text-muted-foreground">Matched: </span>
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                              {testResult.data.match.fullName} ({testResult.data.match.customerId}) — {testResult.data.match.method} (score {testResult.data.match.score})
                            </span>
                          </p>
                        ) : (
                          <p><span className="text-muted-foreground">Matched: </span><span className="text-amber-600">No customer match</span></p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── INBOX TAB ───────────────────────────────────────────────────────── */}
        <TabsContent value="inbox" className="space-y-4 mt-4">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Pending", filter: "pending" as const, icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800" },
              { label: "Done", filter: "done" as const, icon: CheckCheck, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800" },
              { label: "Failed", filter: "failed" as const, icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800" },
              { label: "All", filter: "all" as const, icon: Inbox, color: "text-primary", bg: "bg-primary/5", border: "border-primary/20" },
            ].map(({ label, filter, icon: Icon, color, bg, border }) => {
              const count = label === "All" ? (inboxEntries?.length ?? 0) : (inboxEntries?.filter(e => e.status === filter).length ?? 0);
              return (
                <button
                  key={filter}
                  onClick={() => setInboxFilter(filter)}
                  className={`rounded-lg border p-3 text-left transition-all ${bg} ${border} ${inboxFilter === filter ? "ring-2 ring-primary" : "hover:opacity-80"}`}
                  data-testid={`button-inbox-filter-${filter}`}
                >
                  <Icon className={`w-4 h-4 ${color} mb-1`} />
                  <p className={`text-lg font-bold ${color}`}>{count}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </button>
              );
            })}
          </div>

          {/* Actions bar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {pendingCount > 0
                ? <span className="text-amber-600 font-medium">{pendingCount} message{pendingCount !== 1 ? "s" : ""} waiting to be processed</span>
                : "All messages processed"
              }
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetchInbox()}
                data-testid="button-inbox-refresh"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Refresh
              </Button>
              {selectedConfig && pendingCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={processAllMutation.isPending}
                  onClick={() => processAllMutation.mutate(selectedConfig.id)}
                  data-testid="button-process-config"
                >
                  {processAllMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                  Process {selectedConfig.name} Pending
                </Button>
              )}
              {pendingCount > 0 && (
                <Button
                  type="button"
                  size="sm"
                  disabled={processAllMutation.isPending}
                  onClick={() => processAllMutation.mutate(undefined)}
                  data-testid="button-process-all"
                >
                  {processAllMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                  Process All Pending
                </Button>
              )}
              {(inboxEntries?.length ?? 0) > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={clearGarbageMutation.isPending}
                  onClick={() => clearGarbageMutation.mutate()}
                  data-testid="button-clear-inbox"
                  className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
                >
                  {clearGarbageMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                  Clear All
                </Button>
              )}
            </div>
          </div>

          {/* Messages table */}
          {inboxLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredInbox.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {inboxFilter === "pending" ? "No pending messages — all caught up!" : "No messages in this view."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Received</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-28">Endpoint</TableHead>
                    <TableHead>Raw Message</TableHead>
                    <TableHead className="w-28">Parsed Client</TableHead>
                    <TableHead className="w-24">Amount</TableHead>
                    <TableHead className="w-32">Match</TableHead>
                    <TableHead className="w-20">Record</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInbox.map(entry => (
                    <Fragment key={entry.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setExpandedInboxId(expandedInboxId === entry.id ? null : entry.id)}
                        data-testid={`row-inbox-${entry.id}`}
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(entry.receivedAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={entry.status === "done" ? "default" : entry.status === "pending" ? "secondary" : "destructive"}
                            className="text-xs"
                          >
                            {entry.status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                            {entry.status === "done" && <CheckCircle className="w-3 h-3 mr-1" />}
                            {entry.status === "failed" && <XCircle className="w-3 h-3 mr-1" />}
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{entry.slug}</TableCell>
                        <TableCell>
                          <p className="text-xs truncate max-w-xs" dir="rtl">{entry.rawMessage}</p>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{entry.parsedClient ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {entry.parsedAmount
                            ? <>{entry.parsedAmount} <span className="text-xs text-muted-foreground">{entry.parsedDirection}</span></>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.matchMethod
                            ? <span className="text-emerald-600 dark:text-emerald-400">{entry.matchMethod}</span>
                            : entry.status === "done"
                              ? <span className="text-amber-600">Unmatched</span>
                              : "—"
                          }
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {entry.recordId ? entry.recordId.slice(0, 8) + "…" : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {entry.status === "pending" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-primary hover:text-primary"
                                disabled={processOneMutation.isPending}
                                onClick={(e) => { e.stopPropagation(); processOneMutation.mutate(entry.id); }}
                                data-testid={`button-process-one-${entry.id}`}
                              >
                                <Play className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); deleteInboxMutation.mutate(entry.id); }}
                              data-testid={`button-delete-inbox-${entry.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedInboxId === entry.id && (
                        <TableRow key={`${entry.id}-expanded`} className="bg-muted/30">
                          <TableCell colSpan={9} className="px-4 py-3">
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Message</p>
                              <pre className="text-sm bg-background border rounded p-3 whitespace-pre-wrap font-mono break-all" dir="rtl">
                                {entry.rawMessage}
                              </pre>
                              {entry.errorMessage && (
                                <p className="text-xs text-red-600 flex items-center gap-1">
                                  <XCircle className="w-3.5 h-3.5" /> {entry.errorMessage}
                                </p>
                              )}
                              {entry.sender && (
                                <p className="text-xs text-muted-foreground">Forwarded at: {entry.sender}</p>
                              )}
                              {entry.processedAt && (
                                <p className="text-xs text-muted-foreground">Processed: {new Date(entry.processedAt).toLocaleString()}</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ── LOGS TAB ────────────────────────────────────────────────────────── */}
        <TabsContent value="logs" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">Recent SMS activity (latest 100)</p>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!logs?.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No webhook activity yet
                    </TableCell>
                  </TableRow>
                ) : logs.map(log => (
                  <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={log.status === "success" ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.parsedClient ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{log.parsedAmount ?? "—"}</TableCell>
                    <TableCell className="text-xs">{log.parsedDirection ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {log.matchMethod ? (
                        <span className="text-emerald-600 dark:text-emerald-400">{log.matchMethod} ({log.matchScore})</span>
                      ) : log.status === "success" ? (
                        <span className="text-amber-600">Unmatched</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{log.recordId ? log.recordId.slice(0, 8) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

      </Tabs>

      {/* ── CONFIG DIALOG ──────────────────────────────────────────────────────── */}
      <ConfigDialog
        open={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        editing={editingConfig}
        accounts={assetAccounts}
        onSubmit={(data) => {
          if (editingConfig) {
            updateConfigMutation.mutate({ id: editingConfig.id, data });
          } else {
            createConfigMutation.mutate(data);
          }
        }}
        isPending={createConfigMutation.isPending || updateConfigMutation.isPending}
      />

      {/* ── RULE DIALOG ────────────────────────────────────────────────────────── */}
      <RuleDialog
        open={showRuleDialog}
        onOpenChange={setShowRuleDialog}
        editing={editingRule}
        onSubmit={(data) => {
          if (editingRule) {
            updateRuleMutation.mutate({ id: editingRule.id, data });
          } else {
            createRuleMutation.mutate(data);
          }
        }}
        isPending={createRuleMutation.isPending || updateRuleMutation.isPending}
      />
    </div>
  );
}

function ConfigDialog({
  open, onOpenChange, editing, accounts, onSubmit, isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: SmsWebhookConfig | null;
  accounts: ChartOfAccount[];
  onSubmit: (data: z.infer<typeof configFormSchema>) => void;
  isPending: boolean;
}) {
  const form = useForm<z.infer<typeof configFormSchema>>({
    resolver: zodResolver(configFormSchema),
    values: editing
      ? { slug: editing.slug, name: editing.name, accountId: editing.accountId, currency: editing.currency, isActive: editing.isActive }
      : { slug: "", name: "", accountId: "", currency: "", isActive: true },
  });

  const selectedAcct = accounts.find(a => a.id === form.watch("accountId"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Endpoint" : "Create Webhook Endpoint"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Kuraimi Bank YER" {...field} data-testid="input-config-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="slug" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Slug <InfoTip text={`URL path: /api/webhooks/sms/${field.value || "..."}`} /></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. kuraimi-yer" {...field} data-testid="input-config-slug" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <FormField control={form.control} name="accountId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Asset Account <InfoTip text="CoA account linked to this endpoint" /></FormLabel>
                  <Select value={field.value} onValueChange={(v) => {
                    field.onChange(v);
                    const acct = accounts.find(a => a.id === v);
                    if (acct?.currency) form.setValue("currency", acct.currency);
                  }}>
                    <FormControl>
                      <SelectTrigger data-testid="select-config-account">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {accounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.code} — {a.name} ({a.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0 pb-1">
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-config-active" />
                  <FormLabel className="mb-0">Active</FormLabel>
                </FormItem>
              )} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-config">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RuleDialog({
  open, onOpenChange, editing, onSubmit, isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: SmsParsingRule | null;
  onSubmit: (data: z.infer<typeof ruleFormSchema>) => void;
  isPending: boolean;
}) {
  const form = useForm<z.infer<typeof ruleFormSchema>>({
    resolver: zodResolver(ruleFormSchema),
    values: editing
      ? {
          name: editing.name,
          direction: editing.direction as "inflow" | "outflow",
          clientAfterString: editing.clientAfterString,
          clientBeforeString: editing.clientBeforeString,
          amountAfterString: editing.amountAfterString,
          amountBeforeString: editing.amountBeforeString,
          isActive: editing.isActive,
          sortOrder: editing.sortOrder,
        }
      : {
          name: "",
          direction: "inflow" as const,
          clientAfterString: "",
          clientBeforeString: "",
          amountAfterString: "",
          amountBeforeString: "",
          isActive: true,
          sortOrder: 0,
        },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Parsing Rule" : "Create Parsing Rule"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Kuraimi Inflow" {...field} data-testid="input-rule-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="direction" render={({ field }) => (
                <FormItem>
                  <FormLabel>Direction</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-rule-direction">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="inflow">Inflow</SelectItem>
                      <SelectItem value="outflow">Outflow</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">Client Name <InfoTip text="Text boundaries to extract the client name from the SMS" /></p>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="clientAfterString" render={({ field }) => (
                <FormItem>
                  <FormLabel>After</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. "من "' {...field} data-testid="input-rule-client-after" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="clientBeforeString" render={({ field }) => (
                <FormItem>
                  <FormLabel>Before</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. " الى"' {...field} data-testid="input-rule-client-before" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">Amount <InfoTip text="Text boundaries to extract the amount from the SMS" /></p>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="amountAfterString" render={({ field }) => (
                <FormItem>
                  <FormLabel>After</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. "مبلغ "' {...field} data-testid="input-rule-amount-after" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="amountBeforeString" render={({ field }) => (
                <FormItem>
                  <FormLabel>Before</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. " ر.ي"' {...field} data-testid="input-rule-amount-before" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="sortOrder" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Priority <InfoTip text="Lower number = higher priority" /></FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                      data-testid="input-rule-sort"
                    />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0 pt-7">
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-rule-active" />
                  <FormLabel className="mb-0">Active</FormLabel>
                </FormItem>
              )} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-rule">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
