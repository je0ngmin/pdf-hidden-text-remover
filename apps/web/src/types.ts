export type Severity = "low" | "medium" | "high";

export type DetectionKind =
  | "invisible_render_mode"
  | "low_opacity"
  | "tiny_text"
  | "low_contrast"
  | "outside_page";

export interface Evidence {
  fontSize: number;
  opacity: number;
  contrastRatio: number;
  textColor: [number, number, number];
  backgroundColor: [number, number, number];
  position: [number, number];
  renderMode: number;
}

export interface Finding {
  id: string;
  page: number;
  text: string;
  severity: Severity;
  categories: DetectionKind[];
  reasons: string[];
  evidence: Evidence;
}

export interface ScanReport {
  pageCount: number;
  findings: Finding[];
  warnings: string[];
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
}

