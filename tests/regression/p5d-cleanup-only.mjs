import { signIn } from "./common.mjs";
import { cleanupP5d } from "./p5d-fixtures.mjs";
const admin = await signIn("admin");
console.log("removed objects:", await cleanupP5d(admin.token));
