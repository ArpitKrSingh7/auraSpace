/** JSON object key order is not stable in portable manifests. */
export function canonicalJson(value:unknown):string{return JSON.stringify(value,(_key,current)=>current&&typeof current==='object'&&!Array.isArray(current)?Object.fromEntries(Object.entries(current).sort(([a],[b])=>a.localeCompare(b))):current);}
