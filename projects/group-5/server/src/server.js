import { createApp } from "./app.js";
import { PORT } from "./config.js";
import { loadAuth } from "./auth.js";

const app = createApp({ auth: await loadAuth() });
app.listen(PORT, () => {
  console.log(`CampusDesk API listening on http://localhost:${PORT}`);
});
