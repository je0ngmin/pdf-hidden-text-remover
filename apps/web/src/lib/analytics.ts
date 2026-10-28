export type AnalyticsEvent = "pdf_upload" | "pdf_scan_cancel" | "pdf_export";

declare global {
  interface Window {
    gtag?: (command: "event", eventName: AnalyticsEvent) => void;
  }
}

export function logAnalyticsEvent(eventName: AnalyticsEvent) {
  window.gtag?.("event", eventName);
}
