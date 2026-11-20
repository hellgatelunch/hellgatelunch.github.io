// Hawks Lunch moved to Netlify. Sends any page on the old address to the same page there.
(function () {
  var NEW = "https://hawkslunch.netlify.app";
  var path = location.pathname.replace(/index\.html$/, "");
  if (!/^\/(google\/|flyer\.html)?$/.test(path)) path = "/";
  // The main page gets ?from=old, so the app can tell a parent opening it from an icon added
  // at the old address that the icon can't get reminders (and how to swap it).
  location.replace(NEW + path + (path === "/" ? "?from=old" : "") + location.hash);
})();
