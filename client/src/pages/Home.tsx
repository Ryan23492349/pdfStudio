/**
 * 藍圖工作台：移除全螢幕預覽與文字編輯功能，保留核心的 PDF 分割、重排與匯出流程。
 */
import { toast } from "sonner";
import {
  Check,
  Copy,
  Download,
  Eraser,
  FileText,
  Grid2X2,
  GripVertical,
  List,
  Loader2,
  RotateCw,
  Scissors,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Fragment, type ChangeEvent, type DragEvent, useCallback, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// 修改這三行，加入 BASE_URL
const BASE_URL = import.meta.env.BASE_URL;
const LOGO_URL = `${BASE_URL}manus-storage/pdf-splitter-logo_e764a730.png`;
const WORKSPACE_ART_URL = `${BASE_URL}manus-storage/blueprint-workspace_7ab3ecdf.png`;

type ToolButtonProps = {
  label: string;
  tooltip: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

type PdfPageItem = {
  id: string;
  sourceId: string;
  sourceIndex: number;
  sourceRotation: number;
  preview: string;
  rotation: number;
};

type PdfSource = {
  id: string;
  file: File;
  bytes: Uint8Array;
};

const createPageId = () => (
  globalThis.crypto?.randomUUID?.() ?? `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
);

function ToolButton({ label, tooltip, icon, active, disabled, onClick }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <button
            type="button"
            className={`tool-button ${active ? "tool-button-active" : ""}`}
            disabled={disabled}
            onClick={onClick}
            aria-pressed={active}
            aria-label={tooltip}
          >
            {icon}
            <span>{label}</span>
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8} className="font-[Manrope] text-[11px] font-semibold tracking-[0.01em]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function PageQuickAction({ tooltip, icon, onClick, disabled, danger }: { tooltip: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <button type="button" draggable={false} className={`page-quick-action ${danger ? "page-quick-action-danger" : ""}`} aria-label={tooltip} onClick={onClick} disabled={disabled}>
            {icon}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={7} className="font-[Manrope] text-[11px] font-semibold">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pdfSources, setPdfSources] = useState<PdfSource[]>([]);
  const [pages, setPages] = useState<PdfPageItem[]>([]);
  const [splitPoints, setSplitPoints] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "order">("grid");
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);

  const pageCount = pages.length;

  const clearFile = () => {
    setFile(null);
    setPdfSources([]);
    setPages([]);
    setSplitPoints([]);
    if (inputRef.current) inputRef.current.value = "";
    if (importInputRef.current) importInputRef.current.value = "";
  };

  const loadPdf = useCallback(async (selectedFile: File, mode: "replace" | "append" = "replace") => {
    const isPdf = selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.error("請選擇 PDF 檔案。", { description: "此工作台目前只支援 .pdf 格式。" });
      return;
    }

    setIsLoading(true);
    if (mode === "replace") setPages([]);

    try {
      const sourceBytes = new Uint8Array(await selectedFile.arrayBuffer());
      
      // 使用動態 import 避免在非預覽模式下加載過大的 pdfjs-dist
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const loadingTask = pdfjsLib.getDocument({ data: sourceBytes.slice() });
      const pdf = await loadingTask.promise;
      const sourceId = createPageId();

      const previews: PdfPageItem[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.48 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) continue;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: context, viewport }).promise;
        previews.push({
          id: createPageId(),
          sourceId,
          sourceIndex: pageNumber - 1,
          sourceRotation: ((page.rotate % 360) + 360) % 360,
          preview: canvas.toDataURL("image/jpeg", 0.78),
          rotation: 0,
        });
      }

      const source: PdfSource = { id: sourceId, file: selectedFile, bytes: sourceBytes };
      setFile((current) => mode === "append" ? current ?? selectedFile : selectedFile);
      setPdfSources((current) => mode === "append" ? [...current, source] : [source]);
      setSplitPoints([]);
      setPages((current) => mode === "append" ? [...current, ...previews] : previews);
      setViewMode("grid");
      toast.success(mode === "append" ? "PDF 已加入工作區。" : "PDF 已載入工作台。", { description: mode === "append" ? `已追加 ${previews.length} 張頁面，並清除原有切點。` : `已建立 ${previews.length} 張頁面縮圖。` });
    } catch (error) {
      console.error(error);
      toast.error("無法讀取這份 PDF。", { description: "請確認檔案沒有損毀或受到密碼保護。" });
      if (mode === "replace") clearFile();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) void loadPdf(selectedFile);
  };

  const onImportInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selectedFiles.length > 0) {
      void (async () => {
        for (const selectedFile of selectedFiles) {
          await loadPdf(selectedFile, "append");
        }
      })();
    }
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const selectedFile = event.dataTransfer.files?.[0];
    if (selectedFile) void loadPdf(selectedFile);
  };

  const splitPdf = async () => {
    const selectedSplitPoints = splitPoints;
    const selectedPages = pages;
    if (!file || pdfSources.length === 0 || pageCount < 2 || selectedSplitPoints.length === 0) {
      toast.error("請先選擇分割位置。", { description: "請點選兩頁之間的剪刀圖示，設定 PDF 的切點。" });
      return;
    }
    setIsSplitting(true);
    try {
      const sourceDocuments = new Map(await Promise.all(pdfSources.map(async (source) => [source.id, await PDFDocument.load(source.bytes)] as const)));
      const baseName = file.name.replace(/\.pdf$/i, "") || "split-document";
      const zip = new JSZip();
      const boundaries = [0, ...selectedSplitPoints, pageCount];

      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const startPage = boundaries[index];
        const endPage = boundaries[index + 1];
        const segmentPdf = await PDFDocument.create();
        const segmentItems = selectedPages.slice(startPage, endPage);
        
        for (const pageItem of segmentItems) {
          const source = sourceDocuments.get(pageItem.sourceId);
          if (!source) throw new Error("找不到頁面來源");
          const [page] = await segmentPdf.copyPages(source, [pageItem.sourceIndex]);
          // 注意：移除了文字註記繪製邏輯，僅保留旋轉
          const rotation = (page.getRotation().angle + pageItem.rotation) % 360;
          page.setRotation(rotation); 
          segmentPdf.addPage(page);
        }

        const segmentNumber = String(index + 1).padStart(2, "0");
        const fileName = `${baseName}_${segmentNumber}_第${startPage + 1}-${endPage}頁.pdf`;
        zip.file(fileName, await segmentPdf.save());
      }

      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const zipUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = zipUrl;
      link.download = `${baseName}_分拆結果.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(zipUrl), 800);

      toast.success("ZIP 壓縮檔已準備完成。", { description: `壓縮檔內包含 ${selectedSplitPoints.length + 1} 份分拆後的 PDF，下載將由瀏覽器自動開始。` });
    } catch (error) {
      console.error(error);
      toast.error("拆分時發生問題。", { description: "請重新嘗試，或改用另一份 PDF。" });
    } finally {
      setIsSplitting(false);
    }
  };

  const exportPdf = async () => {
    if (!file || pdfSources.length === 0 || pageCount === 0) return;
    setIsExporting(true);
    try {
      const sourceDocuments = new Map(await Promise.all(pdfSources.map(async (source) => [source.id, await PDFDocument.load(source.bytes)] as const)));
      const exportedPdf = await PDFDocument.create();
      
      for (const pageItem of pages) {
        const source = sourceDocuments.get(pageItem.sourceId);
        if (!source) throw new Error("找不到頁面來源");
        const [page] = await exportedPdf.copyPages(source, [pageItem.sourceIndex]);
        const rotation = (page.getRotation().angle + pageItem.rotation) % 360;
        page.setRotation(rotation);
        exportedPdf.addPage(page);
      }

      const baseName = file.name.replace(/\.pdf$/i, "") || "pdf-studio-document";
      const fileUrl = URL.createObjectURL(new Blob([await exportedPdf.save()], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = `${baseName}_已編輯.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 800);
      toast.success("PDF 已匯出。", { description: "目前頁序與旋轉設定已寫入下載檔案。" });
    } catch (error) {
      console.error(error);
      toast.error("匯出時發生問題。", { description: "請重新嘗試匯出目前文件。" });
    } finally {
      setIsExporting(false);
    }
  };

  const toggleSplitPoint = (pageNumber: number) => {
    setSplitPoints((current) => (
      current.includes(pageNumber)
        ? current.filter((point) => point !== pageNumber)
        : [...current, pageNumber].sort((first, second) => first - second)
    ));
  };

  const clearSplitPoints = () => {
    if (splitPoints.length === 0) return;
    setSplitPoints([]);
    toast.success("已清除所有分割點。", { description: "你可以重新選擇一個或多個頁面之間的剪刀節點。" });
  };

  const rotatePage = (pageId: string) => {
    setPages((current) => current.map((page) => (
      page.id === pageId ? { ...page, rotation: (page.rotation + 90) % 360 } : page
    )));
  };

  const duplicatePage = (pageIndex: number) => {
    const copiedPage = pages[pageIndex];
    if (!copiedPage) return;
    setPages((current) => {
      const nextPages = [...current];
      nextPages.splice(pageIndex + 1, 0, { ...copiedPage, id: createPageId() });
      return nextPages;
    });
    setSplitPoints((current) => current.map((point) => (point >= pageIndex + 1 ? point + 1 : point)));
    toast.success("已複製頁面。", { description: "複本已插入於原始頁面的下一頁。" });
  };

  const deletePage = (pageIndex: number) => {
    const deletedPage = pages[pageIndex];
    if (!deletedPage) return;
    if (pages.length === 1) {
      setPages([]);
      setSplitPoints([]);
      toast.success("已清空工作區。", { description: "你可以使用匯入按鈕繼續加入更多 PDF。" });
      return;
    }
    setPages((current) => current.filter((page) => page.id !== deletedPage.id));
    setSplitPoints((current) => current
      .filter((point) => point !== pageIndex + 1)
      .map((point) => (point > pageIndex + 1 ? point - 1 : point)));
    toast.success("已刪除頁面。", { description: "相關切點已自動調整。" });
  };

  const reorderPages = (sourceId: string, targetId: string, position: "before" | "after") => {
    if (sourceId === targetId) return;
    const sourceIndex = pages.findIndex((page) => page.id === sourceId);
    const targetIndex = pages.findIndex((page) => page.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextPages = [...pages];
    const [movedPage] = nextPages.splice(sourceIndex, 1);
    let insertionIndex = targetIndex + (position === "after" ? 1 : 0);
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    nextPages.splice(insertionIndex, 0, movedPage);
    setPages(nextPages);
    setSplitPoints((current) => current.filter((point) => point > 0 && point < nextPages.length));
    toast.success("頁面順序已更新。", { description: `已將第 ${sourceIndex + 1} 頁移至第 ${insertionIndex + 1} 頁。` });
  };

  const handlePageDragStart = (event: DragEvent<HTMLDivElement>, pageId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pageId);
    setDraggedPageId(pageId);
  };

  const handlePageDragOver = (event: DragEvent<HTMLDivElement>, pageId: string) => {
    event.preventDefault();
    if (!draggedPageId || draggedPageId === pageId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
    event.dataTransfer.dropEffect = "move";
    setDropTarget({ id: pageId, position });
  };

  const handlePageDrop = (event: DragEvent<HTMLDivElement>, pageId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedPageId;
    if (sourceId && dropTarget?.id === pageId) reorderPages(sourceId, pageId, dropTarget.position);
    setDraggedPageId(null);
    setDropTarget(null);
  };

  const hasFile = Boolean(file && pdfSources.length > 0 && pageCount > 0);
  const hasWorkspace = Boolean(file);
  const importedDocumentCount = pdfSources.length;
  const totalSourceSize = pdfSources.reduce((total, source) => total + source.file.size, 0);
  const outputFileCount = splitPoints.length + 1;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-mark" src={LOGO_URL} alt="PDF Studio" />
          <div>
            <p className="brand-name">PDF Studio</p>
            <p className="brand-kicker">本機文件工作台</p>
          </div>
        </div>

        <div className="topbar-workflow" aria-label="文件處理流程">
          <span className={!hasWorkspace ? "topbar-flow-active" : ""}><b>01</b>匯入</span>
          <i aria-hidden="true" />
          <span className={hasWorkspace ? "topbar-flow-active" : ""}><b>02</b>編排</span>
          <i aria-hidden="true" />
          <span><b>03</b>輸出</span>
        </div>

        {hasWorkspace && (
          <nav className="toolbar" aria-label="PDF 操作工具">
            <ToolButton label={isSplitting ? "正在壓縮" : `分拆（${outputFileCount} 份）`} tooltip="依照已選切點輸出 ZIP 壓縮檔" icon={isSplitting ? <Loader2 className="animate-spin" size={17} /> : <Scissors size={17} strokeWidth={2.2} />} active={splitPoints.length > 0} disabled={isSplitting || splitPoints.length === 0} onClick={() => void splitPdf()} />
            <ToolButton label="清除切點" tooltip="清除所有已選分割點" icon={<Eraser size={17} strokeWidth={2.1} />} disabled={splitPoints.length === 0 || isSplitting} onClick={clearSplitPoints} />
            <ToolButton label={isLoading ? "正在匯入" : "匯入"} tooltip="加入另一份 PDF 並追加其頁面" icon={isLoading ? <Loader2 className="animate-spin" size={17} /> : <UploadCloud size={17} strokeWidth={2.1} />} disabled={isLoading || isSplitting || isExporting} onClick={() => importInputRef.current?.click()} />
            <ToolButton label={isExporting ? "正在匯出" : "匯出"} tooltip="匯出目前頁序與編輯結果" icon={isExporting ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} strokeWidth={2.1} />} disabled={!hasFile || isExporting || isSplitting || isLoading} onClick={() => void exportPdf()} />
          </nav>
        )}

        <div className="topbar-meta">
          {hasWorkspace && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="icon-button" type="button" aria-label="關閉目前文件並返回上載畫面" onClick={clearFile}>
                  <X size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="font-[Manrope] text-[11px] font-semibold tracking-[0.01em]">關閉目前文件</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={onInputChange} className="sr-only" />
      <input ref={importInputRef} type="file" accept="application/pdf,.pdf" multiple onChange={onImportInputChange} className="sr-only" />

      {!hasWorkspace && !isLoading && (
        <main className="upload-stage">
          <section className="upload-copy">
            <div className="eyebrow"><Sparkles size={15} /> 文件流程 / 01 READY</div>
            <h1>下一步：<br /><em>匯入 PDF。</em></h1>
            <p>匯入後，所有頁面會配置到文件軌道；依序排列頁面、選取頁間切縫，最後輸出單一 PDF 或分拆 ZIP。</p>
            <div className="upload-points">
              <span><b>01</b><Check size={15} /><strong>匯入 PDF</strong><small>載入頁面至工作軌道</small></span>
              <span><b>02</b><Check size={15} /><strong>排列並選取切點</strong><small>直接拖曳頁面，於頁間設定切縫</small></span>
              <span><b>03</b><Check size={15} /><strong>輸出本機結果</strong><small>下載單一 PDF 或分拆 ZIP</small></span>
            </div>
          </section>

          <button
            className={`dropzone ${isDragging ? "dropzone-dragging" : ""}`}
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <img className="blueprint-art" src={WORKSPACE_ART_URL} alt="" />
            <div className="upload-ruler" aria-hidden="true"><span>00</span><i /><span>01</span><i /><span>02</span><i /><span>03</span><i /><span>04</span></div>
            <div className="upload-track-label" aria-hidden="true"><span>頁面工作軌道</span><strong>第 02 頁後切分</strong></div>
            <div className="upload-track-preview" aria-hidden="true">
              <div className="upload-ghost-page"><span>01</span><i /></div>
              <div className="upload-cut-seam"><span><Scissors size={13} /></span><small>CUT</small></div>
              <div className="upload-ghost-page"><span>02</span><i /></div>
              <div className="upload-cut-seam upload-cut-seam-active"><span><Scissors size={13} /></span><small>SELECT</small></div>
              <div className="upload-ghost-page"><span>03</span><i /></div>
            </div>
            <div className="dropzone-content">
              <span className="upload-icon"><UploadCloud size={28} /></span>
              <strong>拖放 PDF 到工作軌道</strong>
              <span>或按一下選取檔案並開始編排</span>
              <span className="dropzone-note">本機處理 · 支援多份 PDF · 無須上傳</span>
            </div>
          </button>
        </main>
      )}

      {isLoading && !hasWorkspace && (
        <main className="loading-stage" aria-live="polite">
          <div className="loading-card">
            <Loader2 className="loading-spinner" size={30} />
            <h1>正在建立頁面工作軌道</h1>
            <p>PDF 正在瀏覽器內解析並產生縮圖，這可能需要片刻。</p>
          </div>
        </main>
      )}

      {hasWorkspace && file && (
        <main className="workspace">
          <section className="workspace-context">
            <div className="file-summary">
              <span className="file-icon"><FileText size={21} /></span>
              <div>
                <div className="file-name-row"><h1>{importedDocumentCount > 1 ? `${file.name} + ${importedDocumentCount - 1} 份 PDF` : file.name}</h1><span className="file-badge">PDF</span></div>
                <p>{pageCount === 0 ? `尚未加入頁面 · ${formatFileSize(totalSourceSize)}` : `${pageCount} 頁 · ${formatFileSize(totalSourceSize)} · ${importedDocumentCount > 1 ? `已合併 ${importedDocumentCount} 份文件 · ` : ""}${pageCount === 1 ? "單頁 PDF 已可直接匯出" : splitPoints.length > 0 ? `已選 ${splitPoints.length} 個切點，將輸出 ${outputFileCount} 份 PDF` : "點選兩頁之間的剪刀，設定一個或多個切點"}`}</p>
              </div>
            </div>
            <div className="view-controls" aria-label="檢視模式">
              <Tooltip><TooltipTrigger asChild><button type="button" className={`view-control ${viewMode === "order" ? "view-control-active" : ""}`} aria-label="頁面排序檢視" aria-pressed={viewMode === "order"} onClick={() => setViewMode("order")}><List size={18} /></button></TooltipTrigger><TooltipContent side="bottom" sideOffset={8} className="font-[Manrope] text-[11px] font-semibold">頁面排序檢視</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><button type="button" className={`view-control ${viewMode === "grid" ? "view-control-active" : ""}`} aria-label="縮圖檢視" aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")}><Grid2X2 size={18} /></button></TooltipTrigger><TooltipContent side="bottom" sideOffset={8} className="font-[Manrope] text-[11px] font-semibold">縮圖檢視</TooltipContent></Tooltip>
            </div>
          </section>

          <section className="document-frame" aria-label="PDF 頁面縮圖及分割節點">
            {pageCount === 0 ? (
              <div className="empty-workspace">
                <UploadCloud size={25} />
                <strong>工作區目前沒有頁面</strong>
                <span>請使用 header 的匯入按鈕加入一份或多份 PDF。</span>
              </div>
            ) : viewMode === "grid" ? (
              <div className="document-rail">
                {pages.map((page, index) => {
                  const pageNumber = index + 1;
                  const isSplitPoint = splitPoints.includes(pageNumber);
                  return (
                    <div
                      className={`page-flow ${draggedPageId === page.id ? "page-flow-dragging" : ""} ${dropTarget?.id === page.id && draggedPageId !== page.id ? `page-flow-drop-${dropTarget.position}` : ""}`}
                      key={page.id}
                      draggable
                      onDragStart={(event) => handlePageDragStart(event, page.id)}
                      onDragOver={(event) => handlePageDragOver(event, page.id)}
                      onDrop={(event) => handlePageDrop(event, page.id)}
                      onDragEnd={() => { setDraggedPageId(null); setDropTarget(null); }}
                    >
                      <article className="page-card">
                        <div className="page-topline"><span className="page-topline-label"><GripVertical className="page-drag-handle" size={13} /><span>PAGE {String(pageNumber).padStart(2, "0")}</span></span><span className="page-dot" /></div>
                        <div className="page-card-hover-tools" aria-label={`第 ${pageNumber} 頁操作`}>
                          {/* 已移除放大預覽按鈕 */}
                          <PageQuickAction tooltip="向右旋轉 90°" icon={<RotateCw size={17} />} onClick={() => rotatePage(page.id)} />
                          <PageQuickAction tooltip="複製此頁" icon={<Copy size={16} />} onClick={() => duplicatePage(index)} />
                          <PageQuickAction tooltip="刪除此頁" icon={<Trash2 size={17} />} onClick={() => deletePage(index)} danger />
                        </div>
                        <div className="page-image-wrap"><img src={page.preview} alt={`第 ${pageNumber} 頁縮圖`} style={{ transform: `rotate(${page.rotation}deg)` }} /></div>
                        <div className="page-caption"><span>第 {pageNumber} 頁</span><span>PDF</span></div>
                      </article>
                      {pageNumber < pageCount && (
                        <button type="button" className={`split-node ${isSplitPoint ? "split-node-active" : ""}`} onClick={() => toggleSplitPoint(pageNumber)} aria-label={isSplitPoint ? `取消第 ${pageNumber} 頁後的分割點` : `在第 ${pageNumber} 頁後分割`} aria-pressed={isSplitPoint}>
                          {isSplitPoint && <span className="split-callout">第 {pageNumber} 頁後</span>}
                          <span className="scissor-pin"><Scissors size={16} /></span>
                          <span className="split-node-text">切點</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <ol className="order-view" aria-label="PDF 頁面排序">
                {pages.map((page, index) => {
                  const pageNumber = index + 1;
                  const isSplitPoint = splitPoints.includes(pageNumber);
                  return (
                    <Fragment key={page.id}>
                      <li className="order-item">
                        <span className="order-index">{String(pageNumber).padStart(2, "0")}</span>
                        <img className="order-thumbnail" src={page.preview} alt={`第 ${pageNumber} 頁縮圖`} style={{ transform: `rotate(${page.rotation}deg)` }} />
                        <div className="order-details"><strong>第 {pageNumber} 頁</strong><span>原始頁序 #{pageNumber}</span></div>
                        {pageNumber === pageCount && <span className="order-end">文件結尾</span>}
                      </li>
                      {pageNumber < pageCount && (
                        <li className="order-gap">
                          <button type="button" className={`order-scissor-node ${isSplitPoint ? "order-scissor-node-active" : ""}`} onClick={() => toggleSplitPoint(pageNumber)} aria-label={isSplitPoint ? `取消第 ${pageNumber} 頁後的分割點` : `在第 ${pageNumber} 頁後分割`} aria-pressed={isSplitPoint}>
                            {isSplitPoint && <span className="order-split-callout">第 {pageNumber} 頁後</span>}
                            <Scissors size={15} />
                          </button>
                        </li>
                      )}
                    </Fragment>
                  );
                })}
              </ol>
            )}
          </section>
        </main>
      )}
      
      {/* 已移除全螢幕預覽 Dialog */}
    </div>
  );
}