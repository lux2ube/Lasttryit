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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { UserCog, Plus, Edit2, Mail, Calendar, Shield } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS, ROLE_COLORS, type StaffRole } from "@/lib/auth";

interface StaffUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: StaffRole;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

const formSchema = z.object({
  fullName: z.string().min(2, "Name required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Valid email required"),
  role: z.enum(["admin", "operations_manager", "finance_officer", "compliance_officer", "customer_support"]),
  isActive: z.boolean().default(true),
  password: z.string().optional(),
});

type StaffForm = z.infer<typeof formSchema>;

function StaffFormDialog({
  open,
  onClose,
  staffUser,
}: {
  open: boolean;
  onClose: () => void;
  staffUser?: StaffUser | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<StaffForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: staffUser?.fullName ?? "",
      username: staffUser?.username ?? "",
      email: staffUser?.email ?? "",
      role: staffUser?.role ?? "finance_officer",
      isActive: staffUser?.isActive ?? true,
      password: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: StaffForm) => {
      if (staffUser) {
        const { password, ...rest } = data;
        const payload = password ? data : rest;
        return apiRequest("PATCH", `/api/staff/${staffUser.id}`, payload);
      }
      if (!data.password) throw new Error("Password is required for new staff");
      return apiRequest("POST", "/api/staff", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: staffUser ? "Staff member updated" : "Staff member created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            {staffUser ? "Edit Staff Member" : "New Staff Member"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-3">
            <FormField control={form.control} name="fullName" render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name *</FormLabel>
                <FormControl><Input data-testid="input-staff-name" placeholder="John Doe" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="username" render={({ field }) => (
                <FormItem>
                  <FormLabel>Username *</FormLabel>
                  <FormControl><Input placeholder="john.doe" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl><Input type="email" placeholder="john@company.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>Role *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-staff-role">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    Password {!staffUser && "*"} {staffUser && <InfoTip text="Leave blank to keep current password" />}
                  </FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0 pt-7">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="mb-0 flex items-center gap-1">Active <InfoTip text="Inactive accounts cannot log in" /></FormLabel>
                </FormItem>
              )} />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-staff">
                {mutation.isPending ? "Saving..." : staffUser ? "Save Changes" : "Create Member"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Staff() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const { user: currentUser } = useAuth();

  const { data: staff, isLoading } = useQuery<StaffUser[]>({
    queryKey: ["/api/staff"],
  });

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Shield className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground font-medium">Access Restricted</p>
        <p className="text-sm text-muted-foreground/70">Only administrators can manage staff users</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-3 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Staff Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {staff?.length ?? 0} team members · {staff?.filter(s => s.isActive).length ?? 0} active
          </p>
        </div>
        <Button
          onClick={() => { setEditUser(null); setDialogOpen(true); }}
          data-testid="button-new-staff"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Member
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {staff?.map((member) => {
            const initials = member.fullName.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
            return (
              <Card key={member.id} className="hover-elevate" data-testid={`card-staff-${member.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground text-sm">{member.fullName}</p>
                        {member.id === currentUser?.id && (
                          <Badge variant="outline" className="text-xs">You</Badge>
                        )}
                        {!member.isActive && (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">{member.username}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />{member.email}
                        </span>
                        {member.lastLoginAt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Last login {format(new Date(member.lastLoginAt), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs px-2 py-1 rounded-md font-medium ${ROLE_COLORS[member.role]}`}>
                        {ROLE_LABELS[member.role]}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => { setEditUser(member); setDialogOpen(true); }}
                        data-testid={`button-edit-staff-${member.id}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <StaffFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditUser(null); }}
        staffUser={editUser}
      />
    </div>
  );
}
