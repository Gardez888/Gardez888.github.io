const LAT = 34.717;
const LON = -81.123;
const STORAGE_KEY = "tinas-back-events-v1";
const $ = (id) => document.getElementById(id);
const toast = (msg) => {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
};
const EVENT_ONE = {
  id: "event-1-2026-08-26",
  when: "2026-08-26T10:31:00-04:00",
  pain: 4,
  notes: "I know rain is coming. Back hurts and tired.",
  createdAt: "2026-08-26T11:33:00-04:00",
  weather: null
};
function loadEvents() {
  let events = [];
  try { events = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { events = []; }
  const found = events.find(function(e) { return e.id === EVENT_ONE.id; });
  if (!found) {
    events.push(Object.assign({}, EVENT_ONE));
    saveEvents(events);
  } else {
    found.when = EVENT_ONE.when;
    found.pain = EVENT_ONE.pain;
    found.notes = EVENT_ONE.notes;
    saveEvents(events);
  }
  return events;
}
function saveEvents(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}
function pad(n) { return String(n).padStart(2, "0"); }
function toLocalInputValue(d) {
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function fmtWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function inch(mm) {
  return (Number(mm) / 25.4).toFixed(2);
}
const scale = $("pain-scale");
for (let i = 1; i <= 10; i++) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = i;
  if (i === 4) { b.classList.add("baseline"); b.title = "Baseline — she knows rain is coming"; }
  b.addEventListener("click", function() {
    $("pain").value = String(i);
    Array.prototype.forEach.call(scale.children, function(x) { x.classList.toggle("on", x === b); });
  });
  scale.appendChild(b);
}
$("use-now").addEventListener("click", function() { $("when").value = toLocalInputValue(new Date()); });
$("when").value = toLocalInputValue(new Date());
async function fetchPrecipWindow(startIso) {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + 72 * 3600 * 1000);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON + "&hourly=precipitation&start_date=" + startDate + "&end_date=" + endDate + "&timezone=America%2FNew_York";
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather unavailable");
  const data = await res.json();
  const times = (data.hourly && data.hourly.time) || [];
  const precip = (data.hourly && data.hourly.precipitation) || [];
  let mmTotal = 0, mmPast = 0, firstRain = null, firstPast = null;
  const now = Date.now();
  const startMs = start.getTime();
  const endMs = end.getTime();
  times.forEach(function(t, i) {
    const ms = new Date(t).getTime();
    if (ms >= startMs && ms <= endMs) {
      const mm = Number(precip[i] || 0);
      mmTotal += mm;
      if (ms <= now) {
        mmPast += mm;
        if (mm > 0.1 && !firstPast) firstPast = t;
      }
      if (mm > 0.1 && !firstRain) firstRain = t;
    }
  });
  return {
    mm: Math.round(mmTotal * 10) / 10,
    mmPast: Math.round(mmPast * 10) / 10,
    firstRain: firstRain,
    firstPast: firstPast,
    windowClosed: now >= endMs,
    rained: mmPast > 0.2
  };
}
function weatherBadge(ev) {
  const w = ev.weather;
  if (!w) return '<span class="badge wait">checking sky…</span>';
  if (w.error) return '<span class="badge err">weather check failed</span>';
  if (w.rained) {
    const when = w.firstPast ? (" first rain " + fmtWhen(w.firstPast)) : "";
    return '<span class="badge yes">rained · ' + w.mmPast + ' mm (' + inch(w.mmPast) + ' in)</span><div class="meta">' + when + '</div>';
  }
  if (w.windowClosed) return '<span class="badge no">no rain in 72 hours</span>';
  if (w.mm > 0.2 && w.firstRain) {
    return '<span class="badge wait">watching · models show ' + w.mm + ' mm (' + inch(w.mm) + ' in)</span><div class="meta">forecast first rain ' + fmtWhen(w.firstRain) + ' · not on the ground yet</div>';
  }
  return '<span class="badge wait">watching · 0 mm on the ground so far</span>';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return ({ "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;" })[c];
  });
}
function render() {
  const events = loadEvents().sort(function(a,b) {
    if (a.id === EVENT_ONE.id) return -1;
    if (b.id === EVENT_ONE.id) return 1;
    return new Date(b.when) - new Date(a.when);
  });
  const box = $("ledger");
  if (!events.length) { box.innerHTML = '<p class="hint">No events yet.</p>'; return; }
  box.innerHTML = events.map(function(ev) {
    const isOne = ev.id === EVENT_ONE.id;
    const tag = Number(ev.pain) >= 4 ? '<div class="signal">I know</div>' : '<div class="signal" style="color:var(--muted)">logged</div>';
    const notes = ev.notes ? ('<div class="notes">' + escapeHtml(ev.notes) + '</div>') : '';
    const closes = fmtWhen(new Date(new Date(ev.when).getTime() + 72*3600*1000).toISOString());
    const title = isOne ? 'Event 1 · Tina’s texts · 10:31 AM' : fmtWhen(ev.when);
    const meta = isOne ? 'Chester, SC · clock started 10:31 AM · closes Sat 10:31 AM' : ('Chester, SC · window closes ' + closes);
    return '<article class="event"><div class="event-top"><div><div class="when">' + title + '</div><div class="meta">' + meta + '</div></div><div class="score">' + ev.pain + '<span style="font-size:14px;color:var(--muted)">/10</span>' + tag + '</div></div>' + notes + '<div class="weather">' + weatherBadge(ev) + '</div></article>';
  }).join('');
}
async function refreshWeather() {
  const events = loadEvents();
  let changed = false;
  for (const ev of events) {
    if (ev.weather && ev.weather.windowClosed && !ev.weather.error) continue;
    try { ev.weather = await fetchPrecipWindow(ev.when); changed = true; }
    catch (e) { ev.weather = { error: true }; changed = true; }
  }
  if (changed) saveEvents(events);
  render();
}
$("event-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  const pain = $("pain").value;
  if (!pain) { toast("Pick a pain level 1–10"); return; }
  const ev = { id: crypto.randomUUID(), when: new Date($("when").value).toISOString(), pain: Number(pain), notes: $("notes").value.trim(), createdAt: new Date().toISOString(), weather: null };
  const events = loadEvents();
  events.push(ev);
  saveEvents(events);
  $("notes").value = "";
  toast("Event recorded. Watching the sky.");
  render();
  try { ev.weather = await fetchPrecipWindow(ev.when); saveEvents(events); render(); }
  catch (e) { ev.weather = { error: true }; saveEvents(events); render(); }
});
render();
refreshWeather();
