import type { ScanReport } from "../types";
import initWasm, {
  clean_pdf as cleanPdfWasm,
  scan_pdf as scanPdfWasm,
} from "../generated/wasm/pdf_hidden_text_remover_wasm.js";

let initPromise: Promise<unknown> | undefined;

function ensureInitialized() {
  initPromise ??= initWasm();
  return initPromise;
}

export async function scanPdf(file: File): Promise<{ bytes: Uint8Array; report: ScanReport }> {
  await ensureInitialized();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const report = scanPdfWasm(bytes) as ScanReport;
  return { bytes, report };
}

export async function cleanPdf(bytes: Uint8Array, ids: string[]): Promise<Uint8Array> {
  await ensureInitialized();
  return cleanPdfWasm(bytes, ids);
}

