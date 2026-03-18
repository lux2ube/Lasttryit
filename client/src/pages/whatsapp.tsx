import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle, Wifi, WifiOff, Loader2, Copy, Users, RotateCw,
  Ban, Search, Link2, Unlink, Send, CheckCircle, XCircle,
  Clock, AlertTriangle, Activity, Smartphone, QrCode, Power,
  ArrowRight, RefreshCw, Filter, BookOpen, Terminal,
  ChevronRight, Server, Globe, ShieldCheck,
} from "lucide-react";

interface WaStatus {
  status: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  lastError: string | null;
  dailyMessageCount: number;
  dailyLimit: number;
}

interface WaGroup {
  id: string;
  subject: string;
  participants: number;
}

interface Customer {
  id: string;
  customerId: string;
  fullName: string;
  phonePrimary: string;
  whatsappGroupId: string | null;
  customerStatus: string;
}

interface QueueItem {
  id: string;
  recordId: string;
  recordNumber: string;
  customerId: string;
  customerName: string;
  recipientPhone: string;
  templateName: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  wamid: string | null;
  createdAt: string;
  sentAt: string | null;
}

interface AuditEntry {
  id: string;
  recordNumber: string;
  customerName: string;
  recipientPhone: string;
  wamid: string | null;
  deliveryStatus: string;
  errorDetail: string | null;
  createdAt: string;
}

export default function WhatsAppPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("connection");
  const [queueFilter, setQueueFilter] = useState("all");
  const [groupSearch, setGroupSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [linkDialog, setLinkDialog] = useState<{ customer: Customer; groupId: string } | null>(null);

  const { data: waStatus, isLoading: statusLoading } = useQuery<WaStatus>({
    queryKey: ["/api/whatsapp/status"],
    refetchInterval: 3000,
  });

  const { data: stats } = useQuery<Record<string, number>>({
    queryKey: ["/api/notifications/stats"],
    refetchInterval: 5000,
  });

  const { data: groups, isLoading: groupsLoading, refetch: refetchGroups } = useQuery<WaGroup[]>({
    queryKey: ["/api/whatsapp/groups"],
    enabled: waStatus?.status === "connected",
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    select: (data: any) => (data ?? []).map((c: any) => ({
      id: c.id,
      customerId: c.customerId,
      fullName: c.fullName,
      phonePrimary: c.phonePrimary ?? "",
      whatsappGroupId: c.whatsappGroupId ?? null,
      customerStatus: c.customerStatus,
    })),
  });

  const { data: queue, isLoading: queueLoading } = useQuery<QueueItem[]>({
    queryKey: ["/api/notifications/queue", queueFilter],
    queryFn: async () => {
      const params = queueFilter !== "all" ? `?status=${queueFilter}&limit=100` : "?limit=100";
      const res = await fetch(`/api/notifications/queue${params}`, { credentials: "include" });
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: audit } = useQuery<AuditEntry[]>({
    queryKey: ["/api/notifications/audit"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/audit?limit=100", { credentials: "include" });
      return res.json();
    },
    refetchInterval: 10000,
  });

  const connectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/whatsapp/connect"),
    onSuccess: () => {
      toast({ title: "Initializing WhatsApp connection...", description: "QR code will appear shortly" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
    },
    onError: (e: any) => toast({ title: "Connection failed", description: e.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/whatsapp/disconnect"),
    onSuccess: () => {
      toast({ title: "WhatsApp disconnected" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/whatsapp/reconnect"),
    onSuccess: () => {
      toast({ title: "Reconnecting..." });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
    },
  });

  const linkGroupMutation = useMutation({
    mutationFn: ({ customerId, groupId }: { customerId: string; groupId: string }) =>
      apiRequest("PATCH", `/api/customers/${customerId}`, { whatsappGroupId: groupId }),
    onSuccess: () => {
      toast({ title: "Group linked successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setLinkDialog(null);
    },
    onError: (e: any) => toast({ title: "Link failed", description: e.message, variant: "destructive" }),
  });

  const unlinkGroupMutation = useMutation({
    mutationFn: (customerId: string) =>
      apiRequest("PATCH", `/api/customers/${customerId}`, { whatsappGroupId: "" }),
    onSuccess: () => {
      toast({ title: "Group unlinked" });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/notifications/${id}/cancel`),
    onSuccess: () => {
      toast({ title: "Notification cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/stats"] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/notifications/${id}/retry`),
    onSuccess: () => {
      toast({ title: "Notification re-queued" });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/stats"] });
    },
  });

  const isConnected = waStatus?.status === "connected";
  const isQrPending = waStatus?.status === "qr_pending";
  const isConnecting = waStatus?.status === "connecting";
  const isDisconnected = waStatus?.status === "disconnected" || waStatus?.status === "logged_out";

  const statusConfig: Record<string, { color: string; bg: string; label: string; icon: any }> = {
    connected:    { color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800", label: "Connected", icon: Wifi },
    qr_pending:   { color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",     label: "Awaiting QR Scan", icon: QrCode },
    connecting:   { color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",       label: "Connecting...", icon: Loader2 },
    disconnected: { color: "text-gray-500",    bg: "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700",         label: "Disconnected", icon: WifiOff },
    logged_out:   { color: "text-red-600",     bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",          label: "Logged Out", icon: Power },
  };

  const currentStatus = statusConfig[waStatus?.status ?? "disconnected"] ?? statusConfig.disconnected;
  const StatusIcon = currentStatus.icon;

  const filteredGroups = (groups ?? []).filter(g =>
    g.subject.toLowerCase().includes(groupSearch.toLowerCase()) ||
    g.id.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const linkedCustomers = (customers ?? []).filter(c => c.whatsappGroupId && c.whatsappGroupId.length > 3);
  const unlinkedCustomers = (customers ?? []).filter(c => !c.whatsappGroupId || c.whatsappGroupId.length <= 3);

  const filteredLinked = linkedCustomers.filter(c =>
    c.fullName.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.customerId.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const filteredUnlinked = unlinkedCustomers.filter(c =>
    c.fullName.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.customerId.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const getGroupName = (jid: string) => {
    const g = groups?.find(gr => gr.id === jid);
    return g?.subject ?? jid;
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <MessageCircle className="w-6 h-6 text-emerald-600" />
          WhatsApp Notifications
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage WhatsApp connection, link groups to customers, and monitor notification delivery
        </p>
      </div>

      {/* Status Bar */}
      <div className={`rounded-lg border p-4 flex items-center justify-between ${currentStatus.bg}`}>
        <div className="flex items-center gap-3">
          <StatusIcon className={`w-5 h-5 ${currentStatus.color} ${isConnecting ? "animate-spin" : ""}`} />
          <div>
            <p className={`font-semibold ${currentStatus.color}`} data-testid="text-wa-status">{currentStatus.label}</p>
            {isConnected && (
              <p className="text-xs text-muted-foreground">
                {waStatus?.dailyMessageCount ?? 0} / {waStatus?.dailyLimit ?? 200} messages sent today
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isDisconnected && (
            <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending} data-testid="button-wa-connect" className="bg-emerald-600 hover:bg-emerald-700">
              {connectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Smartphone className="w-4 h-4 mr-2" />}
              Connect WhatsApp
            </Button>
          )}
          {isConnected && (
            <>
              <Button variant="outline" size="sm" onClick={() => reconnectMutation.mutate()} disabled={reconnectMutation.isPending} data-testid="button-wa-reconnect">
                <RotateCw className="w-4 h-4 mr-1.5" /> Reconnect
              </Button>
              <Button variant="outline" size="sm" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending} data-testid="button-wa-disconnect" className="text-red-600 hover:text-red-700">
                <Power className="w-4 h-4 mr-1.5" /> Disconnect
              </Button>
            </>
          )}
          {isQrPending && (
            <Button variant="outline" size="sm" onClick={() => disconnectMutation.mutate()} data-testid="button-wa-cancel-connect">
              <XCircle className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* QR Code Section */}
      {isQrPending && waStatus?.qrCode && (
        <Card className="max-w-lg mx-auto border-amber-200 dark:border-amber-800">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-lg flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5 text-amber-600" /> Scan QR Code
            </CardTitle>
            <CardDescription>
              Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="bg-white p-5 rounded-xl shadow-inner" data-testid="wa-qr-container">
              <img
                src={waStatus.qrCodeBase64 || `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(waStatus.qrCode)}`}
                alt="WhatsApp QR Code"
                className="w-[280px] h-[280px]"
                data-testid="img-wa-qr"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              Waiting for scan...
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Daily Sent" value={waStatus?.dailyMessageCount ?? 0} max={waStatus?.dailyLimit ?? 200} icon={Send} color="text-blue-600" />
        <StatCard label="Queued" value={stats?.queued ?? 0} icon={Clock} color="text-amber-600" />
        <StatCard label="Sent" value={stats?.sent ?? 0} icon={CheckCircle} color="text-emerald-600" />
        <StatCard label="Failed" value={stats?.failed ?? 0} icon={XCircle} color="text-red-600" />
        <StatCard label="Dead" value={stats?.dead ?? 0} icon={AlertTriangle} color="text-gray-500" />
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-whatsapp" className="flex-wrap h-auto gap-1">
          <TabsTrigger value="connection" data-testid="tab-connection">
            <Wifi className="w-4 h-4 mr-1.5" /> Connection
          </TabsTrigger>
          <TabsTrigger value="groups" data-testid="tab-groups">
            <Link2 className="w-4 h-4 mr-1.5" /> Group Links
            {linkedCustomers.length > 0 && (
              <span className="ml-1.5 bg-emerald-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-bold">{linkedCustomers.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-queue">
            <Activity className="w-4 h-4 mr-1.5" /> Queue
            {(stats?.queued ?? 0) > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-bold">{stats?.queued}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            <CheckCircle className="w-4 h-4 mr-1.5" /> Audit Log
          </TabsTrigger>
          <TabsTrigger value="guide" data-testid="tab-guide">
            <BookOpen className="w-4 h-4 mr-1.5" /> Setup Guide
          </TabsTrigger>
        </TabsList>

        {/* CONNECTION TAB */}
        <TabsContent value="connection" className="mt-4 space-y-4">
          {isConnected && groups && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-5 h-5" /> Available Groups ({groups.length})
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => refetchGroups()} data-testid="button-refresh-groups">
                    <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
                  </Button>
                </div>
                <CardDescription>Groups visible to the connected WhatsApp number. Use Group Links tab to assign them to customers.</CardDescription>
              </CardHeader>
              <CardContent>
                {groups.length > 5 && (
                  <div className="mb-3 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search groups..."
                      value={groupSearch}
                      onChange={e => setGroupSearch(e.target.value)}
                      className="pl-9 h-9"
                      data-testid="input-search-groups"
                    />
                  </div>
                )}
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Group Name</TableHead>
                        <TableHead>Group JID</TableHead>
                        <TableHead className="text-center">Members</TableHead>
                        <TableHead className="text-center">Linked To</TableHead>
                        <TableHead className="w-[80px] text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupsLoading ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                      ) : filteredGroups.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No groups found</TableCell></TableRow>
                      ) : filteredGroups.map(g => {
                        const linked = linkedCustomers.filter(c => c.whatsappGroupId === g.id);
                        return (
                          <TableRow key={g.id} data-testid={`row-group-${g.id}`}>
                            <TableCell className="font-medium text-sm">{g.subject}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{g.id}</TableCell>
                            <TableCell className="text-center text-sm">{g.participants}</TableCell>
                            <TableCell className="text-center">
                              {linked.length > 0 ? (
                                <div className="flex flex-wrap gap-1 justify-center">
                                  {linked.map(c => (
                                    <Badge key={c.id} variant="secondary" className="text-xs">{c.fullName}</Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2"
                                data-testid={`button-copy-${g.id}`}
                                onClick={() => {
                                  navigator.clipboard.writeText(g.id);
                                  toast({ title: "Copied!", description: g.id });
                                }}
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {isDisconnected && !statusLoading && (
            <Card className="max-w-lg mx-auto text-center py-12">
              <CardContent className="space-y-4">
                <WifiOff className="w-12 h-12 text-muted-foreground mx-auto" />
                <div>
                  <h3 className="font-semibold text-lg">WhatsApp Not Connected</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Click Connect WhatsApp above to start. You'll scan a QR code with your phone to link this system.
                  </p>
                </div>
                {waStatus?.lastError && (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 text-left" data-testid="wa-error-message">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">Connection Error</p>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-1">{waStatus.lastError}</p>
                      </div>
                    </div>
                  </div>
                )}
                <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-wa-connect-cta">
                  {connectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Smartphone className="w-4 h-4 mr-2" />}
                  Connect Now
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* GROUP LINKS TAB */}
        <TabsContent value="groups" className="mt-4 space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-customers"
            />
          </div>

          {/* Linked Customers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="w-5 h-5 text-emerald-600" />
                Linked Customers ({filteredLinked.length})
              </CardTitle>
              <CardDescription>These customers have WhatsApp groups assigned and will receive confirmation notifications.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Linked Group</TableHead>
                      <TableHead>Group Name</TableHead>
                      <TableHead className="w-[100px] text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLinked.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No linked customers</TableCell></TableRow>
                    ) : filteredLinked.map(c => (
                      <TableRow key={c.id} data-testid={`row-linked-${c.id}`}>
                        <TableCell className="font-mono text-xs">{c.customerId}</TableCell>
                        <TableCell className="font-medium text-sm">{c.fullName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.phonePrimary || "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[180px] truncate" title={c.whatsappGroupId ?? ""}>
                          {c.whatsappGroupId}
                        </TableCell>
                        <TableCell className="text-sm">
                          {isConnected ? getGroupName(c.whatsappGroupId ?? "") : <span className="text-xs text-muted-foreground italic">Connect to see</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-700"
                            onClick={() => unlinkGroupMutation.mutate(c.id)}
                            disabled={unlinkGroupMutation.isPending}
                            data-testid={`button-unlink-${c.id}`}
                            title="Unlink group"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Unlinked Customers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Unlink className="w-5 h-5 text-muted-foreground" />
                Unlinked Customers ({filteredUnlinked.length})
              </CardTitle>
              <CardDescription>
                {isConnected
                  ? "Click the link button to assign a WhatsApp group. You must be connected to see available groups."
                  : "Connect WhatsApp first, then link groups to these customers."
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px] text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUnlinked.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">All customers are linked</TableCell></TableRow>
                    ) : filteredUnlinked.map(c => (
                      <TableRow key={c.id} data-testid={`row-unlinked-${c.id}`}>
                        <TableCell className="font-mono text-xs">{c.customerId}</TableCell>
                        <TableCell className="font-medium text-sm">{c.fullName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.phonePrimary || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={c.customerStatus === "active" ? "default" : "secondary"} className="text-xs">
                            {c.customerStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-emerald-600 hover:text-emerald-700"
                            disabled={!isConnected || !groups?.length}
                            onClick={() => setLinkDialog({ customer: c, groupId: groups?.[0]?.id ?? "" })}
                            data-testid={`button-link-${c.id}`}
                            title={isConnected ? "Link to group" : "Connect WhatsApp first"}
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* QUEUE TAB */}
        <TabsContent value="queue" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            {["all", "queued", "processing", "sent", "failed", "dead"].map(f => (
              <Button
                key={f}
                size="sm"
                variant={queueFilter === f ? "default" : "outline"}
                className="text-xs h-7"
                onClick={() => setQueueFilter(f)}
                data-testid={`button-filter-${f}`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== "all" && stats?.[f] ? ` (${stats[f]})` : ""}
              </Button>
            ))}
          </div>

          <Card>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Attempts</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead className="w-[90px] text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : !queue?.length ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No notifications {queueFilter !== "all" ? `with status "${queueFilter}"` : "in queue"}</TableCell></TableRow>
                  ) : queue.map(item => (
                    <TableRow key={item.id} data-testid={`row-queue-${item.id}`}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(item.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-xs font-semibold">{item.recordNumber}</TableCell>
                      <TableCell className="text-sm">{item.customerName}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground max-w-[130px] truncate" title={item.recipientPhone}>
                        {isConnected ? getGroupName(item.recipientPhone) : item.recipientPhone.slice(0, 16) + "..."}
                      </TableCell>
                      <TableCell><QueueBadge status={item.status} /></TableCell>
                      <TableCell className="text-center text-xs">{item.attempts}/{item.maxAttempts}</TableCell>
                      <TableCell className="text-xs text-red-600 max-w-[160px] truncate" title={item.errorMessage ?? ""}>
                        {item.errorMessage ?? "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex gap-1 justify-center">
                          {(item.status === "failed" || item.status === "dead") && (
                            <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => retryMutation.mutate(item.id)} disabled={retryMutation.isPending} data-testid={`button-retry-${item.id}`} title="Retry">
                              <RotateCw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {(item.status === "queued" || item.status === "failed") && (
                            <Button size="sm" variant="ghost" className="h-7 px-1.5 text-red-600" onClick={() => cancelMutation.mutate(item.id)} disabled={cancelMutation.isPending} data-testid={`button-cancel-${item.id}`} title="Cancel">
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* AUDIT TAB */}
        <TabsContent value="audit" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Delivery Audit Log</CardTitle>
              <CardDescription>Immutable record of every notification attempt and delivery status.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>WAMID</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!audit?.length ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No audit entries yet</TableCell></TableRow>
                    ) : audit.map(entry => (
                      <TableRow key={entry.id} data-testid={`row-audit-${entry.id}`}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-xs font-semibold">{entry.recordNumber}</TableCell>
                        <TableCell className="text-sm">{entry.customerName}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[130px] truncate" title={entry.recipientPhone}>
                          {isConnected ? getGroupName(entry.recipientPhone) : entry.recipientPhone?.slice(0, 16) + "..."}
                        </TableCell>
                        <TableCell>
                          <Badge variant={entry.deliveryStatus === "sent" || entry.deliveryStatus === "delivered" || entry.deliveryStatus === "read" ? "default" : "destructive"} className="text-xs">
                            {entry.deliveryStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[100px] truncate" title={entry.wamid ?? ""}>
                          {entry.wamid ? entry.wamid.slice(0, 12) + "..." : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-red-600 max-w-[160px] truncate" title={entry.errorDetail ?? ""}>
                          {entry.errorDetail ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SETUP GUIDE TAB */}
        <TabsContent value="guide" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-600" />
                WhatsApp Bridge Architecture
              </CardTitle>
              <CardDescription>
                Since FOMS runs on Vercel (serverless), WhatsApp Web requires a separate always-on bridge server to maintain the persistent connection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-background rounded-md px-3 py-2 border">
                    <Globe className="w-4 h-4 text-blue-500" />
                    <span className="font-medium">FOMS (Vercel)</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
                  <div className="flex items-center gap-2 bg-background rounded-md px-3 py-2 border border-emerald-200 dark:border-emerald-800">
                    <Server className="w-4 h-4 text-emerald-500" />
                    <span className="font-medium">WA Bridge Server</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
                  <div className="flex items-center gap-2 bg-background rounded-md px-3 py-2 border border-green-200 dark:border-green-800">
                    <MessageCircle className="w-4 h-4 text-green-500" />
                    <span className="font-medium">WhatsApp</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  The bridge server runs Baileys (WhatsApp Web protocol) and exposes HTTP endpoints for FOMS to call.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Environment Variables Required
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border divide-y">
                <div className="p-3 flex items-start gap-3">
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono mt-0.5 shrink-0">WA_BRIDGE_URL</code>
                  <p className="text-sm text-muted-foreground">
                    Full URL of your WhatsApp bridge server (e.g. <code className="text-xs bg-muted px-1 rounded">https://wa-bridge.yourserver.com</code>). Set this in Vercel environment variables.
                  </p>
                </div>
                <div className="p-3 flex items-start gap-3">
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono mt-0.5 shrink-0">WA_BRIDGE_API_KEY</code>
                  <p className="text-sm text-muted-foreground">
                    API key for authenticating requests to the bridge. Must match the key configured on the bridge server.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Terminal className="w-5 h-5 text-orange-600" />
                Reconnecting WhatsApp (QR Rescan)
              </CardTitle>
              <CardDescription>
                When the session expires or gets disconnected, you need to re-authenticate by scanning a new QR code. Since Vercel is serverless, this must be done via the bridge server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
                  Option A: Use the FOMS Dashboard (This Page)
                </h4>
                <div className="ml-8 space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 shrink-0" /> If status shows "Disconnected" or "Logged Out", click the <strong className="text-foreground">Connect WhatsApp</strong> button above.</p>
                  <p className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 shrink-0" /> The bridge will generate a new QR code which will appear on this page.</p>
                  <p className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 shrink-0" /> Scan the QR code with WhatsApp on your phone (Settings → Linked Devices → Link a Device).</p>
                  <p className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 shrink-0" /> If already connected but having issues, click <strong className="text-foreground">Reconnect</strong> to force a new session.</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
                  Option B: SSH into the Bridge Server (Terminal)
                </h4>
                <div className="ml-8 space-y-2 text-sm text-muted-foreground">
                  <p>If the dashboard buttons are not working, SSH into your bridge server directly:</p>
                  <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-xs space-y-1 overflow-x-auto">
                    <p className="text-gray-400"># 1. SSH into your bridge server</p>
                    <p>ssh user@your-bridge-server-ip</p>
                    <p></p>
                    <p className="text-gray-400"># 2. Navigate to the bridge project directory</p>
                    <p>cd /path/to/wa-bridge</p>
                    <p></p>
                    <p className="text-gray-400"># 3. Delete the old auth session to force QR rescan</p>
                    <p>rm -rf auth_info_baileys/</p>
                    <p></p>
                    <p className="text-gray-400"># 4. Restart the bridge service</p>
                    <p>pm2 restart wa-bridge</p>
                    <p className="text-gray-400"># or if using systemd:</p>
                    <p>sudo systemctl restart wa-bridge</p>
                    <p className="text-gray-400"># or if running directly:</p>
                    <p>npx tsx src/index.ts</p>
                    <p></p>
                    <p className="text-gray-400"># 5. The bridge will generate a new QR code</p>
                    <p className="text-gray-400"># Come back to this page — the QR will appear here automatically</p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
                  Option C: cURL Commands (Remote API)
                </h4>
                <div className="ml-8 space-y-2 text-sm text-muted-foreground">
                  <p>You can call the bridge API directly from any terminal:</p>
                  <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-xs space-y-1 overflow-x-auto">
                    <p className="text-gray-400"># Check current status</p>
                    <p>curl -H "x-api-key: YOUR_KEY" https://your-bridge-url/status</p>
                    <p></p>
                    <p className="text-gray-400"># Force reconnect (generates new QR)</p>
                    <p>curl -X POST -H "x-api-key: YOUR_KEY" https://your-bridge-url/reconnect</p>
                    <p></p>
                    <p className="text-gray-400"># Disconnect current session</p>
                    <p>curl -X POST -H "x-api-key: YOUR_KEY" https://your-bridge-url/disconnect</p>
                    <p></p>
                    <p className="text-gray-400"># Connect (start new session with QR)</p>
                    <p>curl -X POST -H "x-api-key: YOUR_KEY" https://your-bridge-url/connect</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Troubleshooting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="font-medium">QR code not appearing?</p>
                  <p className="text-muted-foreground">Ensure <code className="text-xs bg-muted px-1 rounded">WA_BRIDGE_URL</code> is set correctly in Vercel env vars and the bridge server is running and accessible from the internet.</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="font-medium">Session keeps disconnecting?</p>
                  <p className="text-muted-foreground">WhatsApp may disconnect linked devices that are idle for 14+ days. Ensure the bridge server has a stable internet connection and is not being restarted frequently.</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="font-medium">Messages not sending?</p>
                  <p className="text-muted-foreground">Check: (1) WhatsApp is connected (green status above), (2) Customer has a WhatsApp group linked in Group Links tab, (3) Daily message limit (200/day) has not been reached.</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="font-medium">"Bridge unreachable" error?</p>
                  <p className="text-muted-foreground">The bridge server may be down or the URL/API key is incorrect. SSH into the bridge server and check if the process is running. Also verify firewall rules allow inbound traffic on the bridge port.</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="font-medium">Rate limit / anti-ban considerations</p>
                  <p className="text-muted-foreground">The system limits to 200 messages/day with 4-9 second random delays between messages. After 10 consecutive messages, a 30-second cooldown is applied. These limits protect against WhatsApp bans.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Link Group Dialog */}
      {linkDialog && (
        <LinkGroupDialog
          customer={linkDialog.customer}
          groups={groups ?? []}
          onLink={(groupId) => linkGroupMutation.mutate({ customerId: linkDialog.customer.id, groupId })}
          onClose={() => setLinkDialog(null)}
          isPending={linkGroupMutation.isPending}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, max, icon: Icon, color }: { label: string; value: number; max?: number; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <p className="text-2xl font-bold mt-1" data-testid={`text-stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
          {value}
          {max !== undefined && <span className="text-sm font-normal text-muted-foreground">/{max}</span>}
        </p>
      </CardContent>
    </Card>
  );
}

function QueueBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
    queued: { variant: "secondary" },
    processing: { variant: "outline", className: "border-blue-300 text-blue-600" },
    sent: { variant: "default", className: "bg-emerald-600" },
    failed: { variant: "destructive" },
    dead: { variant: "destructive", className: "bg-gray-600" },
  };
  const c = config[status] ?? config.queued;
  return <Badge variant={c.variant} className={`text-xs ${c.className ?? ""}`}>{status}</Badge>;
}

function LinkGroupDialog({
  customer, groups, onLink, onClose, isPending,
}: {
  customer: Customer;
  groups: WaGroup[];
  onLink: (groupId: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [selectedGroup, setSelectedGroup] = useState("");
  const [search, setSearch] = useState("");

  const filtered = groups.filter(g =>
    g.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-emerald-600" />
            Link WhatsApp Group
          </DialogTitle>
          <DialogDescription>
            Select a WhatsApp group for <strong>{customer.fullName}</strong> ({customer.customerId}).
            Confirmation notifications will be sent to this group.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {groups.length > 5 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search groups..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-search-link-groups" />
            </div>
          )}

          <div className="max-h-[300px] overflow-y-auto rounded-lg border divide-y">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No groups found</p>
            ) : filtered.map(g => (
              <button
                key={g.id}
                type="button"
                className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between ${selectedGroup === g.id ? "bg-emerald-50 dark:bg-emerald-950/30 border-l-2 border-l-emerald-500" : ""}`}
                onClick={() => setSelectedGroup(g.id)}
                data-testid={`button-select-group-${g.id}`}
              >
                <div>
                  <p className="font-medium text-sm">{g.subject}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{g.id}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="w-3.5 h-3.5" /> {g.participants}
                </div>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!selectedGroup || isPending}
            onClick={() => onLink(selectedGroup)}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="button-confirm-link"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link2 className="w-4 h-4 mr-2" />}
            Link Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
