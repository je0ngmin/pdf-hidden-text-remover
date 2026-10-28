import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Finding } from "../types";

GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfPreviewProps {
  bytes: Uint8Array;
  findings: Finding[];
  selected: Set<string>;
  activeFindingId: string | null;
  page: number;
  onPageChange: (page: number) => void;
  onFindingFocus: (id: string) => void;
}

interface OverlayRect {
  finding: Finding;
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function PdfPreview({
  bytes,
  findings,
  selected,
  activeFindingId,
  page,
  onPageChange,
  onFindingFocus,
}: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [overlays, setOverlays] = useState<OverlayRect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => setContainerWidth(container.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError(null);

    // PDF.js transfers this buffer to its worker, so keep the source bytes used for export intact.
    const loadingTask = getDocument({ data: bytes.slice() });
    loadingTask.promise
      .then((loadedDocument) => {
        if (disposed) {
          void loadedDocument.destroy();
          return;
        }
        setDocument(loadedDocument);
        onPageChange(Math.min(Math.max(page, 1), loadedDocument.numPages));
      })
      .catch((caught: unknown) => {
        if (!disposed) setError(caught instanceof Error ? caught.message : String(caught));
      });

    return () => {
      disposed = true;
      setDocument(null);
      void loadingTask.destroy();
    };
    // A new byte array means a new document. Page changes must not reload it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!document || !canvas || containerWidth <= 0) return;

    let disposed = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;
    setLoading(true);
    setError(null);

    void document
      .getPage(page)
      .then((pdfPage) => {
        if (disposed) return;
        const naturalViewport = pdfPage.getViewport({ scale: 1 });
        const availableWidth = Math.max(containerWidth - 2, 1);
        const viewport = pdfPage.getViewport({ scale: availableWidth / naturalViewport.width });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("PDF 미리보기에 필요한 Canvas를 만들 수 없습니다.");

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setViewportSize({ width: viewport.width, height: viewport.height });

        const pageOverlays = findings
          .filter((finding) => finding.page === page)
          .map((finding) => {
            const converted = viewport.convertToViewportRectangle(finding.evidence.boundingBox);
            const rawLeft = Math.min(converted[0], converted[2]);
            const rawTop = Math.min(converted[1], converted[3]);
            const rawRight = Math.max(converted[0], converted[2]);
            const rawBottom = Math.max(converted[1], converted[3]);
            const left = Math.max(0, rawLeft);
            const top = Math.max(0, rawTop);
            const right = Math.min(viewport.width, rawRight);
            const bottom = Math.min(viewport.height, rawBottom);
            return {
              finding,
              left,
              top,
              width: Math.max(0, right - left),
              height: Math.max(0, bottom - top),
            };
          })
          .filter((overlay) => overlay.width > 0 && overlay.height > 0);
        setOverlays(pageOverlays);

        renderTask = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        return renderTask.promise;
      })
      .then(() => {
        if (!disposed) setLoading(false);
      })
      .catch((caught: unknown) => {
        if (disposed || (caught instanceof Error && caught.name === "RenderingCancelledException")) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setLoading(false);
      });

    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [containerWidth, document, findings, page]);

  const pageCount = document?.numPages ?? 0;

  return (
    <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:sticky lg:top-5">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">미리보기</h2>
          <p className="mt-0.5 text-xs text-slate-400">감지된 텍스트를 빨간 박스로 칠했습니다.</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="grid size-6 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:text-slate-300"
            disabled={!document || page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="이전 페이지"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="px-1 text-center text-sm text-slate-700">
            {pageCount ? `${page} / ${pageCount}` : "- / -"}
          </span>
          <button
            className="grid size-6 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:text-slate-300"
            disabled={!document || page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="다음 페이지"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <div className="bg-slate-100 p-3">
        <div ref={containerRef} className="relative min-h-80 w-full overflow-hidden bg-white shadow-sm">
          <div className="relative" style={{ width: viewportSize.width, height: viewportSize.height }}>
            <canvas ref={canvasRef} className="block" />
            <div className="pointer-events-none absolute inset-0" aria-label="감지 영역 표시">
              {overlays.map(({ finding, ...rect }) => {
                const isActive = finding.id === activeFindingId;
                const isSelected = selected.has(finding.id);
                return (
                  <button
                    key={finding.id}
                    type="button"
                    className={`pointer-events-auto absolute border border-red-600 transition-colors ${
                      isSelected ? "bg-red-500/35" : "border-dashed bg-red-500/15"
                    } ${isActive ? "z-10 ring-2 ring-red-600 ring-offset-1" : ""}`}
                    style={rect}
                    title={finding.text}
                    aria-label={`${finding.text} 위치`}
                    onClick={() => onFindingFocus(finding.id)}
                  />
                );
              })}
            </div>
          </div>

          {loading && (
            <div className="absolute inset-0 grid min-h-80 place-items-center bg-white/80 text-sm text-slate-500">
              <span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={17} /> 페이지 렌더링 중</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 grid min-h-80 place-items-center bg-white px-6 text-center text-sm leading-6 text-red-700">
              PDF 미리보기를 표시하지 못했습니다.<br />{error}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
