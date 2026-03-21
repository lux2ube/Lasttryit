import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Users, FileText, Settings, ShieldAlert, Activity } from "lucide-react";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string;
  actorName?: string;
  before?: any;
  after?: any;
  ipAddress?: string;
  createdAt: string;
}

const entityIcons: Record<string, { icon: any; color: string; bg: string }> = {
  customer: { icon: Users, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/20" },
  record: { icon: FileText, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/20" },
  staff_user: { icon: Users, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/20" },
  blacklist: { icon: ShieldAlert, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/20" },
  system_setting: { icon: Settings, color: "text-gray-600", bg: "bg-gray-100 dark:bg-gray-900/20" },
  transaction: { icon: Activity, color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900/20" },
};

const actionColors: Record<string, string> = {
  created: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  updated: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  deleted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  added: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

export default function AuditLog() {
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs", entityTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityTypeFilter && entityTypeFilter !== "all") params.set("entityType", entityTypeFilter);
      const res = await fetch(`/api/audit-logs?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete history of all system events · {logs?.length ?? 0} entries
          </p>
        </div>
        <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
          <SelectTrigger className="w-full sm:w-48" data-testid="select-entity-filter">
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="record">Records</SelectItem>
            <SelectItem value="staff_user">Staff Users</SelectItem>
            <SelectItem value="blacklist">Blacklist</SelectItem>
            <SelectItem value="system_setting">System Settings</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !logs?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <ClipboardList className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No audit events found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log) => {
            const entityCfg = entityIcons[log.entityType] ?? { icon: Activity, color: "text-gray-500", bg: "bg-gray-100" };
            const EntityIcon = entityCfg.icon;

            return (
              <Card key={log.id} className="hover-elevate" data-testid={`log-entry-${log.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${entityCfg.bg}`}>
                      <EntityIcon className={`w-4 h-4 ${entityCfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground capitalize">
                          {log.entityType.replace(/_/g, " ")}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${actionColors[log.action] ?? ""}`}
                        >
                          {log.action}
                        </Badge>
                        {log.actorName && (
                          <span className="text-xs text-muted-foreground">by {log.actorName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground truncate max-w-48">
                          ID: {log.entityId}
                        </span>
                        {log.ipAddress && (
                          <span className="text-xs text-muted-foreground">IP: {log.ipAddress}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(log.createdAt), "MMM d, yyyy")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(log.createdAt), "h:mm:ss a")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
