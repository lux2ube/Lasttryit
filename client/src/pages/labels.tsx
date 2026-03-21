import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Tag, Edit2, Trash2, Users, Loader2 } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";

interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
  appliesTo?: string;
  autoDiscount?: any;
  autoLimits?: any;
  isActive: boolean;
  createdAt: string;
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#10b981",
  "#06b6d4", "#6366f1", "#8b5cf6", "#ec4899",
  "#64748b", "#1e40af",
];

const formSchema = z.object({
  name: z.string().min(1, "Name required").max(40, "Too long"),
  color: z.string().default("#6366f1"),
  description: z.string().optional(),
  appliesTo: z.string().optional(),
  isActive: z.boolean().default(true),
});

type LabelForm = z.infer<typeof formSchema>;

function LabelFormDialog({
  open,
  onClose,
  editLabel,
}: {
  open: boolean;
  onClose: () => void;
  editLabel?: Label;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<LabelForm>({
    resolver: zodResolver(formSchema),
    defaultValues: editLabel
      ? { name: editLabel.name, color: editLabel.color, description: editLabel.description ?? "", appliesTo: editLabel.appliesTo ?? "", isActive: editLabel.isActive }
      : { name: "", color: "#6366f1", description: "", appliesTo: "", isActive: true },
  });

  const mutation = useMutation({
    mutationFn: (data: LabelForm) =>
      editLabel
        ? apiRequest("PATCH", `/api/labels/${editLabel.id}`, data)
        : apiRequest("POST", "/api/labels", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/labels"] });
      toast({ title: editLabel ? "Label updated" : "Label created" });
      onClose();
      form.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const watchColor = form.watch("color");
  const watchName  = form.watch("name");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Tag className="w-4 h-4 text-primary" />
            {editLabel ? "Edit Label" : "New Label"}
          </DialogTitle>
          <DialogDescription className="sr-only">Create or edit a customer label</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-3">

            {/* Preview */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
              <Badge
                style={{ backgroundColor: watchColor + "20", color: watchColor, borderColor: watchColor + "50", border: "1px solid" }}
                className="text-sm font-semibold px-3 py-1"
              >
                {watchName || "Preview"}
              </Badge>
              <span className="text-xs text-muted-foreground">← Label preview</span>
            </div>

            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Label Name *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. VIP, HighVolume, ForexTrader" {...field} data-testid="input-label-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="color" render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button key={c} type="button"
                      onClick={() => field.onChange(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${field.value === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={field.value}
                    onChange={e => field.onChange(e.target.value)}
                    className="w-7 h-7 rounded-full border border-border cursor-pointer"
                    title="Custom color"
                  />
                </div>
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea placeholder="What does this label mean? When should it be used?" rows={2} {...field} />
                </FormControl>
              </FormItem>
            )} />

            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <FormField control={form.control} name="appliesTo" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">Applies To <InfoTip text="Operation type: deposit, withdraw, or all" /></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. deposit, withdraw, all" {...field} />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0 pb-1">
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                  <FormLabel className="mb-0 flex items-center gap-1">Active <InfoTip text="Inactive labels won't appear in forms" /></FormLabel>
                </FormItem>
              )} />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-label">
                {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : (editLabel ? "Save Changes" : "Create Label")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Labels() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editLabel, setEditLabel] = useState<Label | undefined>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: labelList, isLoading } = useQuery<Label[]>({ queryKey: ["/api/labels"] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/labels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/labels"] });
      toast({ title: "Label deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openEdit(label: Label) {
    setEditLabel(label);
    setDialogOpen(true);
  }

  function handleClose() {
    setDialogOpen(false);
    setEditLabel(undefined);
  }

  const activeCount   = labelList?.filter(l => l.isActive).length ?? 0;
  const inactiveCount = labelList?.filter(l => !l.isActive).length ?? 0;

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Labels</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Classify and group customers with custom labels
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-new-label">
          <Plus className="w-4 h-4 mr-2" />New Label
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Labels</p>
            <p className="text-xl sm:text-2xl font-bold">{labelList?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Inactive</p>
            <p className="text-xl sm:text-2xl font-bold text-muted-foreground">{inactiveCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Label Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : !labelList?.length ? (
        <Card>
          <div className="flex flex-col items-center py-16">
            <Tag className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No labels yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Create labels to group and classify your customers</p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />Create First Label
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {labelList.map(label => (
            <Card key={label.id} className={`hover-elevate ${!label.isActive ? "opacity-60" : ""}`} data-testid={`card-label-${label.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <Badge
                    style={{ backgroundColor: label.color + "20", color: label.color, borderColor: label.color + "50", border: "1px solid" }}
                    className="text-sm font-bold px-3 py-1"
                  >
                    {label.name}
                  </Badge>
                  {!label.isActive && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                  )}
                </div>

                {label.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{label.description}</p>
                )}

                {label.appliesTo && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Applies to: <span className="font-medium text-foreground capitalize">{label.appliesTo}</span>
                  </p>
                )}

                <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => openEdit(label)}
                    data-testid={`button-edit-label-${label.id}`}
                  >
                    <Edit2 className="w-3 h-3 mr-1" />Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete label "${label.name}"?`)) deleteMutation.mutate(label.id);
                    }}
                    data-testid={`button-delete-label-${label.id}`}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <LabelFormDialog open={dialogOpen} onClose={handleClose} editLabel={editLabel} />
    </div>
  );
}
