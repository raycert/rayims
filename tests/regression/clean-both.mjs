import { signIn, dbQuery } from "./common.mjs";
import { cleanupP4f } from "./p4f-fixtures.mjs";
import { cleanupP4e6 } from "./p4e6-fixtures.mjs";
const a = await signIn("admin");
console.log("p4f objs", await cleanupP4f(a.token), "p4e6 objs", await cleanupP4e6(a.token));
console.log(JSON.stringify(dbQuery(`select (select count(*) from clients)::int clients, (select count(*) from projects)::int projects, (select count(*) from issues)::int issues, (select count(*) from actions)::int actions, (select count(*) from attachments)::int att, (select count(*) from files)::int files, (select count(*) from storage.objects where bucket_id='rayims-files')::int objs`)));
