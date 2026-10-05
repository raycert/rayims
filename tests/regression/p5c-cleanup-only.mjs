import { signIn } from "./common.mjs";
import { cleanupP5c } from "./p5c-fixtures.mjs";
const admin = await signIn("admin");
console.log("removed objects:", await cleanupP5c(admin.token));
