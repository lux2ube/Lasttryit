import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Loader2, Users, TrendingUp, Percent, AlertCircle } from "lucide-react";

interface CustomerGroup {
  id: string;
  code: string;
  name: string;
  description?: string;
  color: string;
  rateOverrides: Array<{ currencyCode: string; buyRate: number | null; sellRate: number | null }>;
  feeOverrides: Array<{ providerId: string; providerName: string; depositFeeRate: number | null; withdrawFeeRate: number | null }>;
  recordLimits: { perTransaction?: number; perMonth?: number; perYear?: number; currency?: string };
  isActive: boolean;
}

interface Currency { code: string; name: string; symbol: string; type: string; isActive: boolean }
interface Provider { id: string; name: string; currency: string; providerCategory: string; isActive: boolean }

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#f59e0b", "#10b981", "#06b6d4",
  "#1e40af", "#64748b",
];

const rateOverrideSchema = z.object({
  currencyCode: z.string().min(1),
  buyRate:      z.number().positive().optional().nullable(),
  sellRate:     z.number().positive().optional().nullable(),
});

const feeOverrideSchema = z.object({
  providerId:       z.string().min(1),
  providerName:     z.string().default(""),
  depositFeeRate:   z.number().min(0).max(100).optional().nullable(),
  withdrawFeeRate:  z.number().min(0).max(100).optional().nullable(),
});

const formSchema = z.object({
  code:          z.string().min(1, "Code required").max(40).regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, underscores only"),
  name:          z.string().min(1, "Name required").max(100),
  description:   z.string().optional(),
  color:         z.string().default("#6366f1"),
  isActive:      z.boolean().default(true),
  rateOverrides: z.array(rateOverrideSchema).default([]),
  feeOverrides:  z.array(feeOverrideSchema).default([]),
  recordLimits: z.object({
    perTransaction: z.number().positive().optional().nullable(),
    perMonth:       z.number().positive().optional().nullable(),
    perYear:        z.number().positive().optional().nullable(),
    currency:       z.string().optional(),
  }).default({}),
});

type GroupForm = z.infer<typeof formSchema>;

function GroupDialog({
  open, onClose, edit, currencies, providers,
}: {
  open: boolean; onClose: () => void; edit?: CustomerGroup;
  currencies: Currency[]; providers: Provider[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const form = useForm<GroupForm>({
    resolver: zodResolver(formSchema),
    defaultValues: edit
      ? {
          code: edit.code, name: edit.name, description: edit.description ?? "",
          color: edit.color, isActive: edit.isActive,
          rateOverrides: edit.rateOverrides ?? [],
          feeOverrides: edit.feeOverrides ?? [],
          recordLimits: edit.recordLimits ?? {},
        }
      : {
          code: "", name: "", description: "", color: "#6366f1", isActive: true,
          rateOverrides: [], feeOverrides: [], recordLimits: {},
        },
  });

  const { fields: rateFields, append: appendRate, remove: removeRate } = useFieldArray({ control: form.control, name: "rateOverrides" });
  const { fields: feeFields, append: appendFee, remove: removeFee } = useFieldArray({ control: form.control, name: "feeOverrides" });
  const watchColor = form.watch("color");
  const watchName  = form.watch("name");

  const activeCurrencies = currencies.filter(c => c.isActive && c.code !== "USD");
  const activeProviders  = providers.filter(p => p.isActive);

  const mutation = useMutation({
    mutationFn: (data: GroupForm) => {
      const payload = {
        ...data,
        feeOverrides: data.feeOverrides.map(f => ({
          ...f,
          providerName: providers.find(p => p.id === f.providerId)?.name ?? f.providerName,
        })),
      };
      return edit
        ? apiRequest("PATCH", `/api/customer-groups/${edit.id}`, payload)
        : apiRequest("POST", "/api/customer-groups", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/customer-groups"] });
      toast({ title: edit ? "Group updated" : "Group created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const usedCurrencies = form.watch("rateOverrides").map(r => r.currencyCode);
  const usedProviders  = form.watch("feeOverrides").map(f => f.providerId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-5 h-5 rounded" style={{ backgroundColor: watchColor }} />
            {watchName || (edit ? "Edit Group" : "New Customer Group")}
          </DialogTitle>
          <DialogDescription className="sr-only">Customer group settings</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="flex flex-col flex-1 overflow-hidden">
            <Tabs defaultValue="basic" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="shrink-0 mb-2">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="rates">Rate Overrides</TabsTrigger>
                <TabsTrigger value="fees">Fee Overrides</TabsTrigger>
                <TabsTrigger value="limits">Record Limits</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-auto">
                {/* Basic Info */}
                <TabsContent value="basic" className="space-y-4 mt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="code" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Code * <span className="text-xs text-muted-foreground font-normal">(e.g. vip, gold)</span></FormLabel>
                        <FormControl><Input {...field} placeholder="standard" className="font-mono" disabled={!!edit} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name *</FormLabel>
                        <FormControl><Input {...field} placeholder="VIP Customers" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Textarea {...field} rows={2} placeholder="Who belongs to this group and what benefits they get…" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="color" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color</FormLabel>
                      <div className="flex items-center gap-2 flex-wrap">
                        {PRESET_COLORS.map(c => (
                          <button key={c} type="button" onClick={() => field.onChange(c)}
                            className={`w-7 h-7 rounded-full border-2 transition-all ${field.value === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                            style={{ backgroundColor: c }} />
                        ))}
                        <input type="color" value={field.value} onChange={e => field.onChange(e.target.value)} className="w-7 h-7 rounded-full border border-border cursor-pointer" />
                      </div>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="isActive" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                      <FormLabel className="mb-0">Active</FormLabel>
                    </FormItem>
                  )} />
                </TabsContent>

                {/* Rate Overrides */}
                <TabsContent value="rates" className="mt-0">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium">Custom Exchange Rates</p>
                      <p className="text-xs text-muted-foreground">Override buy/sell rates per currency for this group. Leave blank to use system rates.</p>
                    </div>
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => appendRate({ currencyCode: "", buyRate: null, sellRate: null })}
                      disabled={usedCurrencies.length >= activeCurrencies.length}>
                      <Plus className="w-3.5 h-3.5 mr-1" />Add
                    </Button>
                  </div>
                  {rateFields.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No rate overrides — system rates will be used
                    </div>
                  )}
                  <div className="space-y-2">
                    {rateFields.map((f, idx) => (
                      <div key={f.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end p-3 rounded-lg border border-border bg-muted/20">
                        <FormField control={form.control} name={`rateOverrides.${idx}.currencyCode`} render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-xs">Currency</FormLabel>
                            <select {...field} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs font-mono">
                              <option value="">Select…</option>
                              {activeCurrencies.filter(c => !usedCurrencies.includes(c.code) || c.code === field.value).map(c => (
                                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                              ))}
                            </select>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`rateOverrides.${idx}.buyRate`} render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-xs text-blue-600">Buy Rate (we buy)</FormLabel>
                            <Input className="h-8 text-xs font-mono" type="number" step="0.0001" placeholder="System rate" value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`rateOverrides.${idx}.sellRate`} render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-xs text-green-600">Sell Rate (we sell)</FormLabel>
                            <Input className="h-8 text-xs font-mono" type="number" step="0.0001" placeholder="System rate" value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                          </FormItem>
                        )} />
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0" onClick={() => removeRate(idx)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* Fee Overrides */}
                <TabsContent value="fees" className="mt-0">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium">Custom Service Fees</p>
                      <p className="text-xs text-muted-foreground">Override deposit/withdraw fee % per provider for this group.</p>
                    </div>
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => appendFee({ providerId: "", providerName: "", depositFeeRate: null, withdrawFeeRate: null })}
                      disabled={usedProviders.length >= activeProviders.length}>
                      <Plus className="w-3.5 h-3.5 mr-1" />Add
                    </Button>
                  </div>
                  {feeFields.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Percent className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No fee overrides — provider default fees will be used
                    </div>
                  )}
                  <div className="space-y-2">
                    {feeFields.map((f, idx) => (
                      <div key={f.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end p-3 rounded-lg border border-border bg-muted/20">
                        <FormField control={form.control} name={`feeOverrides.${idx}.providerId`} render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-xs">Provider</FormLabel>
                            <select {...field} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                              <option value="">Select…</option>
                              {activeProviders.filter(p => !usedProviders.includes(p.id) || p.id === field.value).map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`feeOverrides.${idx}.depositFeeRate`} render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-xs text-blue-600">Deposit Fee %</FormLabel>
                            <Input className="h-8 text-xs font-mono" type="number" step="0.01" min="0" max="100" placeholder="Default" value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`feeOverrides.${idx}.withdrawFeeRate`} render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-xs text-green-600">Withdraw Fee %</FormLabel>
                            <Input className="h-8 text-xs font-mono" type="number" step="0.01" min="0" max="100" placeholder="Default" value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                          </FormItem>
                        )} />
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0" onClick={() => removeFee(idx)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* Record Limits */}
                <TabsContent value="limits" className="mt-0 space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-1">Record (Transaction) Limits</p>
                    <p className="text-xs text-muted-foreground mb-4">Set maximum allowed amounts per record, per month, and per year. Leave blank for no limit.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="recordLimits.currency" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Limit Currency</FormLabel>
                        <select {...field} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">USD (default)</option>
                          {currencies.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                        </select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="recordLimits.perTransaction" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Per Transaction Max</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" placeholder="No limit" className="font-mono"
                            value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="recordLimits.perMonth" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Per Month Max</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" placeholder="No limit" className="font-mono"
                            value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="recordLimits.perYear" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Per Year Max</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" placeholder="No limit" className="font-mono"
                            value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Limits apply to customers assigned to this group via their loyalty group field. Limits are validated at record creation time.</span>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <div className="flex justify-end gap-2 pt-3 border-t border-border shrink-0">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : (edit ? "Save Changes" : "Create Group")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomerGroups() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CustomerGroup | undefined>();

  const { data: groups = [], isLoading } = useQuery<CustomerGroup[]>({ queryKey: ["/api/customer-groups"] });
  const { data: currencies = [] } = useQuery<Currency[]>({ queryKey: ["/api/accounting/currencies"] });
  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/accounting/providers"] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/customer-groups/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/customer-groups"] }); toast({ title: "Group deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openEdit(g: CustomerGroup) { setEditItem(g); setDialogOpen(true); }
  function handleClose() { setDialogOpen(false); setEditItem(undefined); }

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Customer Groups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define loyalty tiers with custom exchange rates, service fees, and record limits
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-new-group">
          <Plus className="w-4 h-4 mr-2" />New Group
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Groups</p><p className="text-2xl font-bold">{groups.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active</p><p className="text-2xl font-bold text-emerald-600">{groups.filter(g => g.isActive).length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">With Rate Overrides</p><p className="text-2xl font-bold text-purple-600">{groups.filter(g => (g.rateOverrides ?? []).length > 0).length}</p></CardContent></Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-16">
            <Users className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No customer groups yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Create groups to set custom rates, fees, and limits per tier</p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />Create First Group
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(g => (
            <Card key={g.id} className={`hover-elevate ${!g.isActive ? "opacity-60" : ""}`} data-testid={`card-group-${g.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                    <CardTitle className="text-base">{g.name}</CardTitle>
                  </div>
                  {!g.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                </div>
                <code className="text-xs text-muted-foreground font-mono">{g.code}</code>
              </CardHeader>
              <CardContent>
                {g.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{g.description}</p>}

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(g.rateOverrides ?? []).length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                      <TrendingUp className="w-2.5 h-2.5" />
                      {(g.rateOverrides ?? []).length} rate{(g.rateOverrides ?? []).length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  {(g.feeOverrides ?? []).length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                      <Percent className="w-2.5 h-2.5" />
                      {(g.feeOverrides ?? []).length} fee override{(g.feeOverrides ?? []).length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  {g.recordLimits?.perTransaction && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      Max {g.recordLimits.currency ?? "USD"} {Number(g.recordLimits.perTransaction).toLocaleString()}/tx
                    </Badge>
                  )}
                </div>

                {/* Rate overrides preview */}
                {(g.rateOverrides ?? []).length > 0 && (
                  <div className="mb-3 p-2 rounded-lg bg-muted/40 text-xs space-y-1">
                    {(g.rateOverrides ?? []).slice(0, 2).map(r => (
                      <div key={r.currencyCode} className="flex items-center justify-between">
                        <span className="font-mono font-bold text-primary">{r.currencyCode}</span>
                        <span className="flex gap-3">
                          {r.buyRate != null && <span className="text-blue-600">Buy {r.buyRate}</span>}
                          {r.sellRate != null && <span className="text-green-600">Sell {r.sellRate}</span>}
                        </span>
                      </div>
                    ))}
                    {(g.rateOverrides ?? []).length > 2 && (
                      <p className="text-muted-foreground text-[10px]">+{(g.rateOverrides ?? []).length - 2} more…</p>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-3 border-t border-border">
                  <Button size="sm" variant="ghost" className="h-7 text-xs flex-1" onClick={() => openEdit(g)}>
                    <Edit2 className="w-3 h-3 mr-1" />Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => { if (confirm(`Delete group "${g.name}"?`)) deleteMutation.mutate(g.id); }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <GroupDialog
        open={dialogOpen} onClose={handleClose} edit={editItem}
        currencies={currencies as Currency[]} providers={providers as Provider[]}
      />
    </div>
  );
}
