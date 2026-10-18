import { createApp } from "./app";
import { createApprovalCode } from "./approval/session";
import { existsSync } from "node:fs";
import path from "node:path";

const envFile = path.join(__dirname, "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const approvalCode = createApprovalCode();
const app = createApp({ approvalCode });

app.listen(PORT, "127.0.0.1", () => {
  console.log(`SprintBoard backend listening on http://127.0.0.1:${PORT}`);
  console.log("Open http://127.0.0.1:3000 and enter this one-time approval setup code:");
  console.log(approvalCode);
});
