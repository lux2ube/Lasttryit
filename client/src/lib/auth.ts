export type StaffRole = "admin" | "operations_manager" | "finance_officer" | "compliance_officer" | "customer_support";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: StaffRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Administrator",
  operations_manager: "Operations Manager",
  finance_officer: "Finance Officer",
  compliance_officer: "Compliance Officer",
  customer_support: "Customer Support",
};

export const ROLE_COLORS: Record<StaffRole, string> = {
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  operations_manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  finance_officer: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  compliance_officer: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  customer_support: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

export function canAccess(userRole: StaffRole, allowedRoles: StaffRole[]): boolean {
  return allowedRoles.includes(userRole);
}
