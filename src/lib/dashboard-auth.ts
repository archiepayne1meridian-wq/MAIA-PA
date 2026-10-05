// Auth gate removed — dashboard is open. Cron routes retain their own
// independent Bearer auth checks.
export async function requireDashboardAuth(): Promise<boolean> {
  return true
}
