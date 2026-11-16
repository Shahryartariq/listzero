// Runs before the page paints so the saved theme is there from the first frame.
(function () {
  var choice = "system";
  try {
    var saved = JSON.parse(localStorage.getItem("listzero:v1") || "null");
    if (saved && saved.settings && (saved.settings.theme === "light" || saved.settings.theme === "dark")) {
      choice = saved.settings.theme;
    }
  } catch (e) {
    /* storage blocked: follow the system */
  }
  var dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#1b2726" : "#f1f2ec");
})();
