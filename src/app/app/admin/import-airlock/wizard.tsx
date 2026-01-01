"use client";

import { useState, useCallback, useRef } from "react";
import type {
  RawDataRow,
  ColumnMapping,
  NormalizedField,
  StagedRow,
  DiffRow,
  DiffSummary,
} from "@/lib/import-airlock/types";
import { NORMALIZED_FIELDS } from "@/lib/import-airlock/types";

type WizardStep = "source" | "mapping" | "diff" | "publish";

type BatchState = {
  id: string | null;
  workDate: string;
  sourceType: "upload" | "clipboard" | "manual";
  sourceFilename: string | null;
  rawHeaders: string[];
  rawData: RawDataRow[];
  columnMappings: ColumnMapping[];
  stagedData: StagedRow[];
  diffRows: DiffRow[];
  diffSummary: DiffSummary | null;
  mapStats: Record<string, number> | null;
};

const STEP_ORDER: WizardStep[] = ["source", "mapping", "diff", "publish"];

const STEP_LABELS: Record<WizardStep, string> = {
  source: "1. Source",
  mapping: "2. Mapping",
  diff: "3. Review",
  publish: "4. Publish",
};

const FIELD_LABELS: Record<NormalizedField, string> = {
  work_date: "Work Date",
  driver_name: "Driver Name",
  van_label: "Van Label",
  vin: "VIN",
  route_code: "Route Code",
  pad: "Pad",
  dispatch_time: "Dispatch Time",
  cart_location: "Cart Location",
  parking_spot_label: "Parking Spot",
};

export default function ImportAirlockWizard() {
  const [step, setStep] = useState<WizardStep>("source");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<Record<string, unknown> | null>(null);

  const [batch, setBatch] = useState<BatchState>({
    id: null,
    workDate: getTodayDate(),
    sourceType: "upload",
    sourceFilename: null,
    rawHeaders: [],
    rawData: [],
    columnMappings: [],
    stagedData: [],
    diffRows: [],
    diffSummary: null,
    mapStats: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);
      setLoading(true);

      try {
        const filename = file.name.toLowerCase();
        let headers: string[] = [];
        let rows: RawDataRow[] = [];

        if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
          // Parse XLSX client-side using dynamic import
          const XLSX = await import("xlsx");
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) throw new Error("No sheets found in workbook");

          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            raw: false,
            defval: "",
          }) as unknown[][];

          if (jsonData.length === 0) throw new Error("Sheet is empty");

          headers = (jsonData[0] as unknown[]).map((h) =>
            String(h ?? "").trim()
          );

          for (let i = 1; i < jsonData.length; i++) {
            const rowData = jsonData[i] as unknown[];
            const row: RawDataRow = {};
            let hasData = false;

            for (let j = 0; j < headers.length; j++) {
              const value = String(rowData[j] ?? "").trim();
              if (value) hasData = true;
              row[headers[j]!] = value;
            }

            if (hasData) rows.push(row);
          }
        } else if (filename.endsWith(".csv")) {
          // Parse CSV client-side
          const Papa = await import("papaparse");
          const text = await file.text();
          const result = Papa.default.parse<Record<string, string>>(text, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim(),
            transform: (v) => v.trim(),
          });

          headers = result.meta.fields ?? [];
          rows = result.data;
        } else {
          throw new Error("Unsupported file format. Use .xlsx, .xls, or .csv");
        }

        if (rows.length === 0) {
          throw new Error("No data rows found in file");
        }

        // Auto-generate initial column mappings
        const mappings = autoMapColumns(headers);

        setBatch((prev) => ({
          ...prev,
          sourceType: "upload",
          sourceFilename: file.name,
          rawHeaders: headers,
          rawData: rows,
          columnMappings: mappings,
        }));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to parse file"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Handle clipboard paste
  const handlePaste = useCallback(async (text: string) => {
    setError(null);
    setLoading(true);

    try {
      const Papa = await import("papaparse");

      // Detect delimiter
      const firstLine = text.split("\n")[0] ?? "";
      const tabCount = (firstLine.match(/\t/g) ?? []).length;
      const commaCount = (firstLine.match(/,/g) ?? []).length;
      const delimiter = tabCount >= commaCount && tabCount > 0 ? "\t" : ",";

      const result = Papa.default.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        transformHeader: (h) => h.trim(),
        transform: (v) => v.trim(),
      });

      const headers = result.meta.fields ?? [];
      const rows = result.data;

      if (rows.length === 0) {
        throw new Error("No data rows found in pasted content");
      }

      const mappings = autoMapColumns(headers);

      setBatch((prev) => ({
        ...prev,
        sourceType: "clipboard",
        sourceFilename: null,
        rawHeaders: headers,
        rawData: rows,
        columnMappings: mappings,
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to parse pasted data"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Create batch and proceed to mapping
  const handleCreateBatch = useCallback(async () => {
    if (batch.rawData.length === 0) {
      setError("No data to import");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/import-airlock/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate: batch.workDate,
          sourceType: batch.sourceType,
          sourceFilename: batch.sourceFilename,
          rawData: batch.rawData,
          rawHeaders: batch.rawHeaders,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to create batch");
      }

      setBatch((prev) => ({ ...prev, id: data.data.id }));
      setStep("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create batch");
    } finally {
      setLoading(false);
    }
  }, [batch]);

  // Apply mappings and proceed to diff
  const handleApplyMappings = useCallback(async () => {
    if (!batch.id) {
      setError("No batch ID");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/import-airlock/${batch.id}/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columnMappings: batch.columnMappings,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to apply mappings");
      }

      setBatch((prev) => ({
        ...prev,
        mapStats: data.data.stats,
      }));

      // Now compute diff
      const diffRes = await fetch(`/api/import-airlock/${batch.id}/diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const diffData = await diffRes.json();

      if (!diffData.ok) {
        throw new Error(diffData.error || "Failed to compute diff");
      }

      setBatch((prev) => ({
        ...prev,
        diffRows: diffData.data.diffRows,
        diffSummary: diffData.data.summary,
      }));

      setStep("diff");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply mappings");
    } finally {
      setLoading(false);
    }
  }, [batch.id, batch.columnMappings]);

  // Publish
  const handlePublish = useCallback(async () => {
    if (!batch.id) {
      setError("No batch ID");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/import-airlock/${batch.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skipUnresolved: true,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to publish");
      }

      setPublishResult(data.data);
      setStep("publish");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setLoading(false);
    }
  }, [batch.id]);

  // Update column mapping
  const updateMapping = useCallback(
    (sourceHeader: string, targetField: NormalizedField | null) => {
      setBatch((prev) => ({
        ...prev,
        columnMappings: prev.columnMappings.map((m) =>
          m.sourceHeader === sourceHeader
            ? { ...m, targetField, ignored: targetField === null }
            : m
        ),
      }));
    },
    []
  );

  // Reset wizard
  const handleReset = useCallback(() => {
    setBatch({
      id: null,
      workDate: getTodayDate(),
      sourceType: "upload",
      sourceFilename: null,
      rawHeaders: [],
      rawData: [],
      columnMappings: [],
      stagedData: [],
      diffRows: [],
      diffSummary: null,
      mapStats: null,
    });
    setStep("source");
    setError(null);
    setPublishResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-center space-x-4">
        {STEP_ORDER.map((s, idx) => (
          <div key={s} className="flex items-center">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                step === s
                  ? "bg-purple-500 text-white"
                  : STEP_ORDER.indexOf(step) > idx
                  ? "bg-green-500 text-white"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {STEP_ORDER.indexOf(step) > idx ? "✓" : idx + 1}
            </div>
            <span
              className={`ml-2 text-sm ${
                step === s ? "text-white font-medium" : "text-slate-400"
              }`}
            >
              {STEP_LABELS[s]}
            </span>
            {idx < STEP_ORDER.length - 1 && (
              <div className="w-12 h-0.5 mx-4 bg-slate-700" />
            )}
          </div>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
        {step === "source" && (
          <SourceStep
            batch={batch}
            setBatch={setBatch}
            loading={loading}
            fileInputRef={fileInputRef}
            onFileUpload={handleFileUpload}
            onPaste={handlePaste}
            onNext={handleCreateBatch}
          />
        )}

        {step === "mapping" && (
          <MappingStep
            batch={batch}
            loading={loading}
            updateMapping={updateMapping}
            onBack={() => setStep("source")}
            onNext={handleApplyMappings}
          />
        )}

        {step === "diff" && (
          <DiffStep
            batch={batch}
            loading={loading}
            onBack={() => setStep("mapping")}
            onPublish={handlePublish}
          />
        )}

        {step === "publish" && (
          <PublishStep
            publishResult={publishResult}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Step Components
// ============================================================================

type SourceMode = "upload" | "paste" | "manual";

const MANUAL_HEADERS = [
  "driver_name",
  "van_label",
  "route_code",
  "pad",
  "dispatch_time",
  "cart_location",
  "parking_spot_label",
];

const MANUAL_FIELD_LABELS: Record<string, string> = {
  driver_name: "Driver",
  van_label: "Van",
  route_code: "Route",
  pad: "Pad",
  dispatch_time: "Time",
  cart_location: "Cart",
  parking_spot_label: "Spot",
};

function SourceStep({
  batch,
  setBatch,
  loading,
  fileInputRef,
  onFileUpload,
  onPaste,
  onNext,
}: {
  batch: BatchState;
  setBatch: React.Dispatch<React.SetStateAction<BatchState>>;
  loading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPaste: (text: string) => void;
  onNext: () => void;
}) {
  const [pasteText, setPasteText] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [manualRows, setManualRows] = useState<Record<string, string>[]>([
    createEmptyManualRow(),
  ]);

  function createEmptyManualRow(): Record<string, string> {
    const row: Record<string, string> = {};
    for (const h of MANUAL_HEADERS) {
      row[h] = "";
    }
    return row;
  }

  function updateManualRow(idx: number, field: string, value: string) {
    setManualRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  }

  function addManualRow() {
    setManualRows((prev) => [...prev, createEmptyManualRow()]);
  }

  function removeManualRow(idx: number) {
    setManualRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function applyManualRows() {
    // Filter out completely empty rows
    const validRows = manualRows.filter((row) =>
      Object.values(row).some((v) => v.trim() !== "")
    );

    if (validRows.length === 0) {
      return;
    }

    // Auto-generate mappings (direct mapping since headers match normalized fields)
    const mappings: ColumnMapping[] = MANUAL_HEADERS.map((h) => ({
      sourceHeader: h,
      targetField: h as NormalizedField,
      ignored: false,
    }));

    setBatch((prev) => ({
      ...prev,
      sourceType: "manual",
      sourceFilename: null,
      rawHeaders: MANUAL_HEADERS,
      rawData: validRows,
      columnMappings: mappings,
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">
          Step 1: Select Data Source
        </h2>
        <p className="text-slate-400">
          Upload a file, paste data, or enter rows manually.
        </p>
      </div>

      {/* Work date selector */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Work Date
        </label>
        <input
          type="date"
          value={batch.workDate}
          onChange={(e) =>
            setBatch((prev) => ({ ...prev, workDate: e.target.value }))
          }
          className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Source mode tabs */}
      <div className="flex border-b border-slate-700">
        {(["upload", "paste", "manual"] as SourceMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setSourceMode(mode)}
            className={`px-4 py-2 text-sm font-medium transition ${
              sourceMode === mode
                ? "text-purple-400 border-b-2 border-purple-400"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            {mode === "upload" && "File Upload"}
            {mode === "paste" && "Clipboard"}
            {mode === "manual" && "Manual Entry"}
          </button>
        ))}
      </div>

      {/* File upload */}
      {sourceMode === "upload" && (
        <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onFileUpload}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer inline-flex items-center px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            Upload File (.xlsx, .csv)
          </label>
          <p className="text-slate-500 mt-2 text-sm">
            or drag and drop a file here
          </p>
        </div>
      )}

      {/* Clipboard paste */}
      {sourceMode === "paste" && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Paste from clipboard (TSV/CSV)
          </label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste data here..."
            rows={5}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {pasteText && (
            <button
              onClick={() => onPaste(pasteText)}
              disabled={loading}
              className="mt-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50"
            >
              Parse Pasted Data
            </button>
          )}
        </div>
      )}

      {/* Manual entry */}
      {sourceMode === "manual" && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 px-2 py-2 w-8">#</th>
                  {MANUAL_HEADERS.map((h) => (
                    <th key={h} className="text-left text-slate-400 px-2 py-2">
                      {MANUAL_FIELD_LABELS[h]}
                    </th>
                  ))}
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {manualRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-700/50">
                    <td className="text-slate-500 px-2 py-1">{idx + 1}</td>
                    {MANUAL_HEADERS.map((h) => (
                      <td key={h} className="px-1 py-1">
                        <input
                          type="text"
                          value={row[h] || ""}
                          onChange={(e) =>
                            updateManualRow(idx, h, e.target.value)
                          }
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                          placeholder={MANUAL_FIELD_LABELS[h]}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      {manualRows.length > 1 && (
                        <button
                          onClick={() => removeManualRow(idx)}
                          className="text-red-400 hover:text-red-300 p-1"
                          title="Remove row"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addManualRow}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
            >
              + Add Row
            </button>
            <button
              onClick={applyManualRows}
              disabled={
                loading ||
                manualRows.every((row) =>
                  Object.values(row).every((v) => !v.trim())
                )
              }
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition text-sm"
            >
              Apply Manual Data
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {batch.rawData.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h3 className="text-white font-medium mb-2">
            Preview ({batch.rawData.length} rows)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  {batch.rawHeaders.map((h) => (
                    <th
                      key={h}
                      className="text-left text-slate-400 px-2 py-1"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batch.rawData.slice(0, 5).map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-700/50">
                    {batch.rawHeaders.map((h) => (
                      <td key={h} className="text-slate-300 px-2 py-1">
                        {row[h] || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {batch.rawData.length > 5 && (
              <p className="text-slate-500 text-sm mt-2">
                ...and {batch.rawData.length - 5} more rows
              </p>
            )}
          </div>
        </div>
      )}

      {/* Next button */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={loading || batch.rawData.length === 0}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition flex items-center"
        >
          {loading ? (
            <>
              <LoadingSpinner />
              <span className="ml-2">Processing...</span>
            </>
          ) : (
            <>
              Continue to Mapping
              <svg
                className="w-5 h-5 ml-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function MappingStep({
  batch,
  loading,
  updateMapping,
  onBack,
  onNext,
}: {
  batch: BatchState;
  loading: boolean;
  updateMapping: (sourceHeader: string, targetField: NormalizedField | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  // Count how many fields are mapped
  const mappedCount = batch.columnMappings.filter(
    (m) => m.targetField !== null
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">
          Step 2: Map Columns
        </h2>
        <p className="text-slate-400">
          Map your source columns to the system fields.
        </p>
      </div>

      {/* Mapping table */}
      <div className="bg-slate-800/50 rounded-lg p-4">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left text-slate-400 px-2 py-2">
                Source Column
              </th>
              <th className="text-left text-slate-400 px-2 py-2">
                Maps To
              </th>
              <th className="text-left text-slate-400 px-2 py-2">
                Sample Value
              </th>
            </tr>
          </thead>
          <tbody>
            {batch.columnMappings.map((mapping) => (
              <tr
                key={mapping.sourceHeader}
                className="border-b border-slate-700/50"
              >
                <td className="text-white px-2 py-2 font-medium">
                  {mapping.sourceHeader}
                </td>
                <td className="px-2 py-2">
                  <select
                    value={mapping.targetField ?? ""}
                    onChange={(e) =>
                      updateMapping(
                        mapping.sourceHeader,
                        (e.target.value as NormalizedField) || null
                      )
                    }
                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">-- Ignore --</option>
                    {NORMALIZED_FIELDS.map((field) => (
                      <option key={field} value={field}>
                        {FIELD_LABELS[field]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-slate-400 px-2 py-2 text-sm">
                  {batch.rawData[0]?.[mapping.sourceHeader] || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-slate-400 text-sm">
        {mappedCount} of {batch.columnMappings.length} columns mapped
      </p>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={loading}
          className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={loading || mappedCount === 0}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition flex items-center"
        >
          {loading ? (
            <>
              <LoadingSpinner />
              <span className="ml-2">Processing...</span>
            </>
          ) : (
            <>
              Apply Mappings & Preview Diff
              <svg
                className="w-5 h-5 ml-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function DiffStep({
  batch,
  loading,
  onBack,
  onPublish,
}: {
  batch: BatchState;
  loading: boolean;
  onBack: () => void;
  onPublish: () => void;
}) {
  const summary = batch.diffSummary;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">
          Step 3: Review Changes
        </h2>
        <p className="text-slate-400">
          Review the changes that will be made when you publish.
        </p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <SummaryCard
            label="Added"
            value={summary.added}
            color="text-green-400"
          />
          <SummaryCard
            label="Updated"
            value={summary.updated}
            color="text-yellow-400"
          />
          <SummaryCard
            label="Removed"
            value={summary.removed}
            color="text-red-400"
          />
          <SummaryCard
            label="Unchanged"
            value={summary.unchanged}
            color="text-slate-400"
          />
          <SummaryCard
            label="Unresolved"
            value={summary.unresolved}
            color="text-orange-400"
          />
        </div>
      )}

      {/* Diff rows */}
      <div className="bg-slate-800/50 rounded-lg p-4 max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left text-slate-400 px-2 py-1 w-24">
                Action
              </th>
              <th className="text-left text-slate-400 px-2 py-1">Route</th>
              <th className="text-left text-slate-400 px-2 py-1">Driver</th>
              <th className="text-left text-slate-400 px-2 py-1">Van</th>
              <th className="text-left text-slate-400 px-2 py-1">Changes</th>
            </tr>
          </thead>
          <tbody>
            {batch.diffRows.map((diff, idx) => (
              <tr
                key={idx}
                className={`border-b border-slate-700/50 ${
                  diff.action === "add"
                    ? "bg-green-500/5"
                    : diff.action === "remove"
                    ? "bg-red-500/5"
                    : diff.action === "update"
                    ? "bg-yellow-500/5"
                    : ""
                }`}
              >
                <td className="px-2 py-1">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      diff.action === "add"
                        ? "bg-green-500/20 text-green-400"
                        : diff.action === "remove"
                        ? "bg-red-500/20 text-red-400"
                        : diff.action === "update"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-slate-500/20 text-slate-400"
                    }`}
                  >
                    {diff.action.toUpperCase()}
                  </span>
                </td>
                <td className="text-white px-2 py-1">
                  {diff.after?.route_code ?? diff.before?.route_code ?? "-"}
                </td>
                <td className="text-slate-300 px-2 py-1">
                  {diff.action === "update" &&
                  diff.changedFields.includes("driver") ? (
                    <>
                      <span className="line-through text-red-400/70">
                        {diff.before?.driver_name}
                      </span>
                      <span className="mx-1">→</span>
                      <span className="text-green-400">
                        {diff.after?.driver_name}
                      </span>
                    </>
                  ) : (
                    diff.after?.driver_name ?? diff.before?.driver_name ?? "-"
                  )}
                </td>
                <td className="text-slate-300 px-2 py-1">
                  {diff.action === "update" &&
                  diff.changedFields.includes("van") ? (
                    <>
                      <span className="line-through text-red-400/70">
                        {diff.before?.van_label}
                      </span>
                      <span className="mx-1">→</span>
                      <span className="text-green-400">
                        {diff.after?.van_label}
                      </span>
                    </>
                  ) : (
                    diff.after?.van_label ?? diff.before?.van_label ?? "-"
                  )}
                </td>
                <td className="text-slate-400 px-2 py-1 text-xs">
                  {diff.changedFields.length > 0
                    ? diff.changedFields.join(", ")
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {batch.diffRows.length === 0 && (
          <p className="text-slate-500 text-center py-4">No changes to show</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={loading}
          className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
        >
          ← Back
        </button>
        <button
          onClick={onPublish}
          disabled={loading}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition flex items-center"
        >
          {loading ? (
            <>
              <LoadingSpinner />
              <span className="ml-2">Publishing...</span>
            </>
          ) : (
            <>
              Publish Changes
              <svg
                className="w-5 h-5 ml-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function PublishStep({
  publishResult,
  onReset,
}: {
  publishResult: Record<string, unknown> | null;
  onReset: () => void;
}) {
  const summary = publishResult?.summary as Record<string, number> | undefined;

  return (
    <div className="space-y-6 text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 mb-4">
        <svg
          className="w-10 h-10 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-white">
        Import Published Successfully!
      </h2>
      <p className="text-slate-400">
        Your data has been imported and is now live.
      </p>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-xl mx-auto mt-6">
          <SummaryCard
            label="Created"
            value={summary.created ?? 0}
            color="text-green-400"
          />
          <SummaryCard
            label="Updated"
            value={summary.updated ?? 0}
            color="text-yellow-400"
          />
          <SummaryCard
            label="Cleared"
            value={summary.cleared ?? 0}
            color="text-red-400"
          />
          <SummaryCard
            label="Drivers Added"
            value={summary.driversCreated ?? 0}
            color="text-blue-400"
          />
        </div>
      )}

      <div className="flex justify-center gap-4 mt-8">
        <button
          onClick={onReset}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
        >
          Start New Import
        </button>
        <a
          href="/app/dispatch"
          className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition inline-flex items-center"
        >
          Go to Dispatch
          <svg
            className="w-5 h-5 ml-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-slate-400 text-sm">{label}</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0]!;
}

/**
 * Auto-map columns based on common header patterns.
 */
function autoMapColumns(headers: string[]): ColumnMapping[] {
  const patterns: Record<NormalizedField, RegExp[]> = {
    work_date: [/date/i, /work.*date/i, /day/i],
    driver_name: [/driver/i, /name/i, /employee/i, /associate/i],
    van_label: [/van/i, /vehicle/i, /unit/i, /truck/i],
    vin: [/vin/i],
    route_code: [/route/i, /code/i, /wave/i, /cycle/i],
    pad: [/pad/i, /bay/i, /dock/i],
    dispatch_time: [/time/i, /dispatch/i, /start/i, /departure/i],
    cart_location: [/cart/i, /location/i, /tote/i],
    parking_spot_label: [/spot/i, /parking/i, /space/i, /stall/i],
  };

  const usedTargets = new Set<NormalizedField>();

  return headers.map((header) => {
    let targetField: NormalizedField | null = null;

    // Try to match header to a field
    for (const [field, regexes] of Object.entries(patterns)) {
      if (usedTargets.has(field as NormalizedField)) continue;

      for (const regex of regexes) {
        if (regex.test(header)) {
          targetField = field as NormalizedField;
          usedTargets.add(targetField);
          break;
        }
      }
      if (targetField) break;
    }

    return {
      sourceHeader: header,
      targetField,
      ignored: targetField === null,
    };
  });
}
