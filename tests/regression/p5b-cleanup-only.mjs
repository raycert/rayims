import { signIn } from "./common.mjs";
import { cleanupP5b } from "./p5b-fixtures.mjs";
const admin = await signIn("admin");
console.log("removed objects:", await cleanupP5b(admin.token));
