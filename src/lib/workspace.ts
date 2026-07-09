export const workspaceKindValues = [
  "solo",
  "studio",
  "barbershop",
  "company",
] as const;

export type WorkspaceKind = (typeof workspaceKindValues)[number];

export const accountRoleValues = ["solo", "admin", "staff"] as const;

export type AccountRole = (typeof accountRoleValues)[number];

export const accountStatusValues = ["active", "disabled"] as const;

export type AccountStatus = (typeof accountStatusValues)[number];

export function normalizeWorkspaceKind(value: unknown): WorkspaceKind {
  switch (value) {
    case "studio":
    case "barbershop":
    case "company":
      return value;
    default:
      return "solo";
  }
}

export function normalizeAccountRole(value: unknown): AccountRole {
  switch (value) {
    case "admin":
    case "staff":
      return value;
    default:
      return "solo";
  }
}

export function normalizeAccountStatus(value: unknown): AccountStatus {
  switch (value) {
    case "disabled":
      return "disabled";
    default:
      return "active";
  }
}

export function isTeamWorkspaceKind(kind: WorkspaceKind) {
  return kind !== "solo";
}

export function canManageWorkspace(role: AccountRole) {
  return role === "admin";
}

export function getDefaultAccountRoute(input: {
  accountRole: AccountRole;
  workspaceKind: WorkspaceKind;
}) {
  if (input.accountRole === "admin" && isTeamWorkspaceKind(input.workspaceKind)) {
    return "/team";
  }

  return "/dashboard";
}

export function isAccountActive(status: AccountStatus) {
  return status === "active";
}

export function getWorkspaceKindLabel(kind: WorkspaceKind) {
  switch (kind) {
    case "studio":
      return "Студия";
    case "barbershop":
      return "Барбершоп";
    case "company":
      return "Компания";
    default:
      return "Одиночный мастер";
  }
}

export function getAccountRoleLabel(role: AccountRole) {
  switch (role) {
    case "admin":
      return "Администратор";
    case "staff":
      return "Сотрудник";
    default:
      return "Мастер";
  }
}

export function getAccountStatusLabel(status: AccountStatus) {
  return status === "disabled" ? "Отключен" : "Активен";
}
