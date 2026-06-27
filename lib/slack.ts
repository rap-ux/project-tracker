// Minimal Slack notifier via an Incoming Webhook. Inert until SLACK_WEBHOOK_URL
// is set, so it's safe to call from anywhere. Never throws.
export function slackConfigured(): boolean {
  return !!process.env.SLACK_WEBHOOK_URL;
}

export function appUrl(path = ""): string {
  const base = process.env.APP_URL ?? "https://twe-switchboard.up.railway.app";
  return base.replace(/\/$/, "") + path;
}

export async function notifySlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        text,
        username: "Switchboard",
        icon_url: appUrl("/switchboard-icon.png"),
      }),
    });
  } catch {
    // Notifications are best-effort; never let them break the request.
  }
}
