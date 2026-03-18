import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Shield, Bell, Users, Cpu, Globe, Save, Edit2, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface SystemSetting {
  id: string;
  key: string;
  value: any;
  category: string;
  label: string;
  description?: string;
  dataType: string;
  updatedAt: string;
}

const categoryConfig: Record<string, { label: string; icon: any; description: string }> = {
  accounts_assets: { label: "Accounts & Assets", icon: Globe, description: "Fiat currencies, crypto assets, bank accounts, wallets, and fee rates" },
  customer_defaults: { label: "Customer Defaults", icon: Users, description: "Risk levels, loyalty groups, KYC status options, and labels" },
  processing: { label: "Processing Rules", icon: Cpu, description: "Auto-matching, crypto API polling, Excel import, and net difference handling" },
  audit: { label: "Logs & Audit", icon: Settings2, description: "Event logging, audit trail, and record status options" },
  security: { label: "Security", icon: Shield, description: "Session timeouts, login attempts, and data retention policies" },
  notifications: { label: "Notifications", icon: Bell, description: "WhatsApp API, alert numbers, and group notification settings" },
  // Legacy categories from previous version
  general: { label: "General", icon: Globe, description: "Core system configuration" },
  customers: { label: "Customers", icon: Users, description: "Customer management settings" },
};

function SettingRow({ setting, canEdit }: { setting: SystemSetting; canEdit: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const mutation = useMutation({
    mutationFn: (value: any) => apiRequest("PUT", `/api/settings/${setting.key}`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Setting updated" });
      setEditing(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    let parsed: any = editValue;
    if (setting.dataType === "number") parsed = parseFloat(editValue);
    else if (setting.dataType === "boolean") parsed = editValue === "true";
    else if (setting.dataType === "array") {
      try { parsed = editValue.split(",").map(s => s.trim()).filter(Boolean); }
      catch { return toast({ title: "Invalid array format", variant: "destructive" }); }
    } else if (setting.dataType === "json") {
      try { parsed = JSON.parse(editValue); }
      catch { return toast({ title: "Invalid JSON format", description: "Please enter valid JSON", variant: "destructive" }); }
    }
    mutation.mutate(parsed);
  };

  const displayValue = () => {
    if (setting.dataType === "boolean") {
      return (
        <Switch
          checked={Boolean(setting.value)}
          onCheckedChange={(checked) => canEdit && mutation.mutate(checked)}
          disabled={!canEdit || mutation.isPending}
          data-testid={`toggle-setting-${setting.key}`}
        />
      );
    }
    if (setting.dataType === "array") {
      const arr = Array.isArray(setting.value) ? setting.value : [];
      if (editing) {
        return (
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              placeholder="Comma-separated values"
              className="text-sm"
              data-testid={`input-setting-${setting.key}`}
            />
            <Button size="icon" variant="ghost" onClick={handleSave} disabled={mutation.isPending}>
              <Check className="w-4 h-4 text-emerald-600" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setEditing(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 flex-wrap">
          {arr.length === 0 ? (
            <span className="text-sm text-muted-foreground">None configured</span>
          ) : arr.map((v: string, i: number) => (
            <Badge key={i} variant="secondary" className="text-xs">{v}</Badge>
          ))}
          {canEdit && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => { setEditValue(arr.join(", ")); setEditing(true); }}
            >
              <Edit2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      );
    }

    if (editing) {
      return (
        <div className="flex items-center gap-2 flex-1">
          <Input
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            type={setting.dataType === "number" ? "number" : "text"}
            className="text-sm"
            data-testid={`input-setting-${setting.key}`}
          />
          <Button size="icon" variant="ghost" onClick={handleSave} disabled={mutation.isPending}>
            <Check className="w-4 h-4 text-emerald-600" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setEditing(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      );
    }

    const isJson = setting.dataType === "json";
    return (
      <div className="flex items-start gap-2 max-w-md">
        {editing ? (
          <div className="flex items-start gap-2 flex-1">
            <textarea
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="text-xs font-mono border rounded-md p-2 flex-1 resize-y min-h-[80px] bg-background text-foreground"
              data-testid={`input-setting-${setting.key}`}
            />
            <div className="flex flex-col gap-1">
              <Button size="icon" variant="ghost" onClick={handleSave} disabled={mutation.isPending}>
                <Check className="w-4 h-4 text-emerald-600" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditing(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <code className="text-xs font-mono text-foreground bg-muted px-2 py-1 rounded break-all line-clamp-3 max-w-xs">
              {typeof setting.value === "object" ? JSON.stringify(setting.value, null, 0) : String(setting.value)}
            </code>
            {canEdit && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => { setEditValue(typeof setting.value === "object" ? JSON.stringify(setting.value, null, 2) : String(setting.value)); setEditing(true); }}
                data-testid={`button-edit-setting-${setting.key}`}
              >
                <Edit2 className="w-3 h-3" />
              </Button>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{setting.label}</p>
        {setting.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{setting.description}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center">
        {displayValue()}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin";

  const { data: settings, isLoading } = useQuery<SystemSetting[]>({
    queryKey: ["/api/settings"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
      </div>
    );
  }

  const grouped = settings?.reduce((acc, setting) => {
    if (!acc[setting.category]) acc[setting.category] = [];
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<string, SystemSetting[]>) ?? {};

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {canEdit ? "Configure system parameters and policies" : "View system configuration (read-only)"}
        </p>
      </div>

      {!canEdit && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
          <Shield className="w-4 h-4 shrink-0" />
          Settings are read-only. Administrator access required to make changes.
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(categoryConfig).map(([catKey, catCfg]) => {
          const catSettings = grouped[catKey] ?? [];
          if (catSettings.length === 0) return null;
          const CatIcon = catCfg.icon;

          return (
            <Card key={catKey}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <CatIcon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{catCfg.label}</CardTitle>
                    <CardDescription className="text-xs">{catCfg.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {catSettings.map((setting, i) => (
                    <SettingRow key={setting.key} setting={setting} canEdit={canEdit} />
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
