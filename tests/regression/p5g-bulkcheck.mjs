import { signIn, dbQuery } from "./common.mjs";
import { cleanupP5g, bulk, PFX } from "./p5g-fixtures.mjs";
const admin = await signIn("admin");
const idOf = (sql) => dbQuery(sql)[0].id;
try {
  const c = idOf(`insert into clients (name) values ('${PFX}Bulk Check') returning id`);
  const sA = idOf(`insert into sites (client_id, name) values ('${c}', 'Site A') returning id`);
  const sB = idOf(`insert into sites (client_id, name) values ('${c}', 'Site B') returning id`);
  const p = idOf(`insert into projects (client_id, name, status) values ('${c}', '${PFX}Bulk Check', 'active') returning id`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${sA}'), ('${p}', '${sB}'); insert into project_frameworks (project_id, framework_id) select '${p}', id from frameworks where code in ('ISO 9001','ISO 14001');`);
  const t = Date.now();
  bulk(p, 12, sA, sB);
  console.log("bulk ok", Date.now() - t, "ms", JSON.stringify(dbQuery(`select (select count(*) from documents where project_id='${p}')::int d, (select count(*) from issues where project_id='${p}')::int i, (select count(*) from verification_items where project_id='${p}')::int vi`)[0]));
} catch (e) { console.log("ERROR", String(e.stderr ?? e.message).slice(0, 800)); }
finally { await cleanupP5g(admin.token); console.log("cleaned"); }
