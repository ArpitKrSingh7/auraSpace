/** JSON object order is not preserved by PostgreSQL JSONB or portable manifests. */
export function canonicalJson(value:unknown):string{return JSON.stringify(value,(_key,current)=>current&&typeof current==='object'&&!Array.isArray(current)?Object.fromEntries(Object.entries(current).sort(([a],[b])=>a.localeCompare(b))):current);}
