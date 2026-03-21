import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, Search, Edit2, Trash2, ArrowLeft, Coins, Network, Layers,
  Star, MoreHorizontal, Globe, RefreshCw
} from "lucide-react";
import type { SystemVariable } from "@shared/schema";

const CATEGORIES = [
  { value: "currency", label: "Currency",   icon: Coins,          color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { value: "network",  label: "Network",    icon: Network,        color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "service",  label: "Service",    icon: Layers,         color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  { value: "rate_tier",label: "Rate Tier",  icon: Star,           color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "other",    label: "Other",      icon: MoreHorizontal, color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
];

const formSchema = z.object({
  key:         z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/i, "Key: letters, digits, underscores only"),
  name:        z.string().min(1).max(100),
  category:    z.string().min(1),
  description: z.string().optional(),
  metadata:    z.string().optional(),
  isActive:    z.boolean().default(true),
  sortOrder:   z.number().int().default(0),
});
type FormValues = z.infer<typeof formSchema>;

function categoryMeta(cat: string) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[4];
}

function VariableFormPage({
  variable,
  onBack,
}: {
  variable?: SystemVariable;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!variable;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      key:         variable?.key ?? "",
      name:        variable?.name ?? "",
      category:    variable?.category ?? "currency",
      description: variable?.description ?? "",
      metadata:    variable?.metadata ? JSON.stringify(variable.metadata, null, 2) : "{}",
      isActive:    variable?.isActive ?? true,
      sortOrder:   variable?.sortOrder ?? 0,
    },
  });

  const upsertMutation = useMutation({
    mutationFn: (values: FormValues) => {
      let metadata: object = {};
      try { metadata = JSON.parse(values.metadata ?? "{}"); } catch { metadata = {}; }
      const payload = { ...values, metadata };
      if (isEdit) {
        return apiRequest("PUT", `/api/system-variables/${values.key}`, payload);
      }
      return apiRequest("POST", `/api/system-variables`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-variables"] });
      toast({ title: isEdit ? "Variable updated" : "Variable created" });
      onBack();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{isEdit ? "Edit Variable" : "New Variable"}</h1>
          <p className="text-sm text-muted-foreground">System-wide reference variable</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(v => upsertMutation.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="key" render={({ field }) => (
              <FormItem>
                <FormLabel>Key *</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="USDT" disabled={isEdit} data-testid="input-key"
                    className="font-mono uppercase" onChange={e => field.onChange(e.target.value.toUpperCase())} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name *</FormLabel>
                <FormControl><Input {...field} placeholder="Tether USDT" data-testid="input-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem>
                <FormLabel>Category *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="sortOrder" render={({ field }) => (
              <FormItem>
                <FormLabel>Sort Order</FormLabel>
                <FormControl>
                  <Input {...field} type="number" onChange={e => field.onChange(Number(e.target.value))}
                    data-testid="input-sort-order" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ""} rows={2}
                  placeholder="What this variable represents" data-testid="input-description" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="metadata" render={({ field }) => (
            <FormItem>
              <FormLabel>Metadata (JSON)</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? "{}"} rows={5}
                  placeholder='{"symbol":"₮","decimals":6}' className="font-mono text-xs"
                  data-testid="input-metadata" />
              </FormControl>
              <p className="text-xs text-muted-foreground">Flexible properties — any JSON object</p>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="isActive" render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-active" />
              </FormControl>
              <FormLabel className="!mt-0">Active</FormLabel>
            </FormItem>
          )} />

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={upsertMutation.isPending} data-testid="button-save">
              {upsertMutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Variable"}
            </Button>
            <Button type="button" variant="outline" onClick={onBack}>Cancel</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function SystemVariables() {
  const [formMode, setFormMode]       = useState<null | "create" | "edit">(null);
  const [editVar, setEditVar]         = useState<SystemVariable | undefined>();
  const [search, setSearch]           = useState("");
  const [activeCategory, setCategory] = useState<string>("all");
  const { toast } = useToast();

  const { data: variables = [], isLoading } = useQuery<SystemVariable[]>({
    queryKey: ["/api/system-variables"],
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => apiRequest("DELETE", `/api/system-variables/${key}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-variables"] });
      toast({ title: "Variable deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (formMode) {
    return (
      <VariableFormPage
        key={editVar?.key ?? "new"}
        variable={editVar}
        onBack={() => { setFormMode(null); setEditVar(undefined); }}
      />
    );
  }

  const filtered = variables.filter(v => {
    const matchCat = activeCategory === "all" || v.category === activeCategory;
    const matchSearch = !search ||
      v.key.toLowerCase().includes(search.toLowerCase()) ||
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.description ?? "").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const grouped: { [cat: string]: SystemVariable[] } = {};
  for (const v of filtered) {
    if (!grouped[v.category]) grouped[v.category] = [];
    grouped[v.category].push(v);
  }

  const counts: { [cat: string]: number } = {};
  for (const v of variables) counts[v.category] = (counts[v.category] ?? 0) + 1;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-3 sm:p-6 border-b">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold" data-testid="page-title">System Variables</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Central registry of currencies, networks, services and other domain constants
            </p>
          </div>
          <Button onClick={() => { setEditVar(undefined); setFormMode("create"); }} data-testid="button-add-variable">
            <Plus className="h-4 w-4 mr-2" /> New Variable
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant={activeCategory === "all" ? "default" : "outline"} size="sm"
            onClick={() => setCategory("all")} data-testid="filter-all">
            <Globe className="h-3.5 w-3.5 mr-1.5" />
            All <span className="ml-1 text-xs opacity-70">{variables.length}</span>
          </Button>
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <Button key={cat.value}
                variant={activeCategory === cat.value ? "default" : "outline"} size="sm"
                onClick={() => setCategory(cat.value)}
                data-testid={`filter-${cat.value}`}>
                <Icon className="h-3.5 w-3.5 mr-1.5" />
                {cat.label}
                {counts[cat.value] != null && (
                  <span className="ml-1 text-xs opacity-70">{counts[cat.value]}</span>
                )}
              </Button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search variables…" className="pl-9" data-testid="input-search" />
        </div>
      </div>

      <div className="flex-1 p-3 sm:p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Globe className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">No variables found</p>
          </div>
        ) : (
          Object.entries(grouped).map(([cat, vars]) => {
            const catMeta = categoryMeta(cat);
            const CatIcon = catMeta.icon;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <CatIcon className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {catMeta.label}
                  </h2>
                  <span className="text-xs text-muted-foreground">({vars.length})</span>
                </div>
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {vars.map(v => (
                    <Card key={v.key} className={`border ${!v.isActive ? "opacity-50" : ""}`}
                      data-testid={`card-variable-${v.key}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <code className="text-xs font-mono font-bold bg-muted px-1.5 py-0.5 rounded"
                                data-testid={`text-key-${v.key}`}>{v.key}</code>
                              {!v.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                            </div>
                            <p className="text-sm font-medium truncate" data-testid={`text-name-${v.key}`}>
                              {v.name}
                            </p>
                            {v.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {v.description}
                              </p>
                            )}
                            {!!v.metadata && Object.keys(v.metadata as object).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {Object.entries(v.metadata as Record<string, string | number | boolean | null>)
                                  .slice(0, 3)
                                  .map(([k, val]) => (
                                  <span key={k} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                    {k}: {val == null ? "null" : String(val)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => { setEditVar(v); setFormMode("edit"); }}
                              data-testid={`button-edit-${v.key}`}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Delete variable "${v.key}"?`)) deleteMutation.mutate(v.key);
                              }}
                              data-testid={`button-delete-${v.key}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
