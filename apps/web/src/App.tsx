import { ChangeEvent, DragEvent, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  FileCheck2,
  FileSearch,
  Info,
  LoaderCircle,
  LocateFixed,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { logAnalyticsEvent } from "./lib/analytics";
import { cleanPdf, scanPdf } from "./lib/pdf-engine";
import type { DetectionKind, Finding, ScanReport, Severity } from "./types";

const PdfPreview = lazy(() => import("./components/PdfPreview"));

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const REVIEW_HISTORY_KEY = "pdfHiddenTextRemoverReview";

const categoryLabels: Record<DetectionKind, string> = {
  invisible_render_mode: "비표시 렌더링",
  low_opacity: "낮은 불투명도",
  tiny_text: "초소형 텍스트",
  low_contrast: "낮은 대비",
  outside_page: "페이지 바깥",
};

type Stage = "idle" | "scanning" | "review" | "exporting";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const operationIdRef = useRef(0);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | DetectionKind>("all");

  const filteredFindings = useMemo(() => {
    if (!report) return [];
    if (filter === "all") return report.findings;
    return report.findings.filter((finding) => finding.categories.includes(filter));
  }, [filter, report]);

  const visibleSelected = filteredFindings.filter((finding) => selected.has(finding.id)).length;

  useEffect(() => {
    function onPopState() {
      reset();
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function analyze(nextFile: File) {
    const operationId = ++operationIdRef.current;
    setError(null);
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF 파일만 검사할 수 있습니다.");
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setError("현재 버전은 50MB 이하 PDF를 지원합니다.");
      return;
    }

    logAnalyticsEvent("pdf_upload");
    scanAbortControllerRef.current?.abort();
    const scanAbortController = new AbortController();
    scanAbortControllerRef.current = scanAbortController;
    setFile(nextFile);
    setStage("scanning");
    try {
      const result = await scanPdf(nextFile, scanAbortController.signal);
      if (operationId !== operationIdRef.current) return;
      setSourceBytes(result.bytes);
      setReport(result.report);
      setSelected(new Set(result.report.findings.map((finding) => finding.id)));
      const currentState = window.history.state;
      const nextState = currentState && typeof currentState === "object" ? { ...currentState } : {};
      window.history.pushState(
        { ...nextState, [REVIEW_HISTORY_KEY]: true },
        "",
        `${window.location.pathname}${window.location.search}`,
      );
      setStage("review");
    } catch (caught) {
      if (operationId !== operationIdRef.current) return;
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(
        message.includes("Failed to fetch") || message.includes("import")
          ? "WASM 엔진을 불러오지 못했습니다. 먼저 npm run wasm:dev를 실행해 주세요."
          : message,
      );
      setStage("idle");
    } finally {
      if (scanAbortControllerRef.current === scanAbortController) {
        scanAbortControllerRef.current = null;
      }
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) void analyze(nextFile);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) void analyze(nextFile);
  }

  function toggleFinding(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    const allVisibleSelected = visibleSelected === filteredFindings.length;
    setSelected((current) => {
      const next = new Set(current);
      for (const finding of filteredFindings) {
        if (allVisibleSelected) next.delete(finding.id);
        else next.add(finding.id);
      }
      return next;
    });
  }

  async function exportPdf() {
    if (!sourceBytes || !file) return;
    logAnalyticsEvent("pdf_export");
    const operationId = operationIdRef.current;
    setStage("exporting");
    setError(null);
    try {
      const output = await cleanPdf(sourceBytes, [...selected]);
      if (operationId !== operationIdRef.current) return;
      const stem = file.name.replace(/\.pdf$/i, "");
      downloadBytes(output, `${stem}-clean.pdf`);
      setStage("review");
    } catch (caught) {
      if (operationId !== operationIdRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setStage("review");
    }
  }

  function reset() {
    scanAbortControllerRef.current?.abort();
    scanAbortControllerRef.current = null;
    operationIdRef.current += 1;
    setStage("idle");
    setFile(null);
    setReport(null);
    setSourceBytes(null);
    setSelected(new Set());
    setDragging(false);
    setFilter("all");
    setError(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }

  function cancelScan() {
    logAnalyticsEvent("pdf_scan_cancel");
    reset();
  }

  function returnHome() {
    if (window.history.state?.[REVIEW_HISTORY_KEY]) {
      window.history.back();
      return;
    }
    reset();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-950 antialiased">
      <header className="bg-white">
        <div className="mx-auto flex h-16 w-full max-w-240 items-center justify-between px-12">
          <button className="flex items-center gap-4 text-slate-950" type="button" onClick={returnHome} aria-label="첫 화면으로 돌아가기">
            <span className="text-[17px] font-normal">pdf-hidden-text-remover</span>
          </button>
          <a
            href="https://github.com/je0ngmin/pdf-hidden-text-remover"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub로 이동"
          >
            <img src={"./gh.svg"} width="30" height="30" alt="" />
          </a>
        </div>
      </header>

      <main id="top" className="flex-1">
        {stage === "idle" || stage === "scanning" ? (
          <section className="flex flex-col w-full gap-12 px-5 py-5">
            <div className="mx-auto max-w-5xl w-full">
              <div className="w-full">
                <div className="p-4">
                  <div
                    className={`flex min-h-60 flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors ${dragging
                        ? "border-blue-500 bg-blue-50"
                        : stage === "scanning"
                          ? "border-blue-300 bg-blue-50/60"
                          : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40"
                      }`}
                    onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                  >
                    {stage === "scanning" ? (
                      <>
                        <span className="grid size-14 place-items-center rounded-xl bg-blue-600 text-white">
                          <LoaderCircle className="animate-spin" size={27} />
                        </span>
                        <h2 className="mt-6 text-xl font-semibold text-slate-950">페이지를 분석하고 있습니다</h2>
                        <p className="mt-2 max-w-sm break-all text-sm leading-6 text-slate-600">
                          {file?.name}<br />텍스트 렌더링 상태와 배경 대비를 확인합니다.
                        </p>
                        <div className="mt-7 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-blue-100">
                          <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600" />
                        </div>
                        <button
                          className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                          type="button"
                          onClick={cancelScan}
                        >
                          <X size={16} /> 검사 취소
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="grid size-14 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 ">
                          <Upload size={26} />
                        </span>
                        <h2 className="mt-6 text-xl font-semibold text-slate-950">이곳에 검사할 PDF를 놓으세요</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-600">이 영역으로 드래그하거나<br />아래 버튼에서 파일을 선택하세요.</p>
                        <button
                          className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white  transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                          onClick={() => inputRef.current?.click()}
                        >
                          <Upload size={17} /> PDF 선택
                        </button>
                        <div className="flex items-center gap-2 text-sm leading-normal mt-5 text-slate-600">
                          <Info className="shrink-0 text-slate-400" size={16} />
                          업로드한 파일은 서버에 전송되지 않으며, 웹 브라우저 내부에서만 처리됩니다.
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="max-w-240 mx-auto w-full px-12">
              <ReadmeContent />
            </div>
          </section>
        ) : report && file && sourceBytes ? (
          <ReviewWorkspace
            file={file}
            sourceBytes={sourceBytes}
            report={report}
            stage={stage}
            selected={selected}
            filter={filter}
            filteredFindings={filteredFindings}
            visibleSelected={visibleSelected}
            onReset={returnHome}
            onExport={() => void exportPdf()}
            onFilter={setFilter}
            onToggleFinding={toggleFinding}
            onToggleVisible={toggleVisible}
          />
        ) : null}

        {error && (
          <div className="fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center gap-3 rounded-xl border border-blue-200 bg-white p-4 text-sm text-slate-700 shadow-2xl" role="alert">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><AlertTriangle size={17} /></span>
            <span className="flex-1">{error}</span>
            <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setError(null)} title="오류 닫기">
              <X size={17} />
            </button>
          </div>
        )}
      </main>

      <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onFileChange} />
    </div>
  );
}

function ReadmeContent() {
  const [markdown, setMarkdown] = useState("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${import.meta.env.BASE_URL}README.md`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`README 요청 실패: ${response.status}`);
        return response.text();
      })
      .then(setMarkdown)
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setLoadError(true);
      });

    return () => controller.abort();
  }, []);

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-240 pb-10 text-sm text-slate-500">
        README.md를 불러오지 못했습니다.
      </div>
    );
  }

  if (!markdown) {
    return (
      <div className="mx-auto flex w-full max-w-240 items-center gap-2 pb-10 text-sm text-slate-500">
        <LoaderCircle className="animate-spin" size={16} /> 문서를 불러오는 중입니다.
      </div>
    );
  }

  return (
    <article className="markdown-body mx-auto w-full max-w-240 pb-10">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

interface ReviewWorkspaceProps {
  file: File;
  sourceBytes: Uint8Array;
  report: ScanReport;
  stage: Stage;
  selected: Set<string>;
  filter: "all" | DetectionKind;
  filteredFindings: Finding[];
  visibleSelected: number;
  onReset: () => void;
  onExport: () => void;
  onFilter: (filter: "all" | DetectionKind) => void;
  onToggleFinding: (id: string) => void;
  onToggleVisible: () => void;
}

function ReviewWorkspace({
  file,
  sourceBytes,
  report,
  stage,
  selected,
  filter,
  filteredFindings,
  visibleSelected,
  onReset,
  onExport,
  onFilter,
  onToggleFinding,
  onToggleVisible,
}: ReviewWorkspaceProps) {
  const [activeFindingId, setActiveFindingId] = useState<string | null>(report.findings[0]?.id ?? null);
  const [previewPage, setPreviewPage] = useState(report.findings[0]?.page ?? 1);
  const nothingSelected = selected.size === 0;
  const everythingSelected = report.findings.length > 0 && selected.size === report.findings.length;
  const exportLabel = nothingSelected
    ? "PDF 내보내기"
    : everythingSelected
      ? "모두 제거 후 PDF 내보내기"
      : `${selected.size}개 제거 후 PDF 내보내기`;

  function focusFinding(id: string) {
    const finding = report.findings.find((item) => item.id === id);
    if (!finding) return;
    setActiveFindingId(id);
    setPreviewPage(finding.page);
  }

  return (
    <section className="mx-auto w-full max-w-[1600px] px-5 py-5 sm:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between max-w-240 mx-auto w-full px-12">
        <div className="flex items-start gap-4">
          <div>
            <button
              className="mt-1 text-sm flex h-9 px-3 gap-1.5 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600  hover:border-slate-300 hover:text-slate-950"
              onClick={onReset} title="다른 PDF 파일 검사하기"
            >
              <ArrowLeft size={14} aria-hidden='true' />
              <span>다른 PDF 파일 검사하기</span>
            </button>
            <h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl leading-normal">{file.name}</h1>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-3">
              <SummaryStat value={report.summary.total} label="전체 의심 항목" />
              <SummaryStat value={report.summary.high} label="높은 의심" />
              <SummaryStat value={report.summary.medium} label="검토 필요" />
              <SummaryStat value={selected.size} label="제거 예정" primary />
            </div>
            <p className="mt-2.5 break-all text-sm text-slate-400">{formatBytes(file.size)} / {report.pageCount}페이지</p>
          </div>
        </div>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 self-stretch rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 lg:self-auto shrink-0"
          onClick={onExport}
          disabled={stage === "exporting" || nothingSelected}
        >
          {stage === "exporting" ? <LoaderCircle className="animate-spin" size={18} /> : <Download size={18} />}
          {exportLabel}
        </button>
      </div>

      {report.warnings.length > 0 && (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
          <AlertTriangle className="mt-0.5 shrink-0 text-blue-600" size={18} />
          <span>{report.warnings.join(" ")}</span>
        </div>
      )}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[190px_minmax(320px,1fr)_minmax(300px,0.9fr)]">
        <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:sticky lg:top-5">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">감지 유형</div>
          <div className="p-2 flex flex-col gap-1">
            <FilterButton active={filter === "all"} onClick={() => onFilter("all")} label="전체" count={report.findings.length} />
            {(Object.keys(categoryLabels) as DetectionKind[]).map((kind) => {
              const count = report.findings.filter((finding) => finding.categories.includes(kind)).length;
              return count > 0 ? (
                <FilterButton key={kind} active={filter === kind} onClick={() => onFilter(kind)} label={categoryLabels[kind]} count={count} />
              ) : null;
            })}
          </div>
        </aside>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white ">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">{filter === "all" ? "모든 의심 항목" : categoryLabels[filter]}</h2>
            </div>
            <button className="flex items-center gap-2 self-start text-sm text-slate-600 hover:text-slate-950 sm:self-auto" onClick={onToggleVisible}>
              <CheckBox checked={visibleSelected === filteredFindings.length && filteredFindings.length > 0} />
              전체 선택
            </button>
          </div>

          {filteredFindings.length === 0 ? (
            <div className="grid min-h-64 place-items-center px-6 text-center">
              <div><ShieldCheck className="mx-auto text-gray-600" size={34} /><h3 className="mt-3 font-semibold text-slate-900">이 유형의 항목이 없습니다</h3></div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredFindings.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  selected={selected.has(finding.id)}
                  active={activeFindingId === finding.id}
                  onToggle={() => onToggleFinding(finding.id)}
                  onFocus={() => focusFinding(finding.id)}
                />
              ))}
            </div>
          )}
        </div>

        <Suspense
          fallback={(
            <div className="grid min-h-50 place-items-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
              <span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={17} /> 미리보기 준비 중</span>
            </div>
          )}
        >
          <PdfPreview
            bytes={sourceBytes}
            findings={report.findings}
            selected={selected}
            activeFindingId={activeFindingId}
            page={previewPage}
            onPageChange={setPreviewPage}
            onFindingFocus={focusFinding}
          />
        </Suspense>
      </div>
    </section>
  );
}

function SummaryStat({ value, label, primary = false }: { value: number; label: string; primary?: boolean }) {
  return (
    <p className="flex items-baseline gap-2">
      <strong className={`text-xl font-bold ${primary ? "text-blue-600" : "text-slate-950"}`}>{value}</strong>
      <span className="text-sm text-slate-500">{label}</span>
    </p>
  );
}

function FilterButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${active ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`} onClick={onClick}>
      <span>{label}</span><span className={active ? "text-blue-600" : "text-slate-400"}>{count}</span>
    </button>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span className={`grid size-5 shrink-0 place-items-center rounded border ${checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>
      {checked && <Check size={13} strokeWidth={3} />}
    </span>
  );
}

function FindingRow({
  finding,
  selected,
  active,
  onToggle,
  onFocus,
}: {
  finding: Finding;
  selected: boolean;
  active: boolean;
  onToggle: () => void;
  onFocus: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className={`grid grid-cols-[24px_minmax(0,1fr)] gap-3 px-5 py-5 transition-colors sm:gap-4 sm:px-6 ${selected ? "bg-blue-50/50" : "bg-white"}`}>
      <button className="mt-0.5" onClick={onToggle} aria-label={`${finding.text} 제거 ${selected ? "해제" : "선택"}`}>
        <CheckBox checked={selected} />
      </button>
      <div className="min-w-0">
        <blockquote className="wrap-break-word border-l-2 border-blue-500 pl-2.5 font-mono text-sm leading-normal text-slate-900">
          {finding.text}
        </blockquote>

        <div className="mt-3 flex flex-wrap gap-2">
          {finding.categories.map((category) => (
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600" key={category}>{categoryLabels[category]}</span>
          ))}
        </div>

        <button className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-700" onClick={() => setExpanded((value) => !value)}>
          {finding.reasons.length}개의 감지 근거
          <ChevronDown className={`transition-transform ${expanded ? "rotate-180" : ""}`} size={15} />
        </button>

        {expanded && (
          <div className="mt-4 border-l-2 border-slate-200 bg-slate-50 px-4 py-3">
            <ul className="space-y-1.5 text-sm leading-6 text-slate-700">
              {finding.reasons.map((reason) => <li className="flex gap-2" key={reason}><span className="text-blue-600">•</span><span>{reason}</span></li>)}
            </ul>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-200 pt-4 text-xs sm:grid-cols-4">
              <Evidence label="글자 크기" value={`${finding.evidence.fontSize}pt`} />
              <Evidence label="명암비" value={`${finding.evidence.contrastRatio}:1`} />
              <Evidence label="불투명도" value={`${Math.round(finding.evidence.opacity * 100)}%`} />
              <Evidence label="좌표" value={finding.evidence.position.join(", ")} />
            </dl>
          </div>
        )}
      </div>
    </article>
  );
}

function Evidence({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-900">{value}</dd></div>;
}

export default App;
