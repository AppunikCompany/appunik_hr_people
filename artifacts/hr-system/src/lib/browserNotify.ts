export async function showBrowserNotification(title: string, body: string): Promise<void> {
  if (!("Notification" in window)) return;
  let perm = Notification.permission;
  if (perm === "default") {
    perm = await Notification.requestPermission();
  }
  if (perm === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
}

export function requestNotificationPermission(): void {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
