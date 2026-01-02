/**
 * Smoke test for GET /api/dispatch/assignments endpoint.
 *
 * Usage:
 *   1. Start the dev server: npm run dev
 *   2. Run this script: npx tsx scripts/smoke.ts [--base-url=http://localhost:3000]
 *
 * Note: This requires an authenticated session. The script tests:
 *   - Valid date format returns 200 (requires auth)
 *   - Missing date returns 400
 *   - Invalid date format returns 400
 *
 * For full auth-required tests, use a browser or set up cookie-based auth.
 */

const BASE_URL = process.argv.find((a) => a.startsWith("--base-url="))
  ?.replace("--base-url=", "") ?? "http://localhost:3000";

const ENDPOINT = "/api/dispatch/assignments";

type TestResult = {
  name: string;
  passed: boolean;
  message: string;
};

const results: TestResult[] = [];

function log(message: string) {
  console.log(`[smoke] ${message}`);
}

function pass(name: string, message: string) {
  results.push({ name, passed: true, message });
  console.log(`  ✓ ${name}: ${message}`);
}

function fail(name: string, message: string) {
  results.push({ name, passed: false, message });
  console.log(`  ✗ ${name}: ${message}`);
}

async function testMissingDateParam() {
  const name = "Missing date parameter";
  try {
    const res = await fetch(`${BASE_URL}${ENDPOINT}`);
    if (res.status === 400) {
      const body = await res.json();
      if (body.error?.includes("Missing")) {
        pass(name, `400 with error: ${body.error}`);
      } else {
        fail(name, `400 but unexpected error message: ${body.error}`);
      }
    } else {
      fail(name, `Expected 400, got ${res.status}`);
    }
  } catch (err) {
    fail(name, `Request failed: ${err}`);
  }
}

async function testInvalidDateFormat() {
  const name = "Invalid date format";
  const invalidDates = [
    "2024-1-15",       // missing leading zeros
    "01-15-2024",      // wrong order
    "2024/01/15",      // wrong separator
    "2024-13-01",      // invalid month
    "2024-01-32",      // invalid day
    "not-a-date",      // garbage
    "2024-00-15",      // zero month
  ];

  for (const date of invalidDates) {
    try {
      const res = await fetch(`${BASE_URL}${ENDPOINT}?date=${encodeURIComponent(date)}`);
      if (res.status === 400) {
        const body = await res.json();
        if (body.error?.includes("Invalid")) {
          pass(`${name}: "${date}"`, `400 with error: ${body.error}`);
        } else {
          fail(`${name}: "${date}"`, `400 but unexpected error: ${body.error}`);
        }
      } else {
        fail(`${name}: "${date}"`, `Expected 400, got ${res.status}`);
      }
    } catch (err) {
      fail(`${name}: "${date}"`, `Request failed: ${err}`);
    }
  }
}

async function testValidDateNoAuth() {
  const name = "Valid date without auth";
  const date = "2024-01-15";
  try {
    const res = await fetch(`${BASE_URL}${ENDPOINT}?date=${date}`);
    // Without auth, should get 401
    if (res.status === 401) {
      pass(name, "401 Unauthorized as expected");
    } else if (res.status === 200) {
      // If we somehow have a session, that's also valid
      pass(name, "200 OK (session detected)");
    } else {
      fail(name, `Unexpected status ${res.status}`);
    }
  } catch (err) {
    fail(name, `Request failed: ${err}`);
  }
}

async function testCacheControlHeader() {
  const name = "Cache-Control header";
  try {
    // We'll check header even on error response
    const res = await fetch(`${BASE_URL}${ENDPOINT}?date=2024-01-15`);
    const cacheControl = res.headers.get("Cache-Control");
    if (cacheControl === "no-store") {
      pass(name, `Cache-Control: ${cacheControl}`);
    } else if (cacheControl?.includes("no-store")) {
      pass(name, `Cache-Control includes no-store: ${cacheControl}`);
    } else {
      fail(name, `Expected 'no-store', got: ${cacheControl}`);
    }
  } catch (err) {
    fail(name, `Request failed: ${err}`);
  }
}

async function testResponseShape() {
  const name = "Response shape validation";
  // This test requires authentication to get a 200 response
  // For now, we just verify the endpoint doesn't error on valid input format
  log("Note: Full response shape test requires authenticated request");
  try {
    const res = await fetch(`${BASE_URL}${ENDPOINT}?date=2024-01-15`);
    if (res.status === 200) {
      const body = await res.json();
      const hasDate = typeof body.date === "string";
      const hasAssignments = Array.isArray(body.assignments);
      const hasTopology = body.topology &&
        Array.isArray(body.topology.pads) &&
        Array.isArray(body.topology.zones) &&
        Array.isArray(body.topology.spots);

      if (hasDate && hasAssignments && hasTopology) {
        pass(name, `Valid shape: date=${body.date}, ${body.assignments.length} assignments`);
      } else {
        fail(name, `Missing fields: date=${hasDate}, assignments=${hasAssignments}, topology=${hasTopology}`);
      }
    } else if (res.status === 401) {
      pass(name, "Skipped (requires auth)");
    } else {
      fail(name, `Unexpected status: ${res.status}`);
    }
  } catch (err) {
    fail(name, `Request failed: ${err}`);
  }
}

async function main() {
  log(`Testing ${BASE_URL}${ENDPOINT}`);
  log("");

  await testMissingDateParam();
  await testInvalidDateFormat();
  await testValidDateNoAuth();
  await testCacheControlHeader();
  await testResponseShape();

  log("");
  log("=".repeat(50));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    log("");
    log("Failed tests:");
    results.filter((r) => !r.passed).forEach((r) => {
      log(`  - ${r.name}: ${r.message}`);
    });
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
