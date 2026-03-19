import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Users,
  FileText,
  ShieldAlert,
  Settings,
  ClipboardList,
  Building2,
  LogOut,
  UserCog,
  Tag,
  BarChart2,
  Webhook,
  MessageCircle,
  BookOpen,
  CalendarRange,
  TrendingUp,
  List,
  Network,
  Wallet,
  AlertTriangle,
  Scale,
  PieChart,
  LineChart,
  BookUser,
  Layers,
  Globe,
  ChevronDown,
  DollarSign,
  MessageSquare,
  Crown,
  SendHorizontal,
  Landmark,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { ROLE_LABELS } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface NavLeaf   { title: string; url: string; icon: React.ElementType; badgeKey?: string }
interface NavParent { title: string; icon: React.ElementType; children: NavLeaf[] }
type NavItem = NavLeaf | NavParent;

interface NavGroup { group: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    group: "Operations",
    items: [
      { title: "Dashboard",    url: "/",            icon: LayoutDashboard },
      { title: "Records",      url: "/records",     icon: FileText },
      { title: "Send Crypto",  url: "/send-crypto", icon: SendHorizontal },
      { title: "Kuraimi ePay", url: "/kuraimi",     icon: Landmark },
    ],
  },
  {
    group: "Customers",
    items: [
      { title: "Customers",    url: "/customers",         icon: Users },
      { title: "Follow-ups",   url: "/customers/follow-ups", icon: MessageSquare },
      { title: "Groups",       url: "/customers/groups",     icon: Crown },
      { title: "Labels",       url: "/labels",               icon: Tag },
    ],
  },
  {
    group: "Accounting",
    items: [
      {
        title: "Books", icon: BookOpen,
        children: [
          { title: "Chart of Accounts", url: "/accounting/chart-of-accounts", icon: List },
          { title: "Journal Entries",   url: "/accounting/journal-entries",   icon: BookOpen },
          { title: "Periods",           url: "/accounting/periods",           icon: CalendarRange },
        ],
      },
      {
        title: "Rates & Currencies", icon: DollarSign,
        children: [
          { title: "Currencies",     url: "/accounting/currencies",     icon: DollarSign },
          { title: "Exchange Rates", url: "/accounting/exchange-rates", icon: TrendingUp },
        ],
      },
      {
        title: "Providers & Networks", icon: Network,
        children: [
          { title: "Providers",   url: "/accounting/providers",   icon: Network },
          { title: "Networks",    url: "/accounting/networks",    icon: Globe },
          { title: "Wallet Sync", url: "/accounting/wallet-sync", icon: Wallet },
        ],
      },
    ],
  },
  {
    group: "Reports",
    items: [
      {
        title: "Financial Reports", icon: BarChart2,
        children: [
          { title: "Overview",          url: "/reports",                   icon: BarChart2 },
          { title: "Trial Balance",     url: "/reports/trial-balance",     icon: Scale },
          { title: "Balance Sheet",     url: "/reports/balance-sheet",     icon: PieChart },
          { title: "Income Statement",  url: "/reports/income-statement",  icon: LineChart },
          { title: "Customer Ledger",   url: "/reports/customer-ledger",   icon: BookUser },
        ],
      },
    ],
  },
  {
    group: "Compliance",
    items: [
      {
        title: "AML / KYC", icon: ShieldAlert,
        children: [
          { title: "Alerts",     url: "/compliance/alerts", icon: AlertTriangle, badgeKey: "criticals" },
          { title: "Blacklist",  url: "/blacklist",         icon: ShieldAlert },
          { title: "Audit Log",  url: "/audit-log",         icon: ClipboardList },
        ],
      },
    ],
  },
  {
    group: "Administration",
    items: [
      {
        title: "System", icon: Settings,
        children: [
          { title: "Staff Users",      url: "/staff",            icon: UserCog },
          { title: "System Variables", url: "/system-variables", icon: Layers },
          { title: "Settings",         url: "/settings",         icon: Settings },
          { title: "SMS Webhooks",      url: "/webhooks",         icon: Webhook },
          { title: "WhatsApp",          url: "/whatsapp",         icon: MessageCircle },
        ],
      },
    ],
  },
];

function isLeaf(item: NavItem): item is NavLeaf {
  return "url" in item;
}

interface AlertCount { critical: number; warning: number; total: number }

function CollapsibleGroup({
  item,
  alertCount,
}: {
  item: NavParent;
  alertCount?: AlertCount;
}) {
  const [location] = useLocation();
  const childUrls = item.children.map(c => c.url);
  const anyChildActive = childUrls.some(
    url => location === url || (url !== "/" && location.startsWith(url))
  );
  const [open, setOpen] = useState(anyChildActive);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            className="gap-3 h-9 px-3 w-full"
            data-testid={`nav-group-${item.title.toLowerCase().replace(/\s/g, '-')}`}
            isActive={anyChildActive}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            <span className="text-sm flex-1 text-left">{item.title}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children.map(child => {
              const isActive = location === child.url || (child.url !== "/" && location.startsWith(child.url));
              const badgeCount = child.badgeKey === "criticals" ? (alertCount?.critical ?? 0) : 0;
              return (
                <SidebarMenuSubItem key={child.title}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActive}
                    data-testid={`nav-${child.title.toLowerCase().replace(/\s/g, '-')}`}
                  >
                    <Link href={child.url}>
                      <child.icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="flex-1">{child.title}</span>
                      {badgeCount > 0 && (
                        <Badge className="ml-auto h-4 min-w-4 px-1 text-[10px] bg-red-500 text-white hover:bg-red-500 rounded-full leading-none flex items-center justify-center">
                          {badgeCount}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const { data: alertCount } = useQuery<AlertCount>({
    queryKey: ["/api/compliance/alerts/count"],
    refetchInterval: 60_000,
  });

  const initials = user?.fullName
    ?.split(" ")
    .slice(0, 2)
    .map(n => n[0])
    .join("")
    .toUpperCase() ?? "?";

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sidebar-foreground text-sm leading-tight">Coin Cash</span>
            <span className="text-xs text-muted-foreground leading-tight truncate">Operations System</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.group} className="px-2">
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
              {group.group}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  if (isLeaf(item)) {
                    const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className="gap-3 h-9 px-3"
                          data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, '-')}`}
                        >
                          <Link href={item.url}>
                            <item.icon className="w-4 h-4 shrink-0" />
                            <span className="text-sm flex-1">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  return (
                    <CollapsibleGroup key={item.title} item={item} alertCount={alertCount} />
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        {user && (
          <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold text-sidebar-foreground truncate">{user.fullName}</span>
              <span className="text-xs text-muted-foreground truncate">{ROLE_LABELS[user.role]}</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={logout}
              className="shrink-0 h-7 w-7"
              data-testid="button-logout"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
