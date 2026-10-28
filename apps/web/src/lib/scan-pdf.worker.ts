/// <reference lib="webworker" />

import initWasm, { scan_pdf as scanPdfWasm } from "../generated/wasm/pdf_hidden_text_remover_wasm.js";
import type { ScanReport } from "../types";

declare const self: DedicatedWorkerGlobalScope;

interface ScanRequest {
  bytes: ArrayBuffer;
}

type ScanResponse =
  | { ok: true; bytes: ArrayBuffer; report: ScanReport }
  | { ok: false; error: string };

self.onmessage = async (event: MessageEvent<ScanRequest>) => {
  try {
    await initWasm();
    const bytes = new Uint8Array(event.data.bytes);
    const report = scanPdfWasm(bytes) as ScanReport;
    const response: ScanResponse = { ok: true, bytes: bytes.buffer, report };
    self.postMessage(response, [bytes.buffer]);
  } catch (caught) {
    const response: ScanResponse = {
      ok: false,
      error: caught instanceof Error ? caught.message : String(caught),
    };
    self.postMessage(response);
  }
};

export {};
