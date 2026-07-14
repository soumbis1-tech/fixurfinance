import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Plus,
  ReceiptText,
  Upload,
  FileSpreadsheet,
  Repeat,
  Plane,
  CreditCard,
  BarChart3,
  Target,
  Settings,
  Wallet,
  Handshake,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/expenses/new", label: "Add Expense", icon: Plus },
  { to: "/expenses", label: "Expenses", icon: ReceiptText },
  { to: "/imports", label: "Imports", icon: Upload },
  { to: "/bank-statements", label: "Bank Statements", icon: FileSpreadsheet },
  { to: "/recurring", label: "Recurring", icon: Repeat },
  { to: "/trips", label: "Trips", icon: Plane },
  { to: "/credit-card", label: "Credit Card", icon: CreditCard },
  { to: "/accounts", label: "Payment Accounts", icon: Wallet },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/budgets", label: "Budgets", icon: Target },
  { to: "/settlement", label: "Expense Settlement", icon: Handshake },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map((it) => {
        const active = pathname === it.to || pathname.startsWith(it.to + "/");
        const Icon = it.icon;
        return (
          <li key={it.to}>
            <Link
              to={it.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{it.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SidebarBrand() {
  return (
    <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Wallet className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">Family Expense</div>
        <div className="text-xs text-muted-foreground">Tracker</div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <SidebarBrand />
      <nav className="flex-1 overflow-y-auto p-3">
        <SidebarNav />
      </nav>
      <div className="p-3 text-xs text-muted-foreground border-t border-sidebar-border">
        Family Expense Tracker
      </div>
    </aside>
  );
}
