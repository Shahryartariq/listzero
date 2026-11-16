// Runs before the page paints so the saved look is there from the first frame.
// The colours below are each palette's page background (light, dark), used for the
// browser's own chrome. They mirror src/styles/themes.css; a test keeps them in step.
(function () {
  var PAPER = {
    chalk: ["#f1f2ec", "#1b2726"],
    sage: ["#ecf2e8", "#19251e"],
    sky: ["#eaf1f8", "#162133"],
    sand: ["#f4eee3", "#25211b"],
    lilac: ["#f0eef8", "#1e1b30"],
    rose: ["#f7eeec", "#2a1d1c"],
  };
  var choice = "system";
  var palette = "chalk";
  var large = false;
  try {
    var saved = JSON.parse(localStorage.getItem("listzero:v1") || "null");
    var s = saved && saved.settings;
    if (s) {
      if (s.theme === "light" || s.theme === "dark") choice = s.theme;
      if (Object.prototype.hasOwnProperty.call(PAPER, s.palette)) palette = s.palette;
      large = s.textSize === "large";
    }
  } catch (e) {
    /* storage blocked: follow the system */
  }
  var dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.palette = palette;
  if (large) root.dataset.text = "large";
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", PAPER[palette][dark ? 1 : 0]);
})();
