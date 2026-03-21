import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { AccountingPeriod } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Lock, LockOpen, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const STATUS_CONFIG: { [k: string]: { label: string; className: string; icon: any } } = {
  open:   { label: "Open",   className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",   icon: CheckCircle2 },
  closed: { label: "Closed", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
  locked: { label: "Locked", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",           icon: Lock },
};

const formSchema = z.object({
  name:      z.string().min(2, "Period name required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  notes:     z.string().optional(),
});

function PeriodFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", startDate: "", endDate: "", notes: "" },
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accounting/periods", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/periods"] });
      toast({ title: "Accounting period created" });
      form.reset();
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Accounting Period</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Period Name *</FormLabel>
                <FormControl><Input placeholder="e.g. April 2026" {...field} data-testid="input-period-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date *</FormLabel>
                  <FormControl><Input type="date" {...field} data-testid="input-period-start" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="endDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>End Date *</FormLabel>
                  <FormControl><Input type="date" {...field} data-testid="input-period-end" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea rows={2} {...field} /></FormControl>
              </FormItem>
            )} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-period">
                {mutation.isPending ? "Creating…" : "Create Period"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountingPeriodsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);

  const { data: periods = [], isLoading } = useQuery<AccountingPeriod[]>({
    queryKey: ["/api/accounting/periods"],
  });

  const actionMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiRequest("POST", `/api/accounting/periods/${id}/${action}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/periods"] });
      toast({ title: "Period status updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canClose = user?.role === "admin" || user?.role === "finance_officer";
  const canLock  = user?.role === "admin";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/95">
        <div>
          <h1 className="text-xl font-bold">Accounting Periods</h1>
          <p className="text-sm text-muted-foreground">
            Define financial months and years. Close or lock periods to prevent retrospective editing.
          </p>
        </div>
        {canClose && (
          <Button onClick={() => setFormOpen(true)} data-testid="button-new-period">
            <Plus className="w-4 h-4 mr-2" />New Period
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading periods…</div>
        ) : periods.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No accounting periods defined</div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {/* Status legend */}
            <div className="flex gap-4 text-xs text-muted-foreground mb-4">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Open — accepts journal entries</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />Closed — no new entries (can reopen)</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Locked — permanently frozen</span>
            </div>
            {periods.map(p => {
              const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.open;
              const Icon = cfg.icon;
              return (
                <div key={p.id} className="border border-border rounded-xl p-5 bg-card hover:shadow-sm transition-shadow" data-testid={`card-period-${p.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cfg.className}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-base">{p.name}</div>
                        <div className="text-sm text-muted-foreground font-mono">{p.startDate} → {p.endDate}</div>
                        {p.notes && <div className="text-xs text-muted-foreground mt-0.5">{p.notes}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.className}`}>{cfg.label}</span>
                      <div className="flex gap-1.5">
                        {p.status === 'open' && canClose && (
                          <Button size="sm" variant="outline" data-testid={`button-close-period-${p.id}`}
                            disabled={actionMut.isPending}
                            onClick={() => { if (confirm(`Close period "${p.name}"? No new entries will be allowed.`)) actionMut.mutate({ id: p.id, action: 'close' }); }}>
                            <Clock className="w-3.5 h-3.5 mr-1" />Close
                          </Button>
                        )}
                        {p.status === 'closed' && canClose && (
                          <Button size="sm" variant="outline" data-testid={`button-reopen-period-${p.id}`}
                            disabled={actionMut.isPending}
                            onClick={() => actionMut.mutate({ id: p.id, action: 'reopen' })}>
                            <LockOpen className="w-3.5 h-3.5 mr-1" />Reopen
                          </Button>
                        )}
                        {p.status === 'closed' && canLock && (
                          <Button size="sm" variant="destructive" data-testid={`button-lock-period-${p.id}`}
                            disabled={actionMut.isPending}
                            onClick={() => { if (confirm(`PERMANENTLY lock period "${p.name}"? This CANNOT be undone.`)) actionMut.mutate({ id: p.id, action: 'lock' }); }}>
                            <Lock className="w-3.5 h-3.5 mr-1" />Lock
                          </Button>
                        )}
                        {p.status === 'locked' && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            {p.closedAt ? `Locked ${new Date(p.closedAt).toLocaleDateString()}` : "Permanently locked"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PeriodFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}
