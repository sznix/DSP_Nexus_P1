/**
 * Parsers for various import formats: XLSX, CSV, TSV, and clipboard data.
 */

import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { RawDataRow } from "./types";

/**
 * Result from parsing any import format.
 */
export type ParseResult = {
  success: boolean;
  headers: string[];
  rows: RawDataRow[];
  error?: string;
};

/**
 * Parse an XLSX file buffer into rows.
 */
export function parseXlsx(buffer: ArrayBuffer): ParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    
    // Use the first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { success: false, headers: [], rows: [], error: "No sheets found in workbook" };
    }
    
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return { success: false, headers: [], rows: [], error: "Could not read sheet" };
    }
    
    // Convert to JSON with headers (array of arrays format)
    const jsonData = XLSX.utils.sheet_to_json(sheet, {
      header: 1, // Use array of arrays first to get headers
      raw: false, // Convert all values to strings
      defval: "", // Default empty cells to empty string
    }) as unknown[][];
    
    if (jsonData.length === 0) {
      return { success: false, headers: [], rows: [], error: "Sheet is empty" };
    }
    
    // First row is headers
    const headers = (jsonData[0] as unknown[]).map((h) => String(h ?? "").trim());
    
    // Remaining rows are data
    const rows: RawDataRow[] = [];
    for (let i = 1; i < jsonData.length; i++) {
      const rowData = jsonData[i] as unknown[];
      const row: RawDataRow = {};
      
      // Skip completely empty rows
      let hasData = false;
      for (let j = 0; j < headers.length; j++) {
        const value = String(rowData[j] ?? "").trim();
        if (value) hasData = true;
        row[headers[j]] = value;
      }
      
      if (hasData) {
        rows.push(row);
      }
    }
    
    return { success: true, headers, rows };
  } catch (err) {
    return {
      success: false,
      headers: [],
      rows: [],
      error: `Failed to parse XLSX: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Parse a CSV string into rows.
 */
export function parseCsv(csvString: string): ParseResult {
  try {
    const result = Papa.parse<Record<string, string>>(csvString, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      transform: (value) => value.trim(),
    });
    
    if (result.errors.length > 0) {
      const firstError = result.errors[0];
      return {
        success: false,
        headers: [],
        rows: [],
        error: `CSV parse error: ${firstError?.message ?? "Unknown error"}`,
      };
    }
    
    const headers = result.meta.fields ?? [];
    const rows = result.data;
    
    return { success: true, headers, rows };
  } catch (err) {
    return {
      success: false,
      headers: [],
      rows: [],
      error: `Failed to parse CSV: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Parse a TSV (tab-separated) string into rows.
 * Common format when pasting from spreadsheets.
 */
export function parseTsv(tsvString: string): ParseResult {
  try {
    const result = Papa.parse<Record<string, string>>(tsvString, {
      header: true,
      skipEmptyLines: true,
      delimiter: "\t",
      transformHeader: (header) => header.trim(),
      transform: (value) => value.trim(),
    });
    
    if (result.errors.length > 0) {
      const firstError = result.errors[0];
      return {
        success: false,
        headers: [],
        rows: [],
        error: `TSV parse error: ${firstError?.message ?? "Unknown error"}`,
      };
    }
    
    const headers = result.meta.fields ?? [];
    const rows = result.data;
    
    return { success: true, headers, rows };
  } catch (err) {
    return {
      success: false,
      headers: [],
      rows: [],
      error: `Failed to parse TSV: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Auto-detect format and parse clipboard/text data.
 * Tries TSV first (common from spreadsheet paste), then CSV.
 */
export function parseClipboard(text: string): ParseResult {
  // Check if it looks like TSV (has tabs but no commas in first line, or more tabs than commas)
  const firstLine = text.split("\n")[0] ?? "";
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  
  // If it has tabs and more tabs than commas, treat as TSV
  if (tabCount > 0 && tabCount >= commaCount) {
    const tsvResult = parseTsv(text);
    if (tsvResult.success && tsvResult.rows.length > 0) {
      return tsvResult;
    }
  }
  
  // Otherwise try CSV
  return parseCsv(text);
}

/**
 * Detect file type from filename extension.
 */
export function detectFileType(filename: string): "xlsx" | "csv" | "unknown" {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return "xlsx";
  }
  if (lower.endsWith(".csv")) {
    return "csv";
  }
  return "unknown";
}
