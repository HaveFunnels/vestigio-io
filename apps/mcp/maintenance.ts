// ──────────────────────────────────────────────
// Maintenance Mode
//
// Admin can mark orgs or environments as under maintenance.
// MCP calls are blocked. UI shows maintenance banner.
// ──────────────────────────────────────────────

const maintenanceOrgs = new Set<string>();
const maintenanceEnvs = new Set<string>();

export function setOrgMaintenance(orgId: string, enabled: boolean): void {
  if (enabled) maintenanceOrgs.add(orgId);
  else maintenanceOrgs.delete(orgId);
}

export function setEnvMaintenance(envId: string, enabled: boolean): void {
  if (enabled) maintenanceEnvs.add(envId);
  else maintenanceEnvs.delete(envId);
}

export function isOrgInMaintenance(orgId: string): boolean {
  return maintenanceOrgs.has(orgId);
}

export function isEnvInMaintenance(envId: string): boolean {
  return maintenanceEnvs.has(envId);
}

export function isInMaintenance(orgId: string, envId?: string): boolean {
  if (maintenanceOrgs.has(orgId)) return true;
  if (envId && maintenanceEnvs.has(envId)) return true;
  return false;
}

export function getMaintenanceOrgs(): string[] {
  return [...maintenanceOrgs];
}

export function getMaintenanceEnvs(): string[] {
  return [...maintenanceEnvs];
}

export function clearAllMaintenance(): void {
  maintenanceOrgs.clear();
  maintenanceEnvs.clear();
}
