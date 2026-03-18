import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCryptoNetworkSchema } from "@shared/schema";
import type { CryptoNetwork } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Search, Pencil, Trash2, Globe, Loader2,
  Zap, DollarSign, ArrowDownUp, Hash,
} from "lucide-react";

const formSchema = insertCryptoNetworkSchema.extend({
  code: z.string().min(2, "Code required").max(20, "Max 20 chars")
    .regex(/^[A-Za-z0-9_-]+$/, "Letters, digits, underscores, hyphens only"),
  name: z.string().min(2, "Name required"),
  blockchain: z.string().min(2, "Blockchain required"),
  nativeToken: z.string().min(1, "Native token required"),
  networkFeeUsd: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
type NetworkForm = z.infer<typeof formSchema>;

const DEFAULTS: NetworkForm = {
  code: "",
  name: "",
  blockchain: "",
  nativeToken: "",
  networkFeeUsd: "0.10",
  sortOrder: 0,
  isActive: true,
};

function NetworkFormDialog({
  open, onClose, editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: CryptoNetwork | null;
}) {
  const { toast } = useToast();
  const form = useForm<NetworkForm>({
    resolver: zodResolver(formSchema),
    defaultValues: editing
      ? {
          code: editing.code,
          name: editing.name,
          blockchain: editing.blockchain,
          nativeToken: editing.nativeToken,
          networkFeeUsd: editing.networkFeeUsd ?? "0.10",
          sortOrder: editing.sortOrder ?? 0,
          isActive: editing.isActive ?? true,
        }
      : DEFAULTS,
  });

  const mutation = useMutation({
    mutationFn: (data: NetworkForm) =>
      editing
        ? apiRequest("PATCH", `/api/accounting/networks/${editing.id}`, data)
        : apiRequest("POST", "/api/accounting/networks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/networks"] });
      toast({ title: editing ? "Network updated" : "Network created" });
      onClose();
      form.reset(DEFAULTS);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Network" : "Add Crypto Network"}</DialogTitle>
          <DialogDescription>
            Define a blockchain network used by crypto wallet and platform providers.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="BEP20" data-testid="input-network-code"
                      disabled={!!editing}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())} />
                  </FormControl>
                  <FormDescription>Unique short code (e.g. TRC20, BEP20)</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="nativeToken" render={({ field }) => (
                <FormItem>
                  <FormLabel>Native Token</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="BNB" data-testid="input-network-native-token" />
                  </FormControl>
                  <FormDescription>Gas fee token (BNB, TRX, ETH…)</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="BNB Smart Chain (BEP20)" data-testid="input-network-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="blockchain" render={({ field }) => (
              <FormItem>
                <FormLabel>Blockchain</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Binance Smart Chain" data-testid="input-network-blockchain" />
                </FormControl>
                <FormDescription>Underlying blockchain name</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="networkFeeUsd" render={({ field }) => (
                <FormItem>
                  <FormLabel>Avg Network Fee (USD)</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" step="0.01" min="0" placeholder="0.10"
                      data-testid="input-network-fee" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="sortOrder" render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min="0" step="1" placeholder="0"
                      data-testid="input-network-sort" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem className="flex items-center gap-3 space-y-0">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange}
                    data-testid="switch-network-active" />
                </FormControl>
                <div>
                  <FormLabel>Active</FormLabel>
                  <FormDescription className="text-xs">Inactive networks are hidden from provider forms</FormDescription>
                </div>
              </FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}
                data-testid="button-cancel-network">Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-network">
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Save Changes" : "Create Network"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Networks() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CryptoNetwork | null>(null);
  const [deleting, setDeleting] = useState<CryptoNetwork | null>(null);

  const { data: networks = [], isLoading } = useQuery<CryptoNetwork[]>({
    queryKey: ["/api/accounting/networks", showInactive],
    queryFn: () =>
      fetch(`/api/accounting/networks${showInactive ? "?includeInactive=true" : ""}`)
        .then((r) => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/accounting/networks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/networks"] });
      toast({ title: "Network deleted" });
      setDeleting(null);
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/accounting/networks/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/accounting/networks"] }),
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const filtered = networks.filter((n) => {
    const q = search.toLowerCase();
    return (
      n.code.toLowerCase().includes(q) ||
      n.name.toLowerCase().includes(q) ||
      n.blockchain.toLowerCase().includes(q) ||
      n.nativeToken.toLowerCase().includes(q)
    );
  });

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (n: CryptoNetwork) => { setEditing(n); setDialogOpen(true); };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Crypto Networks
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Blockchain networks that providers operate on. Networks define the asset standard,
            native gas token, and average fee. Providers inherit their network metadata.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-network">
          <Plus className="h-4 w-4 mr-2" /> Add Network
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search networks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-networks"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch
            checked={showInactive}
            onCheckedChange={setShowInactive}
            data-testid="switch-show-inactive"
          />
          Show inactive
        </div>
      </div>

      <Separator />

      {/* Networks Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No networks found</p>
          {search && <p className="text-sm mt-1">Try clearing the search filter</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((n) => (
            <NetworkCard
              key={n.id}
              network={n}
              onEdit={() => openEdit(n)}
              onDelete={() => setDeleting(n)}
              onToggleActive={() => toggleActive.mutate({ id: n.id, isActive: !n.isActive })}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <NetworkFormDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Network</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleting?.name}</strong>?
              This will fail if any providers are still linked to this network.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-network">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              data-testid="button-confirm-delete-network"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NetworkCard({
  network, onEdit, onDelete, onToggleActive,
}: {
  network: CryptoNetwork;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-5 space-y-4 transition-opacity ${
        network.isActive ? "" : "opacity-60"
      }`}
      data-testid={`card-network-${network.id}`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight" data-testid={`text-network-name-${network.id}`}>
              {network.name}
            </div>
            <div className="text-xs text-muted-foreground">{network.blockchain}</div>
          </div>
        </div>
        <Badge
          variant={network.isActive ? "default" : "secondary"}
          className="text-xs"
          data-testid={`badge-network-status-${network.id}`}
        >
          {network.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground flex items-center gap-1">
            <Hash className="h-3 w-3" /> Code
          </span>
          <span className="font-mono font-medium" data-testid={`text-network-code-${network.id}`}>
            {network.code}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground flex items-center gap-1">
            <Zap className="h-3 w-3" /> Token
          </span>
          <span className="font-medium" data-testid={`text-network-token-${network.id}`}>
            {network.nativeToken}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> Fee
          </span>
          <span className="font-medium" data-testid={`text-network-fee-${network.id}`}>
            ${Number(network.networkFeeUsd ?? 0).toFixed(2)}
          </span>
        </div>
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={network.isActive}
            onCheckedChange={onToggleActive}
            data-testid={`switch-network-active-${network.id}`}
          />
          {network.isActive ? "Enabled" : "Disabled"}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}
            data-testid={`button-edit-network-${network.id}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
            onClick={onDelete} data-testid={`button-delete-network-${network.id}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
