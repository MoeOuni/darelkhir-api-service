import { StockMovementRepository } from '@/repositories/StockMovementRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { StockMovementEntity } from '@/entities/StockMovementEntity';
import { AuditLogEntity } from '@/entities/AuditLogEntity';
import { DataType, StockMovementType } from '@libs/enums';
import { IdGenerator } from '@/utils/IdGenerator';
import type { AuthUser } from '@libs/interfaces';

/**
 * The journal: stock history and the audit trail.
 *
 * Both writes are best-effort. A sale must never fail because the history could
 * not be written, so every failure is logged and swallowed. That is a deliberate
 * trade: a missing journal row is recoverable, a lost order is not.
 */

/** Fields that must never reach the audit trail. */
const REDACTED_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'refreshToken',
  'accessToken',
  'idToken',
  'code',
  'secret',
]);

/** Removes credentials from a request body before it is stored. */
export function sanitizeDetails(value: unknown, depth = 0): any {
  if (depth > 4 || value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitizeDetails(v, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key) ? '[redacted]' : sanitizeDetails(v, depth + 1);
    }
    return out;
  }

  if (typeof value === 'string' && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }

  return value;
}

type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  actor?: AuthUser;
  method?: string;
  path?: string;
  statusCode?: number;
  details?: Record<string, any>;
  meta?: Record<string, any>;
  searchKey?: string;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const now = new Date().toISOString();
    const uuid = IdGenerator.generate();

    await new AuditLogRepository().create(
      new AuditLogEntity({
        id: DataType.AUDIT_LOG,
        sk: `${DataType.AUDIT_LOG}#${uuid}`,
        dataType: DataType.AUDIT_LOG,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary,
        actorId: input.actor?.sub,
        // Never the Cognito username here: it is a UUID, not a name.
        actorName: input.actor?.name || input.actor?.email || undefined,
        method: input.method,
        path: input.path,
        statusCode: input.statusCode,
        details: input.details ? sanitizeDetails(input.details) : undefined,
        meta: input.meta,
        searchKey: input.searchKey,
        createdAt: now,
        updatedAt: now,
      })
    );
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: 'WARN',
        message: 'Audit record failed',
        action: input.action,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

type StockMovementInput = {
  productId: string;
  productCode?: string;
  productName?: string;
  type: StockMovementType;
  availableDelta: number;
  availableAfter?: number;
  orderId?: string;
  orderNumber?: number;
  reason?: string;
  actor?: AuthUser;
};

export async function recordStockMovement(input: StockMovementInput): Promise<void> {
  try {
    const now = new Date().toISOString();
    const uuid = IdGenerator.generate();

    await new StockMovementRepository().create(
      new StockMovementEntity({
        id: DataType.STOCK_MOVEMENT,
        sk: `${DataType.STOCK_MOVEMENT}#${uuid}`,
        dataType: DataType.STOCK_MOVEMENT,
        productId: input.productId,
        productCode: input.productCode ?? '',
        productName: input.productName ?? '',
        type: input.type,
        availableDelta: input.availableDelta,
        availableAfter: input.availableAfter,
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        reason: input.reason,
        performedBy: input.actor?.sub,
        performedByName: input.actor?.name || input.actor?.email,
        createdAt: now,
        updatedAt: now,
      })
    );
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: 'WARN',
        message: 'Stock movement record failed',
        productId: input.productId,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

/** Writes one movement per order line, in parallel. */
export async function recordStockMovements(inputs: StockMovementInput[]): Promise<void> {
  await Promise.all(inputs.map((i) => recordStockMovement(i)));
}
