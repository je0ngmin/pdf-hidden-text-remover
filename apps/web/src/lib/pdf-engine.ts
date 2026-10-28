import type { ScanReport } from "../types";
import initWasm, {
  clean_pdf as cleanPdfWasm,
} from "../generated/wasm/pdf_hidden_text_remover_wasm.js";

let initPromise: Promise<unknown> | undefined;

function ensureInitialized() {
  initPromise ??= initWasm();
  return initPromise;
}

type ScanWorkerResponse =
  | { ok: true; bytes: ArrayBuffer; report: ScanReport }
  | { ok: false; error: string };

function abortError() {
  return new DOMException("PDF 검사가 취소되었습니다.", "AbortError");
}

export async function scanPdf(
  file: File,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; report: ScanReport }> {
  const buffer = await file.arrayBuffer();
  if (signal?.aborted) throw abortError();

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./scan-pdf.worker.ts", import.meta.url), { type: "module" });

    function finish() {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    }

    function onAbort() {
      finish();
      reject(abortError());
    }

    worker.onmessage = (event: MessageEvent<ScanWorkerResponse>) => {
      finish();
      if (!event.data.ok) {
        reject(new Error(event.data.error));
        return;
      }
      resolve({ bytes: new Uint8Array(event.data.bytes), report: event.data.report });
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "PDF 검사 Worker를 실행하지 못했습니다."));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ bytes: buffer }, [buffer]);
  });
}

export async function cleanPdf(bytes: Uint8Array, ids: string[]): Promise<Uint8Array> {
  await ensureInitialized();
  return cleanPdfWasm(bytes, ids);
}

