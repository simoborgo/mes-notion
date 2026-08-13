const { join } = require("path");

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Stesso path che oggi viene passato via PUPPETEER_CACHE_DIR nel comando di
  // deploy — qui lo legge sia `npm install` (download di Chromium) sia
  // `puppeteer.launch()` a runtime, senza bisogno di impostare la env var.
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
};
