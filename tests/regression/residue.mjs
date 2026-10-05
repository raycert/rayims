import { dbQuery } from "./common.mjs";
console.log(JSON.stringify(dbQuery(`select c.name, (select count(*) from projects p where p.client_id=c.id)::int projects from clients c order by c.name`)));
console.log(JSON.stringify(dbQuery(`select (select count(*) from issues)::int issues, (select count(*) from actions)::int actions, (select count(*) from attachments)::int att, (select count(*) from files)::int files, (select count(*) from storage.objects where bucket_id='rayims-files')::int objs, (select count(*) from verification_items)::int vi, (select count(*) from activities)::int acts`)));
