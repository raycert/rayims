import { signIn } from "./common.mjs";
import { cleanupP5g } from "./p5g-fixtures.mjs";
const admin = await signIn("admin");
console.log("removed objects:", await cleanupP5g(admin.token));
