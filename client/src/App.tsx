import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Customers from "@/pages/customers";
import Blacklist from "@/pages/blacklist";
import Records from "@/pages/records";
import Labels from "@/pages/labels";
import Staff from "@/pages/staff";
import SettingsPage from "@/pages/settings";
import AuditLog from "@/pages/audit-log";
import Reports from "@/pages/reports";
import Webhooks from "@/pages/webhooks";
import WhatsApp from "@/pages/whatsapp";
import ChartOfAccounts from "@/pages/accounting/chart-of-accounts";
import JournalEntries from "@/pages/accounting/journal-entries";
import AccountingPeriods from "@/pages/accounting/accounting-periods";
import ExchangeRates from "@/pages/accounting/exchange-rates";
import Providers from "@/pages/accounting/providers";
import WalletSync from "@/pages/accounting/wallet-sync";
import Networks from "@/pages/accounting/networks";
import SystemVariables from "@/pages/system-variables";
import ComplianceAlerts from "@/pages/compliance/alerts";
import TrialBalance from "@/pages/reports/trial-balance";
import BalanceSheet from "@/pages/reports/balance-sheet";
import IncomeStatement from "@/pages/reports/income-statement";
import CustomerLedger from "@/pages/reports/customer-ledger";
import Currencies from "@/pages/accounting/currencies";
import CustomerGroups from "@/pages/customers/customer-groups";
import FollowUps from "@/pages/customers/follow-ups";
import SendCrypto from "@/pages/send-crypto";
import KuraimiPage from "@/pages/kuraimi";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </Button>
  );
}

function AppLayout() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center animate-pulse">
            <span className="text-primary-foreground text-sm font-bold">F</span>
          </div>
          <p className="text-sm text-muted-foreground">Loading FOMS...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const sidebarStyle = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-50 h-12">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="h-8 w-8" />
              <div className="h-4 w-px bg-border" />
              <nav className="text-xs text-muted-foreground hidden sm:block">
                Financial Operations Management System
              </nav>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-hidden">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/customers" component={Customers} />
              <Route path="/records" component={Records} />
              <Route path="/send-crypto" component={SendCrypto} />
              <Route path="/labels" component={Labels} />
              <Route path="/blacklist" component={Blacklist} />
              <Route path="/audit-log" component={AuditLog} />
              <Route path="/reports" component={Reports} />
              <Route path="/webhooks" component={Webhooks} />
              <Route path="/whatsapp" component={WhatsApp} />
              <Route path="/accounting/chart-of-accounts" component={ChartOfAccounts} />
              <Route path="/accounting/journal-entries" component={JournalEntries} />
              <Route path="/accounting/periods" component={AccountingPeriods} />
              <Route path="/accounting/exchange-rates" component={ExchangeRates} />
              <Route path="/accounting/networks" component={Networks} />
              <Route path="/accounting/providers" component={Providers} />
              <Route path="/accounting/wallet-sync" component={WalletSync} />
              <Route path="/accounting/currencies" component={Currencies} />
              <Route path="/customers/groups" component={CustomerGroups} />
              <Route path="/customers/follow-ups" component={FollowUps} />
              <Route path="/compliance/alerts" component={ComplianceAlerts} />
              <Route path="/reports/trial-balance" component={TrialBalance} />
              <Route path="/reports/balance-sheet" component={BalanceSheet} />
              <Route path="/reports/income-statement" component={IncomeStatement} />
              <Route path="/reports/customer-ledger" component={CustomerLedger} />
              <Route path="/kuraimi" component={KuraimiPage} />
              <Route path="/staff" component={Staff} />
              <Route path="/settings" component={SettingsPage} />
              <Route path="/system-variables" component={SystemVariables} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <AppLayout />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
