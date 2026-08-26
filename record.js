const LAT = 34.717;
const LON = -81.123;
const STORAGE_KEY = "tinas-back-events-v2";
const SHARED_URL = "events.json";
function $(id) { return document.getElementById(id); }
function toast(msg) {
  var el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(function() { el.classList.remove("show"); }, 2600);
}
function escapeHtml(s) {
  var out = "";
  s = String(s);
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === "&") out += "&#38;";
    else if (c === "<") out += "&#60;";
    else if (c === ">") out += "&#62;";
    else if (c === "\x22") out += "&#34;";
    else if (c === "'") out += "&#39;";
    else out += c;
  }
  return out;
}
const EVENT_ONE = {
  id: "event-1-2026-08-26",
  when: "2026-08-26T10:31:00-04:00",
  pain: 4,
  notes: "I know rain is coming. Back hurts and tired.",
  source: "shared",
  shared: true
};
function readLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch (e) { return []; }
}
function saveLocal(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}
var cache = [EVENT_ONE];
function loadEvents() { return cache.slice(); }
function merge(shared, local) {
  var map = {};
  var list = [];
  function add(ev, sharedFlag) {
    if (!ev || !ev.id || map[ev.id]) return;
    ev.shared = !!sharedFlag || ev.source === "shared" || ev.source === "chat" || ev.source === "tina-texts";
    map[ev.id] = true;
    list.push(ev);
  }
  add(EVENT_ONE, true);
  for (var i = 0; i < (shared || []).length; i++) add(shared[i], true);
  for (var j = 0; j < (local || []).length; j++) add(local[j], false);
  return list;
}
async function pullShared() {
  var res = await fetch(SHARED_URL + "?t=" + Date.now());
  if (!res.ok) throw new Error("book");
  var data = await res.json();
  cache = merge(data.events || [], readLocal());
  saveLocal(cache);
}
function pad(n) { return String(n).padStart(2, "0"); }
function toLocalInputValue(d) {
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function fmtWhen(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function inch(mm) { return (Number(mm) / 25.4).toFixed(2); }
var scale = $("pain-scale");
if (scale) {
  for (var n = 1; n <= 10; n++) {
    (function(num) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = String(num);
      if (num === 4) b.classList.add("baseline");
      b.addEventListener("click", function() {
        $("pain").value = String(num);
        var kids = scale.children;
        for (var k = 0; k < kids.length; k++) kids[k].classList.toggle("on", kids[k] === b);
      });
      scale.appendChild(b);
    })(n);
  }
}
if ($("use-now")) {
  $("use-now").addEventListener("click", function() {
    $("when").value = toLocalInputValue(new Date());
  });
}
if ($("when")) $("when").value = toLocalInputValue(new Date());
if ($("reload-book")) {
  $("reload-book").addEventListener("click", async function() {
    try { await pullShared(); toast("Shared book updated."); render(); refreshWeather(); }
    catch (e) { toast("Could not refresh."); }
  });
}
async function fetchPrecipWindow(startIso) {
  var start = new Date(startIso);
  var end = new Date(start.getTime() + 72 * 3600 * 1000);
  var url = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON + "&hourly=precipitation&start_date=" + start.toISOString().slice(0,10) + "&end_date=" + end.toISOString().slice(0,10) + "&timezone=America%2FNew_York";
  var res = await fetch(url);
  if (!res.ok) throw new Error("weather");
  var data = await res.json();
  var times = (data.hourly && data.hourly.time) || [];
  var precip = (data.hourly && data.hourly.precipitation) || [];
  var mmTotal = 0, mmPast = 0, firstRain = null, firstPast = null;
  var now = Date.now();
  for (var i = 0; i < times.length; i++) {
    var ms = new Date(times[i]).getTime();
    if (ms >= start.getTime() && ms <= end.getTime()) {
      var mm = Number(precip[i] || 0);
      mmTotal += mm;
      if (ms <= now) {
        mmPast += mm;
        if (mm > 0.1 && !firstPast) firstPast = times[i];
      }
      if (mm > 0.1 && !firstRain) firstRain = times[i];
    }
  }
  return { mm: Math.round(mmTotal * 10) / 10, mmPast: Math.round(mmPast * 10) / 10, firstRain: firstRain, firstPast: firstPast, windowClosed: now >= end.getTime(), rained: mmPast > 0.2 };
}
function weatherBadge(ev) {
  var w = ev.weather;
  if (!w) return '<span class="badge wait">checking sky...</span>';
  if (w.error) return '<span class="badge err">weather check failed</span>';
  if (w.rained) return '<span class="badge yes">rained - ' + w.mmPast + ' mm (' + inch(w.mmPast) + ' in)</span>';
  if (w.windowClosed) return '<span class="badge no">no rain in 72 hours</span>';
  if (w.mm > 0.2 && w.firstRain) return '<span class="badge wait">watching - models show ' + w.mm + ' mm (' + inch(w.mm) + ' in)</span><div class="meta">forecast first rain ' + fmtWhen(w.firstRain) + '</div>';
  return '<span class="badge wait">watching - 0 mm on the ground so far</span>';
}
function render() {
  var events = loadEvents().sort(function(a,b) {
    if (a.id === EVENT_ONE.id) return -1;
    if (b.id === EVENT_ONE.id) return 1;
    return new Date(b.when) - new Date(a.when);
  });
  var box = $("ledger");
  var html = "";
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var isOne = ev.id === EVENT_ONE.id;
    var tag = Number(ev.pain) >= 4 ? '<div class="signal">I know</div>' : '<div class="signal" style="color:var(--muted)">logged</div>';
    var notes = ev.notes ? '<div class="notes">' + escapeHtml(ev.notes) + '</div>' : '';
    var closes = fmtWhen(new Date(new Date(ev.when).getTime() + 72*3600*1000).toISOString());
    var title = isOne ? 'Event 1 - Tina texts - 10:31 AM' : fmtWhen(ev.when);
    var where = ev.shared ? 'shared book' : 'this phone only';
    html += '<article class="event"><div class="event-top"><div><div class="when">' + title + '</div><div class="meta">Chester, SC - ' + where + ' - window closes ' + closes + '</div></div><div class="score">' + ev.pain + '<span style="font-size:14px;color:var(--muted)">/10</span>' + tag + '</div></div>' + notes + '<div class="weather">' + weatherBadge(ev) + '</div></article>';
  }
  box.innerHTML = html;
}
async function refreshWeather() {
  for (var i = 0; i < cache.length; i++) {
    try { cache[i].weather = await fetchPrecipWindow(cache[i].when); }
    catch (e) { cache[i].weather = { error: true }; }
  }
  render();
}
$("event-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var pain = $("pain").value;
  if (!pain) { toast("Pick a pain level 1-10"); return; }
  var ev = {
    id: "phone-" + Date.now(),
    when: new Date($("when").value).toISOString(),
    pain: Number(pain),
    notes: $("notes").value.trim(),
    source: "phone",
    shared: false
  };
  cache.push(ev);
  saveLocal(cache);
  $("notes").value = "";
  toast("Saved on this phone. Send the same line in chat to publish it.");
  render();
  try { ev.weather = await fetchPrecipWindow(ev.when); render(); } catch (err) {}
});
render();
pullShared().then(function() { render(); refreshWeather(); }).catch(function() { refreshWeather(); });
