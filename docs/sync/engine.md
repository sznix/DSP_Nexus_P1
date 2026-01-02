# Offline Sync Engine - v0

## Decision: RxDB

**Chosen engine:** RxDB with IndexedDB backend

**Rationale:**
- Self-contained (no external services or costs)
- Mature library with TypeScript support
- Built-in reactive queries (integrates well with React)
- IndexedDB adapter works in all modern browsers
- Flexible replication that works with custom endpoints

**Alternatives considered:**
- PowerSync: Requires managed service subscription
- ElectricSQL: More complex setup, better for full DB mirroring
- Custom idb + outbox: More code to maintain

---

## Sync Protocol

### Pull (Server → Client)

```
POST /api/sync/pull
Authorization: Cookie-based session

Request:
{
  "date": "2024-01-15",        // Required: YYYY-MM-DD
  "checkpoint": "2024-01-15T10:30:00Z",  // Optional: last sync timestamp
  "limit": 100                 // Optional: max records (default 100)
}

Response:
{
  "assignments": [...],        // Denormalized assignment records
  "checkpoint": "2024-01-15T11:00:00Z",  // New checkpoint
  "hasMore": false             // True if more records exist
}
```

### Push (Client → Server)

```
POST /api/sync/push
Authorization: Cookie-based session

Request:
{
  "mutations": [
    {
      "id": "uuid",            // Mutation ID (idempotency key)
      "assignment_id": "uuid", // Target assignment
      "patch": { ... },        // PATCH payload (whitelist enforced)
      "timestamp": 1704067200000  // Client epoch ms
    }
  ]
}

Response:
{
  "results": [
    {
      "mutation_id": "uuid",
      "status": "accepted" | "rejected" | "conflict",
      "error": "...",          // If rejected
      "server_doc": { ... }    // If conflict, latest server state
    }
  ]
}
```

---

## Conflict Resolution

**Strategy: Last-Write-Wins (LWW)**

1. If `client_timestamp > server_updated_at` → Apply client patch
2. If `client_timestamp <= server_updated_at` → Return `conflict`
3. On conflict, client receives latest server state and can retry

**Field ownership:**
- Server authoritative: id, tenant_id, day_date, van_id, driver_id, lot_spot_id, pad, dispatch_time
- Client can modify: DISPATCHER_PATCHABLE_COLUMNS only

---

## Local Storage Schema

**Collections:**
1. `assignments` - Denormalized daily_assignments with joined data
2. `mutations` - Outbox queue for pending patches

**Sync metadata per document:**
- `updated_at`: Server timestamp (ISO string)
- `_local_updated_at`: Local mutation timestamp (epoch ms)
- `_pending_sync`: Boolean flag for unsynced changes
