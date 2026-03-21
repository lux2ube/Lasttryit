import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert, Plus, Trash2, Edit2, Search, AlertTriangle,
  CheckCircle2, XCircle, Link2, X,
} from "lucide-react";
import { format } from "date-fns";

// ── Field catalogue — maps to real DB origins ─────────────────────────────────

type BlacklistField =
  | "first_name" | "second_name" | "third_name" | "last_name" | "full_name" | "name_fragment"
  | "phone" | "email"
  | "national_id" | "passport_no" | "nationality"
  | "wallet_address" | "bank_account";

const FIELD_GROUPS: { label: string; dbTable: string; fields: { field: BlacklistField; label: string; dbColumn: string; placeholder: string; matchType: "contains" | "exact" }[] }[] = [
  {
    label: "Name Fields",
    dbTable: "customers",
    fields: [
      { field: "first_name",    label: "First Name",       dbColumn: "customers.first_name",   placeholder: "e.g. Mohammed",           matchType: "contains" },
      { field: "second_name",   label: "Second Name",      dbColumn: "customers.second_name",  placeholder: "e.g. Ali",                matchType: "contains" },
      { field: "third_name",    label: "Third Name",       dbColumn: "customers.third_name",   placeholder: "e.g. Hassan",             matchType: "contains" },
      { field: "last_name",     label: "Last Name (Family)", dbColumn: "customers.last_name",  placeholder: "e.g. Al-Yemeni",          matchType: "contains" },
      { field: "full_name",     label: "Full Name",        dbColumn: "customers.full_name",    placeholder: "e.g. Mohammed Al-Yemeni", matchType: "contains" },
    ],
  },
  {
    label: "Contact",
    dbTable: "customers",
    fields: [
      { field: "phone",  label: "Phone Number",  dbColumn: "customers.phone_primary / phone_secondary[]", placeholder: "e.g. +9671234567890", matchType: "exact" },
      { field: "email",  label: "Email Address", dbColumn: "customers.email",                              placeholder: "e.g. name@domain.com", matchType: "exact" },
    ],
  },
  {
    label: "Identity Documents",
    dbTable: "customers.documentation (JSONB)",
    fields: [
      { field: "national_id",  label: "National ID / Iqama", dbColumn: "customers.documentation → national_id", placeholder: "e.g. 123456789",  matchType: "exact" },
      { field: "passport_no",  label: "Passport Number",     dbColumn: "customers.documentation → passport_no", placeholder: "e.g. A12345678", matchType: "exact" },
      { field: "nationality",  label: "Nationality",         dbColumn: "customers.demographics → nationality",  placeholder: "e.g. Yemeni",    matchType: "contains" },
    ],
  },
  {
    label: "Financial Accounts",
    dbTable: "customer_wallets",
    fields: [
      { field: "wallet_address", label: "Crypto Wallet Address", dbColumn: "customer_wallets.address_or_id (crypto)", placeholder: "0x… or TRC20/BEP20 address", matchType: "exact" },
      { field: "bank_account",   label: "Bank Account / IBAN",   dbColumn: "customer_wallets.address_or_id (cash)",   placeholder: "Account or IBAN number",      matchType: "exact" },
    ],
  },
];

const ALL_FIELDS = FIELD_GROUPS.flatMap(g => g.fields);
const fieldMeta = (f: BlacklistField) => ALL_FIELDS.find(x => x.field === f);

const FIELD_COLORS: Record<string, string> = {
  first_name: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  second_name: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  third_name: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  last_name: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  full_name: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  name_fragment: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  phone: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  email: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  national_id: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  passport_no: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  nationality: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  wallet_address: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  bank_account: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface BlacklistCondition {
  id?: string;
  subjectId?: string;
  field: BlacklistField;
  value: string;
}

interface BlacklistSubject {
  id: string;
  subjectName: string;
  reason?: string;
  isActive: boolean;
  matchCount: number;
  lastMatchAt?: string;
  createdAt: string;
  conditions: BlacklistCondition[];
}

// ── Condition builder row ─────────────────────────────────────────────────────

function ConditionRow({
  cond,
  index,
  total,
  onChange,
  onRemove,
}: {
  cond: BlacklistCondition;
  index: number;
  total: number;
  onChange: (c: BlacklistCondition) => void;
  onRemove: () => void;
}) {
  const meta = fieldMeta(cond.field);

  return (
    <div className="space-y-1">
      {index > 0 && (
        <div className="flex items-center gap-2 my-1">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            AND
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}

      <div className="flex gap-2 items-start bg-muted/40 rounded-lg p-2 border">
        {/* Field picker */}
        <div className="flex-1 min-w-0">
          <Select value={cond.field} onValueChange={v => onChange({ ...cond, field: v as BlacklistField, value: "" })}>
            <SelectTrigger className="h-8 text-xs" data-testid={`select-condition-field-${index}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_GROUPS.map(g => (
                <SelectGroup key={g.label}>
                  <SelectLabel className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1">
                    {g.label}
                    <span className="ml-1 opacity-50 font-mono text-[9px]">({g.dbTable})</span>
                  </SelectLabel>
                  {g.fields.map(f => (
                    <SelectItem key={f.field} value={f.field}>
                      <span className="flex flex-col">
                        <span>{f.label}</span>
                        <span className="text-[9px] text-muted-foreground font-mono">{f.dbColumn}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          {/* DB origin hint */}
          {meta && (
            <div className="flex items-center gap-1 mt-1 px-1">
              <Link2 className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground font-mono">{meta.dbColumn}</span>
              <span className="text-[9px] text-muted-foreground">
                ({meta.matchType === "contains" ? "fragment match" : "exact match"})
              </span>
            </div>
          )}
        </div>

        {/* Value input */}
        <Input
          className="h-8 text-xs flex-1"
          placeholder={meta?.placeholder ?? "value…"}
          value={cond.value}
          onChange={e => onChange({ ...cond, value: e.target.value })}
          data-testid={`input-condition-value-${index}`}
        />

        {/* Remove */}
        {total > 1 && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Dialog ────────────────────────────────────────────────────────────────────

function SubjectDialog({
  open, onClose, subject,
}: {
  open: boolean; onClose: () => void; subject?: BlacklistSubject | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [subjectName, setSubjectName] = useState(subject?.subjectName ?? "");
  const [reason, setReason] = useState(subject?.reason ?? "");
  const [isActive, setIsActive] = useState(subject?.isActive ?? true);
  const [conditions, setConditions] = useState<BlacklistCondition[]>(
    subject?.conditions?.length
      ? subject.conditions.map(c => ({ field: c.field, value: c.value }))
      : [{ field: "first_name", value: "" }]
  );

  const addCondition = () =>
    setConditions(prev => [...prev, { field: "last_name", value: "" }]);
  const updateCondition = (i: number, c: BlacklistCondition) =>
    setConditions(prev => prev.map((x, idx) => idx === i ? c : x));
  const removeCondition = (i: number) =>
    setConditions(prev => prev.filter((_, idx) => idx !== i));

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        subjectName,
        reason: reason || undefined,
        isActive,
        conditions: conditions.filter(c => c.value.trim()),
      };
      if (subject) return apiRequest("PATCH", `/api/blacklist/${subject.id}`, body);
      return apiRequest("POST", "/api/blacklist", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
      toast({ title: subject ? "Entry updated" : "Blacklist entry added" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const valid = subjectName.trim() && conditions.some(c => c.value.trim());

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            {subject ? "Edit Blacklist Entry" : "Add Blacklisted Entity"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            All conditions in a block must match simultaneously (AND logic) to flag a customer.
            Add multiple conditions to be more precise.
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Subject name */}
          <div className="space-y-1.5">
            <Label>Entity Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Mohammed Al-Yemeni, Suspicious Phone, ..."
              value={subjectName}
              onChange={e => setSubjectName(e.target.value)}
              data-testid="input-subject-name"
            />
            <p className="text-[11px] text-muted-foreground">A descriptive label for this blocked entity (internal use only)</p>
          </div>

          {/* Conditions builder */}
          <div className="space-y-1">
            <Label>Matching Conditions <span className="text-destructive">*</span></Label>
            <p className="text-[11px] text-muted-foreground mb-2">
              All conditions must be true at the same time to trigger a flag. Select the exact database field to screen against.
            </p>

            <div className="space-y-0">
              {conditions.map((cond, i) => (
                <ConditionRow
                  key={i}
                  index={i}
                  total={conditions.length}
                  cond={cond}
                  onChange={c => updateCondition(i, c)}
                  onRemove={() => removeCondition(i)}
                />
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full h-8 text-xs border-dashed"
              onClick={addCondition}
              data-testid="button-add-condition"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Another Condition (AND)
            </Button>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label>Reason / Notes</Label>
            <Textarea
              placeholder="Why is this entity blacklisted? (optional, internal)"
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between border rounded-lg px-3 py-2">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Inactive entries are skipped during screening</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="button-save-subject"
          >
            {mutation.isPending ? "Saving…" : subject ? "Save Changes" : "Add to Blacklist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Subject card ──────────────────────────────────────────────────────────────

function SubjectCard({ subject, onEdit, onDelete, deleting }: {
  subject: BlacklistSubject;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <Card
      className={`hover-elevate ${!subject.isActive ? "opacity-55" : ""} ${subject.matchCount > 0 ? "border-destructive/40" : ""}`}
      data-testid={`card-blacklist-${subject.id}`}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm text-foreground">{subject.subjectName}</p>
              {!subject.isActive && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <XCircle className="w-2.5 h-2.5" /> Inactive
                </Badge>
              )}
              {subject.matchCount > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/40">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {subject.matchCount} hit{subject.matchCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            {subject.reason && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{subject.reason}</p>
            )}
          </div>
          <div className="flex gap-0.5 shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}
              data-testid={`button-edit-blacklist-${subject.id}`}>
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDelete} disabled={deleting}
              data-testid={`button-delete-blacklist-${subject.id}`}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Conditions — AND chain */}
        <div className="flex flex-wrap items-center gap-1">
          {subject.conditions.map((cond, i) => {
            const meta = fieldMeta(cond.field);
            const color = FIELD_COLORS[cond.field] ?? "bg-muted text-muted-foreground";
            return (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && (
                  <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    AND
                  </span>
                )}
                <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ${color}`}>
                  <span className="font-semibold">{meta?.label ?? cond.field}:</span>
                  <span className="font-mono">{cond.value}</span>
                  {meta && (
                    <span className="opacity-60 hidden sm:inline">
                      ({meta.matchType === "contains" ? "≈" : "="})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {subject.conditions.length === 0 && (
            <span className="text-xs text-muted-foreground italic">No conditions set</span>
          )}
        </div>

        {/* DB origin tooltip row */}
        {subject.conditions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
            {subject.conditions.map((cond, i) => {
              const meta = fieldMeta(cond.field);
              return meta ? (
                <span key={i} className="text-[9px] text-muted-foreground font-mono flex items-center gap-0.5">
                  <Link2 className="w-2 h-2" />
                  {meta.dbColumn}
                </span>
              ) : null;
            })}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground mt-2">
          Added {format(new Date(subject.createdAt), "dd MMM yyyy")}
          {subject.lastMatchAt && (
            <span className="text-destructive"> · Last match {format(new Date(subject.lastMatchAt), "dd MMM yyyy")}</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Blacklist() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSubject, setEditSubject] = useState<BlacklistSubject | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: subjects, isLoading } = useQuery<BlacklistSubject[]>({
    queryKey: ["/api/blacklist"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      setDeletingId(id);
      return apiRequest("DELETE", `/api/blacklist/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
      toast({ title: "Blacklist entry removed" });
    },
    onSettled: () => setDeletingId(null),
  });

  const activeCount = subjects?.filter(s => s.isActive).length ?? 0;
  const hitCount = subjects?.filter(s => s.matchCount > 0).length ?? 0;
  const condCount = subjects?.reduce((acc, s) => acc + s.conditions.length, 0) ?? 0;

  const filtered = subjects?.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.subjectName.toLowerCase().includes(q) ||
      s.reason?.toLowerCase().includes(q) ||
      s.conditions.some(c => c.value.toLowerCase().includes(q) || c.field.includes(q))
    );
  });

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-destructive" />
            Blacklist Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Multi-condition AML screening — all conditions in a block must match (AND logic)
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => { setEditSubject(null); setDialogOpen(true); }}
          data-testid="button-add-blacklist"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Entry
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card className="hover-elevate border-destructive/20 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-destructive/10 text-destructive">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Entries</p>
              <p className="text-xl font-bold">{activeCount} <span className="text-xs font-normal text-muted-foreground">/ {subjects?.length ?? 0}</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-amber-100 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">With Match History</p>
              <p className="text-xl font-bold text-destructive">{hitCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-blue-100 text-blue-700">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Conditions</p>
              <p className="text-xl font-bold">{condCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, reason, field, or value…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-blacklist-search"
        />
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground mb-3">
        {filtered?.length ?? 0} entries shown
        {search && (
          <button onClick={() => setSearch("")} className="ml-2 underline text-primary">Clear</button>
        )}
      </p>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : !filtered?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <CheckCircle2 className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">
              {search ? "No matching entries" : "No blacklist entries yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Add entries with AND-conditions to screen customers during onboarding
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <SubjectCard
              key={s.id}
              subject={s}
              onEdit={() => { setEditSubject(s); setDialogOpen(true); }}
              onDelete={() => deleteMutation.mutate(s.id)}
              deleting={deletingId === s.id}
            />
          ))}
        </div>
      )}

      <SubjectDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditSubject(null); }}
        subject={editSubject}
      />
    </div>
  );
}
