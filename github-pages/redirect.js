// Hawks Lunch moved to Netlify. Sends any page on the old address to the same page there.
(function () {
  var NEW = "https://hawkslunch.netlify.app";
  var path = location.pathname.replace(/index\.html$/, "");
  if (!/^\/(google\/|flyer\.html)?$/.test(path)) path = "/";
  location.replace(NEW + path + location.hash);
})();
