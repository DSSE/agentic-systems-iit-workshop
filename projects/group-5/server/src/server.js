import { createApp } from "./app.js";
import { PORT } from "./config.js";

const app = createApp();
app.listen(PORT, () => {
  console.log(`CampusDesk API listening on http://localhost:${PORT}`);
});
