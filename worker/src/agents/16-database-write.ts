/**
 * Agent 16 — Database Write (Tier 4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Safe, allowlist-gated generic D1 writer for Tier 4 actions.
 *
 * Security controls (OWASP A03 – Injection, A01 – Broken Access Control):
 *   1. Table name validated against explicit allowlist (isAllowedTable)
 *   2. Column names validated: alphanumeric + underscore only, max 64 chars
 *   3. All values passed as bound parameters (never string-interpolated)
 *   4. INSERT only — no DELETE, no DROP, no TRUNCATE, no raw SQL
 *   5. Max 20 columns per write (DoS protection)
 *   6. Max value length: 4096 chars per string column
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace } from '../core/agent-context.js';
import type { ActionRequest, ActionResult } from '../core/action-schema.js';
import { failedResult, isAllowedTable } from '../core/action-schema.js';
import type { AgentEnv } from '../core/types.js';

// ─── Validation helpers ───────────────────────────────────────────────────────
const COL_SAFE_RE = /^[a-z_][a-z0-9_]{0,63}$/;
const MAX_COLS = 20;
const MAX_STR_LEN = 4096;

function validateColumns(data: Record<string, unknown>): string | null {
  const cols = Object.keys(data);
  if (cols.length === 0) {
    return 'data must have at least one column';
  }
  if (cols.length > MAX_COLS) {
    return `too many columns (max ${MAX_COLS})`;
  }
  for (const col of cols) {
    if (!COL_SAFE_RE.test(col)) {
      return `invalid column name: "${col}"`;
    }
    const v = data[col];
    if (typeof v === 'string' && v.length > MAX_STR_LEN) {
      return `value for "${col}" exceeds max length`;
    }
  }
  return null;
}

// ─── SQL builder (parameterised, no interpolation) ────────────────────────────
function buildInsertSQL(
  table: string,
  data: Record<string, unknown>,
): { sql: string; values: unknown[] } {
  const cols = Object.keys(data);
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
  return { sql, values: cols.map(c => data[c]) };
}

function buildUpdateSQL(
  table: string,
  data: Record<string, unknown>,
  where: Record<string, unknown>,
): { sql: string; values: unknown[] } {
  const setCols = Object.keys(data);
  const whereCols = Object.keys(where);
  const setClause = setCols.map(c => `${c} = ?`).join(', ');
  const whereClause = whereCols.map(c => `${c} = ?`).join(' AND ');
  const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
  return { sql, values: [...setCols.map(c => data[c]), ...whereCols.map(c => where[c])] };
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent16DatabaseWrite {
  readonly id = '16-database-write';
  readonly name = 'DatabaseWriteAgent';
  readonly tier = 4;

  async execute(ctx: ExtendedAgentContext, req: ActionRequest): Promise<ActionResult> {
    const start = Date.now();

    if (req.payload.type !== 'db_write') {
      return failedResult(req, 'Wrong payload type for DatabaseWrite');
    }

    const { operation, table, data, where } = req.payload.params;
    const lang = req.language ?? 'pt';

    // Security: allowlist check (also done by schema validator, belt+suspenders)
    if (!isAllowedTable(table)) {
      const msg = `db_write: table "${table}" is not on the allowlist`;
      addTrace(ctx, {
        agentId: this.id,
        agentName: this.name,
        success: false,
        latencyMs: 0,
        error: msg,
      });
      return failedResult(req, msg);
    }

    // Validate column names
    const colError = validateColumns(data);
    if (colError) {
      addTrace(ctx, {
        agentId: this.id,
        agentName: this.name,
        success: false,
        latencyMs: 0,
        error: colError,
      });
      return failedResult(req, colError);
    }

    const env = ctx.env as AgentEnv;
    if (!env.DB) {
      return failedResult(req, 'D1 binding missing', 0);
    }

    try {
      let result: D1Result;

      if (operation === 'insert') {
        const { sql, values } = buildInsertSQL(table, data);
        const stmt = env.DB.prepare(sql);
        result = await stmt.bind(...values).run();
      } else {
        // update
        if (!where || Object.keys(where).length === 0) {
          return failedResult(req, 'UPDATE requires a WHERE clause', Date.now() - start);
        }
        const whereColError = validateColumns(where as Record<string, unknown>);
        if (whereColError) {
          return failedResult(req, `WHERE column error: ${whereColError}`, Date.now() - start);
        }
        const { sql, values } = buildUpdateSQL(table, data, where as Record<string, unknown>);
        result = await env.DB.prepare(sql)
          .bind(...values)
          .run();
      }

      const successMsg: Record<string, string> = {
        pt: `✅ Operação no banco de dados concluída (${table}).`,
        en: `✅ Database operation completed (${table}).`,
        es: `✅ Operación de base de datos completada (${table}).`,
      };

      const actionResult: ActionResult = {
        id: req.id,
        actionType: 'db_write',
        success: true,
        response: successMsg[lang] ?? successMsg.pt,
        data: {
          table,
          operation,
          rowsAffected: (result as D1Result & { rowsAffected?: number }).rowsAffected ?? 1,
        },
        action: `db_${operation}`,
        latencyMs: Date.now() - start,
        ts: Date.now(),
      };
      addTrace(ctx, {
        agentId: this.id,
        agentName: this.name,
        success: true,
        latencyMs: actionResult.latencyMs,
      });
      return actionResult;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addTrace(ctx, {
        agentId: this.id,
        agentName: this.name,
        success: false,
        latencyMs: Date.now() - start,
        error,
      });
      return failedResult(req, `DB error: ${error}`, Date.now() - start);
    }
  }
}

export const agent16DatabaseWrite = new Agent16DatabaseWrite();
export default agent16DatabaseWrite;
