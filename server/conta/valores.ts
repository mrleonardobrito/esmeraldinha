import type { MiddlewareHandler } from 'hono';
import type { ContaEnv } from './autenticacao';
import { canReadFinancialValues } from '../modules/identity';

const financialFields = new Set(['valorRecebido', 'valorAReceber', 'valorRecebidoTotal', 'valorAReceberTotal']);

function omitFinancialFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitFinancialFields);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !financialFields.has(key)).map(([key, child]) => [key, omitFinancialFields(child)]));
  }
  return value;
}

/** Financial fields are exclusively available to the management account. */
export const restringirValores: MiddlewareHandler<ContaEnv> = async (context, next) => {
  await next();
  if (canReadFinancialValues(context.get('identidade'))) return;
  if (!context.res.headers.get('Content-Type')?.includes('application/json')) return;
  const body: unknown = await context.res.json();
  context.res = new Response(JSON.stringify(omitFinancialFields(body)), {
    status: context.res.status,
    headers: context.res.headers,
  });
  context.res.headers.delete('Content-Length');
};
