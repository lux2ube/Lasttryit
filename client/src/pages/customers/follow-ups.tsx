import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Edit2, Trash2, Loader2, CheckCircle2, Clock, AlertCircle, XCircle,
  Search, Filter, CalendarDays, User, ChevronDown,
} from "lucide-react";
import { Link } from "wouter";

interface FollowUp {
  id: string;
  customerId: string;
  title: string;
  notes?: string;
  status: "pending" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  dueTime?: string;
  completedAt?: string;
  assignedTo?: string;
  createdBy?: string;
  createdAt: string;
}

interface Customer { id: string; customerId: string; fullName: string; phonePrimary: string }
interface StaffUser { id: string; fullName: string; username: string }

const STATUS_CONFIG = {
  pending:     { label: "Pending",     icon: Clock,         color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  in_progress: { label: "In Progress", icon: AlertCircle,   color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  done:        { label: "Done",        icon: CheckCircle2,  color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  cancelled:   { label: "Cancelled",  icon: XCircle,       color: "bg-muted text-muted-foreground" },
};

const PRIORITY_CONFIG = {
  low:    { label: "Low",    color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  medium: { label: "Medium", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" },
  high:   { label: "High",   color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

const formSchema = z.object({
  customerId: z.string().min(1, "Customer required"),
  title:      z.string().min(1, "Title required").max(200),
  notes:      z.string().optional(),
  status:     z.enum(["pending", "in_progress", "done", "cancelled"]).default("pending"),
  priority:   z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate:    z.string().optional(),
  dueTime:    z.string().optional(),
  assignedTo: z.string().optional(),
});

type FollowUpForm = z.infer<typeof formSchema>;

function FollowUpDialog({
  open, onClose, edit, customers, staff,
}: {
  open: boolean; onClose: () => void; edit?: FollowUp;
  customers: Customer[]; staff: StaffUser[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [custSearch, setCustSearch] = useState("");

  const form = useForm<FollowUpForm>({
    resolver: zodResolver(formSchema),
    defaultValues: edit
      ? {
          customerId: edit.customerId,
          title:      edit.title,
          notes:      edit.notes ?? "",
          status:     edit.status,
          priority:   edit.priority,
          dueDate:    edit.dueDate ?? "",
          dueTime:    edit.dueTime ?? "",
          assignedTo: edit.assignedTo ?? "",
        }
      : { customerId: "", title: "", notes: "", status: "pending", priority: "medium", dueDate: "", dueTime: "", assignedTo: "" },
  });

  const mutation = useMutation({
    mutationFn: (data: FollowUpForm) => {
      const payload = { ...data, assignedTo: data.assignedTo || null, dueDate: data.dueDate || null, dueTime: data.dueTime || null };
      return edit
        ? apiRequest("PATCH", `/api/follow-ups/${edit.id}`, payload)
        : apiRequest("POST", "/api/follow-ups", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/follow-ups"] });
      toast({ title: edit ? "Follow-up updated" : "Follow-up created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filteredCustomers = custSearch
    ? customers.filter(c =>
        c.fullName.toLowerCase().includes(custSearch.toLowerCase()) ||
        c.phonePrimary.includes(custSearch) ||
        c.customerId.includes(custSearch)
      ).slice(0, 20)
    : customers.slice(0, 20);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{edit ? "Edit Follow-up" : "New Follow-up Task"}</DialogTitle>
          <DialogDescription className="sr-only">Follow-up task details</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">

            {/* Customer */}
            <FormField control={form.control} name="customerId" render={({ field }) => (
              <FormItem>
                <FormLabel>Customer *</FormLabel>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 text-sm"
                    placeholder="Search customer…"
                    value={custSearch || (customers.find(c => c.id === field.value)?.fullName ?? "")}
                    onChange={e => { setCustSearch(e.target.value); field.onChange(""); }}
                    onFocus={() => setCustSearch(custSearch || " ")}
                  />
                </div>
                {custSearch.trim() && (
                  <div className="border border-border rounded-md bg-popover max-h-40 overflow-y-auto shadow-md">
                    {filteredCustomers.map(c => (
                      <div key={c.id} className="px-3 py-2 cursor-pointer hover:bg-accent text-sm flex justify-between"
                        onClick={() => { field.onChange(c.id); setCustSearch(""); }}>
                        <span className="font-medium">{c.fullName}</span>
                        <span className="text-xs text-muted-foreground font-mono">{c.customerId}</span>
                      </div>
                    ))}
                    {filteredCustomers.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>}
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* Title */}
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Task *</FormLabel>
                <FormControl><Input {...field} placeholder="e.g. Call to verify documents, Follow up on pending transfer…" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Priority + Status */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="priority" render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            {/* Due date + time */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="dueDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="dueTime" render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Time</FormLabel>
                  <FormControl><Input type="time" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>

            {/* Assigned to */}
            <FormField control={form.control} name="assignedTo" render={({ field }) => (
              <FormItem>
                <FormLabel>Assign To</FormLabel>
                <Select value={field.value || "_none"} onValueChange={v => field.onChange(v === "_none" ? "" : v)}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="_none">Unassigned</SelectItem>
                    {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            {/* Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea {...field} rows={2} placeholder="Additional context or instructions…" /></FormControl>
              </FormItem>
            )} />

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : (edit ? "Save" : "Create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const today = new Date().toISOString().slice(0, 10);

function isOverdue(f: FollowUp) {
  return f.dueDate && f.dueDate < today && f.status !== "done" && f.status !== "cancelled";
}

export default function FollowUps() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<FollowUp | undefined>();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: followUps = [], isLoading } = useQuery<FollowUp[]>({ queryKey: ["/api/follow-ups"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: staff = [] } = useQuery<StaffUser[]>({ queryKey: ["/api/staff"] });

  const customerMap = customers.reduce<Record<string, Customer>>((m, c) => { m[c.id] = c; return m; }, {});
  const staffMap    = staff.reduce<Record<string, StaffUser>>((m, s) => { m[s.id] = s; return m; }, {});

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/follow-ups/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/follow-ups"] }); toast({ title: "Deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const quickStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/follow-ups/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/follow-ups"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = followUps.filter(f => {
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    if (filterPriority !== "all" && f.priority !== filterPriority) return false;
    if (search) {
      const cust = customerMap[f.customerId];
      const q = search.toLowerCase();
      return f.title.toLowerCase().includes(q) ||
        cust?.fullName.toLowerCase().includes(q) ||
        cust?.customerId.toLowerCase().includes(q);
    }
    return true;
  });

  const byStatus = {
    pending:     filtered.filter(f => f.status === "pending"),
    in_progress: filtered.filter(f => f.status === "in_progress"),
    done:        filtered.filter(f => f.status === "done"),
    cancelled:   filtered.filter(f => f.status === "cancelled"),
  };

  const overdue = followUps.filter(isOverdue).length;

  function openEdit(f: FollowUp) { setEditItem(f); setDialogOpen(true); }
  function handleClose() { setDialogOpen(false); setEditItem(undefined); }

  function renderCard(f: FollowUp) {
    const cust   = customerMap[f.customerId];
    const owner  = f.assignedTo ? staffMap[f.assignedTo] : null;
    const sc     = STATUS_CONFIG[f.status];
    const pc     = PRIORITY_CONFIG[f.priority];
    const over   = isOverdue(f);
    const StatusIcon = sc.icon;

    return (
      <div key={f.id} className={`rounded-xl border border-border bg-card p-4 hover-elevate ${over ? "border-red-400 dark:border-red-700" : ""}`} data-testid={`card-followup-${f.id}`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{f.title}</p>
            {cust && (
              <Link href={`/customers`}>
                <p className="text-xs text-muted-foreground hover:text-primary mt-0.5 truncate flex items-center gap-1">
                  <User className="w-3 h-3 shrink-0" />
                  {cust.fullName} · <span className="font-mono">{cust.customerId}</span>
                </p>
              </Link>
            )}
          </div>
          <Badge className={`text-[10px] px-1.5 py-0.5 shrink-0 ${pc.color}`}>{pc.label}</Badge>
        </div>

        {f.notes && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{f.notes}</p>}

        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Badge className={`text-[10px] px-1.5 py-0.5 gap-1 ${sc.color}`}>
            <StatusIcon className="w-2.5 h-2.5" />{sc.label}
          </Badge>
          {f.dueDate && (
            <span className={`text-[11px] flex items-center gap-1 ${over ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}`}>
              <CalendarDays className="w-3 h-3" />
              {over ? "Overdue · " : ""}{f.dueDate}{f.dueTime ? ` ${f.dueTime}` : ""}
            </span>
          )}
          {owner && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" />{owner.fullName}
            </span>
          )}
        </div>

        <div className="flex gap-1.5 pt-2 border-t border-border">
          {f.status !== "done" && (
            <Button size="sm" variant="ghost" className="h-6 text-[11px] text-emerald-700 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 px-2"
              onClick={() => quickStatusMutation.mutate({ id: f.id, status: "done" })}>
              <CheckCircle2 className="w-3 h-3 mr-1" />Done
            </Button>
          )}
          {f.status === "pending" && (
            <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
              onClick={() => quickStatusMutation.mutate({ id: f.id, status: "in_progress" })}>
              <Clock className="w-3 h-3 mr-1" />Start
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => openEdit(f)}>
            <Edit2 className="w-3 h-3 mr-1" />Edit
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-destructive hover:text-destructive ml-auto"
            onClick={() => { if (confirm("Delete this follow-up?")) deleteMutation.mutate(f.id); }}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  }

  const showKanban = filterStatus === "all";

  return (
    <div className="flex flex-col h-full overflow-hidden p-6">
      <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Follow-ups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and manage customer follow-up tasks</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-new-followup">
          <Plus className="w-4 h-4 mr-2" />New Follow-up
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-4 shrink-0">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{followUps.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-amber-600">Pending</p><p className="text-xl font-bold text-amber-600">{byStatus.pending.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-blue-600">In Progress</p><p className="text-xl font-bold text-blue-600">{byStatus.in_progress.length}</p></CardContent></Card>
        <Card className={overdue > 0 ? "border-red-400 dark:border-red-700" : ""}>
          <CardContent className="p-3">
            <p className="text-xs text-red-600">Overdue</p>
            <p className="text-xl font-bold text-red-600">{overdue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 shrink-0">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search tasks or customers…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All priorities</option>
          {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
        </div>
      ) : showKanban ? (
        <div className="flex-1 overflow-x-auto">
          <div className="grid grid-cols-4 gap-4 min-w-[800px] h-full">
            {(["pending", "in_progress", "done", "cancelled"] as const).map(status => {
              const sc = STATUS_CONFIG[status];
              const StatusIcon = sc.icon;
              const items = byStatus[status];
              return (
                <div key={status} className="flex flex-col">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-3 shrink-0 ${sc.color}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">{sc.label}</span>
                    <span className="ml-auto text-xs font-bold">{items.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                    {items.length === 0 ? (
                      <div className="text-center py-6 text-xs text-muted-foreground/50">Empty</div>
                    ) : (
                      items.map(f => renderCard(f))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center py-12">
                <Clock className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No follow-ups match your filters</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(f => renderCard(f))}
            </div>
          )}
        </div>
      )}

      <FollowUpDialog
        open={dialogOpen} onClose={handleClose} edit={editItem}
        customers={customers as Customer[]} staff={staff as StaffUser[]}
      />
    </div>
  );
}
