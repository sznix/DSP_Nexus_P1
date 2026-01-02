/**
 * Name resolution utilities for Import Airlock.
 * Handles driver name matching using exact match, aliases, and fuzzy matching.
 */

import type { DriverSuggestion } from "./types";

/**
 * Driver record from database.
 */
export type DriverRecord = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  active: boolean;
};

/**
 * Driver alias record from database.
 */
export type DriverAliasRecord = {
  id: string;
  driver_id: string;
  alias: string;
  normalized_alias: string;
};

/**
 * Van record from database.
 */
export type VanRecord = {
  id: string;
  label: string;
  vin: string | null;
  active: boolean;
};

/**
 * Pad record from database.
 */
export type PadRecord = {
  id: string;
  name: string;
  sort_order: number;
};

/**
 * Lot spot record from database.
 */
export type LotSpotRecord = {
  id: string;
  label: string;
  zone_id: string;
};

/**
 * Normalize a name for comparison.
 * - Lowercase
 * - Remove extra whitespace
 * - Remove common punctuation
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,'-]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Tokenize a name into individual words for comparison.
 */
export function tokenize(name: string): string[] {
  return normalizeName(name).split(" ").filter(Boolean);
}

/**
 * Calculate Jaccard similarity between two token sets.
 * Returns a value between 0 and 1.
 */
export function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }
  
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  
  return intersection / union;
}

/**
 * Simple Levenshtein distance (edit distance) between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Optimize: ensure 'a' is the shorter string to minimize space usage
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const aLen = a.length;
  const bLen = b.length;

  // Use two rows instead of full matrix: O(min(n,m)) space instead of O(n*m)
  let prevRow = new Array<number>(aLen + 1);
  let currRow = new Array<number>(aLen + 1);

  // Initialize first row
  for (let j = 0; j <= aLen; j++) {
    prevRow[j] = j;
  }

  // Fill rows
  for (let i = 1; i <= bLen; i++) {
    currRow[0] = i;

    for (let j = 1; j <= aLen; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        currRow[j] = prevRow[j - 1]!;
      } else {
        currRow[j] = Math.min(
          prevRow[j - 1]! + 1, // substitution
          currRow[j - 1]! + 1, // insertion
          prevRow[j]! + 1      // deletion
        );
      }
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[aLen]!;
}

/**
 * Calculate string similarity based on Levenshtein distance.
 * Returns a value between 0 and 1.
 */
export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Result of driver resolution attempt.
 */
export type DriverResolutionResult = {
  resolved: boolean;
  driverId: string | null;
  matchType: "exact" | "alias" | "fuzzy" | "new" | null;
  confidence: number;
  suggestions: DriverSuggestion[];
};

/**
 * Attempt to resolve a driver name to a driver ID.
 * 
 * Resolution priority:
 * 1. Exact match on display_name
 * 2. Exact match on normalized alias
 * 3. Fuzzy match with high confidence
 * 
 * @param inputName - The driver name from the import
 * @param drivers - All active drivers
 * @param aliases - All driver aliases
 * @param fuzzyThreshold - Minimum similarity score for fuzzy match (default 0.7)
 */
export function resolveDriverName(
  inputName: string,
  drivers: DriverRecord[],
  aliases: DriverAliasRecord[],
  fuzzyThreshold = 0.7
): DriverResolutionResult {
  if (!inputName || !inputName.trim()) {
    return {
      resolved: false,
      driverId: null,
      matchType: null,
      confidence: 0,
      suggestions: [],
    };
  }

  const normalizedInput = normalizeName(inputName);
  const inputTokens = tokenize(inputName);

  // Build driver lookup map for O(1) access instead of O(n) find() calls
  const driverMap = new Map<string, DriverRecord>();
  for (const driver of drivers) {
    driverMap.set(driver.id, driver);
  }

  // 1. Exact match on display_name
  for (const driver of drivers) {
    if (driver.active && normalizeName(driver.display_name) === normalizedInput) {
      return {
        resolved: true,
        driverId: driver.id,
        matchType: "exact",
        confidence: 1,
        suggestions: [],
      };
    }
  }

  // 2. Exact match on alias
  for (const alias of aliases) {
    if (alias.normalized_alias === normalizedInput) {
      const driver = driverMap.get(alias.driver_id);
      if (driver && driver.active) {
        return {
          resolved: true,
          driverId: driver.id,
          matchType: "alias",
          confidence: 1,
          suggestions: [],
        };
      }
    }
  }

  // 3. Fuzzy matching - collect candidates with scores
  const candidates: DriverSuggestion[] = [];
  // Track seen driver IDs for deduplication
  const seenDriverIds = new Set<string>();

  for (const driver of drivers) {
    if (!driver.active) continue;

    const driverTokens = tokenize(driver.display_name);
    const tokenSimilarity = jaccardSimilarity(inputTokens, driverTokens);
    const editSimilarity = stringSimilarity(normalizedInput, normalizeName(driver.display_name));
    
    // Weighted average of both metrics
    const confidence = tokenSimilarity * 0.4 + editSimilarity * 0.6;

    if (confidence >= fuzzyThreshold * 0.8) {
      candidates.push({
        id: driver.id,
        display_name: driver.display_name,
        confidence,
        matchType: "fuzzy",
      });
      seenDriverIds.add(driver.id);
    }
  }

  // Also check aliases for fuzzy matches
  for (const alias of aliases) {
    const aliasSimilarity = stringSimilarity(normalizedInput, alias.normalized_alias);
    if (aliasSimilarity >= fuzzyThreshold) {
      const driver = driverMap.get(alias.driver_id);
      if (driver && driver.active) {
        // Don't add duplicates - use Set lookup O(1) instead of array.some() O(n)
        if (!seenDriverIds.has(driver.id)) {
          candidates.push({
            id: driver.id,
            display_name: driver.display_name,
            confidence: aliasSimilarity,
            matchType: "alias",
          });
          seenDriverIds.add(driver.id);
        }
      }
    }
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  // If top candidate has high enough confidence, auto-resolve
  if (candidates.length > 0 && candidates[0]!.confidence >= fuzzyThreshold) {
    return {
      resolved: true,
      driverId: candidates[0]!.id,
      matchType: "fuzzy",
      confidence: candidates[0]!.confidence,
      suggestions: candidates.slice(0, 5),
    };
  }

  // Return unresolved with suggestions
  return {
    resolved: false,
    driverId: null,
    matchType: null,
    confidence: 0,
    suggestions: candidates.slice(0, 5),
  };
}

/**
 * Resolve a van by label or VIN.
 */
export function resolveVan(
  labelOrVin: string | null,
  vans: VanRecord[]
): { resolved: boolean; vanId: string | null } {
  if (!labelOrVin || !labelOrVin.trim()) {
    return { resolved: false, vanId: null };
  }

  const normalized = labelOrVin.trim().toLowerCase();

  // Try exact label match first
  for (const van of vans) {
    if (van.active && van.label.toLowerCase() === normalized) {
      return { resolved: true, vanId: van.id };
    }
  }

  // Try VIN match (partial match on last 4-8 characters is common)
  for (const van of vans) {
    if (van.active && van.vin) {
      const vinLower = van.vin.toLowerCase();
      if (vinLower === normalized || vinLower.endsWith(normalized)) {
        return { resolved: true, vanId: van.id };
      }
    }
  }

  return { resolved: false, vanId: null };
}

/**
 * Resolve a pad by name or sort_order.
 */
export function resolvePad(
  padInput: string | null,
  pads: PadRecord[]
): { resolved: boolean; padId: string | null } {
  if (!padInput || !padInput.trim()) {
    return { resolved: false, padId: null };
  }

  const input = padInput.trim();

  // Try exact name match
  for (const pad of pads) {
    if (pad.name.toLowerCase() === input.toLowerCase()) {
      return { resolved: true, padId: pad.id };
    }
  }

  // Try as numeric sort_order
  const asNumber = parseInt(input, 10);
  if (!isNaN(asNumber)) {
    for (const pad of pads) {
      if (pad.sort_order === asNumber) {
        return { resolved: true, padId: pad.id };
      }
    }
  }

  return { resolved: false, padId: null };
}

/**
 * Resolve a lot spot by label.
 */
export function resolveLotSpot(
  spotLabel: string | null,
  spots: LotSpotRecord[]
): { resolved: boolean; lotSpotId: string | null } {
  if (!spotLabel || !spotLabel.trim()) {
    return { resolved: false, lotSpotId: null };
  }

  const normalized = spotLabel.trim().toLowerCase();

  for (const spot of spots) {
    if (spot.label.toLowerCase() === normalized) {
      return { resolved: true, lotSpotId: spot.id };
    }
  }

  return { resolved: false, lotSpotId: null };
}
