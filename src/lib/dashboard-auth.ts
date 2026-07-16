// Auth gate removed — dashboard is open. Cron routes (Bearer) and Slack
// routes (HMAC) retain their own independent auth checks.
export async function requireDashboardAuth(): Promise<boolean> {
  return true
}
