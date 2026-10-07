import { syncConnector } from "./scheduler.js";
if (process.argv[2] === "sync") console.log(await syncConnector(process.argv[3]));
else console.error("Usage: npm run sync [source-id]");
