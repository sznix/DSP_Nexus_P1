/**
 * POST /api/import-airlock/create
 *
 * Create a new import batch with raw data.
 * Requires admin or manager role.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CreateImportRequest, RawDataRow } from "@/lib/import-airlock";

export async function POST(request: Request) {
  try {
    // Enforce admin/manager role
    const user = await requireRole(["admin", "manager"]);

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { workDate, sourceType, sourceFilename, rawData, rawHeaders } =
      body as CreateImportRequest;

    // Validate required fields
    if (!workDate || !sourceType || !rawData || !rawHeaders) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required fields: workDate, sourceType, rawData, rawHeaders",
        },
        { status: 400 }
      );
    }

    // Validate workDate format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      return NextResponse.json(
        { ok: false, error: "Invalid workDate format. Expected YYYY-MM-DD" },
        { status: 400 }
      );
    }

    // Validate sourceType
    if (!["upload", "clipboard", "manual"].includes(sourceType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid sourceType. Expected upload, clipboard, or manual" },
        { status: 400 }
      );
    }

    // Validate rawData is an array
    if (!Array.isArray(rawData)) {
      return NextResponse.json(
        { ok: false, error: "rawData must be an array" },
        { status: 400 }
      );
    }

    // Validate rawHeaders is an array
    if (!Array.isArray(rawHeaders)) {
      return NextResponse.json(
        { ok: false, error: "rawHeaders must be an array of strings" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check for existing pending/mapped batches for the same date
    const { data: existingBatches } = await supabase
      .from("import_batches")
      .select("id, status")
      .eq("tenant_id", user.tenantId)
      .eq("work_date", workDate)
      .in("status", ["pending", "mapped", "diffed"])
      .limit(1);

    if (existingBatches && existingBatches.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `An import batch for ${workDate} is already in progress`,
          existingBatchId: existingBatches[0]?.id,
        },
        { status: 409 }
      );
    }

    // Create the import batch
    const { data: batch, error: insertError } = await supabase
      .from("import_batches")
      .insert({
        tenant_id: user.tenantId,
        work_date: workDate,
        status: "pending",
        source_type: sourceType,
        source_filename: sourceFilename ?? null,
        raw_data: rawData as unknown as RawDataRow[],
        raw_headers: rawHeaders,
        created_by: user.userId,
      })
      .select("id, status, work_date, created_at")
      .single();

    if (insertError) {
      console.error("[import-airlock/create] Insert failed", insertError);
      return NextResponse.json(
        { ok: false, error: "Failed to create import batch" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: batch.id,
        status: batch.status,
        workDate: batch.work_date,
        rowCount: rawData.length,
        createdAt: batch.created_at,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;

    console.error("[import-airlock/create] Unhandled error", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
