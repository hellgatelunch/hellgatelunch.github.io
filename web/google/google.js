// The site's calendar feed, wherever the site is served from.
(function () {
  var base = location.host + location.pathname.replace(/google\/?(index\.html)?$/, "");
  var feed = base + "calendar.ics";
  var url = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent("webcal://" + feed);
  document.getElementById("add").href = url;
  // Google only adds calendars on a computer: on a phone, say so instead of opening a page that can't do it.
  if (/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)) {
    document.getElementById("body").hidden = true;
    document.getElementById("phone").hidden = false;
    document.getElementById("here").textContent = location.host + location.pathname.replace(/index\.html$/, "");
    document.getElementById("feed").textContent = location.protocol + "//" + feed;
  } else {
    location.href = url;
  }
})();
