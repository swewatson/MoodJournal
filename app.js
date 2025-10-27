function $(selector) {
  return document.querySelector(selector);
}
function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

var todayEl = $("#today");
var noteEl = $("#note");
var entriesEl = $("#entries");
var rangeEl = $("#range");
var filterMoodEl = $("#filterMood");
var barCanvas = $("#bar");
var ctx = barCanvas.getContext("2d");

var STORAGE_KEY = "huenotes.v1";
var MOODS = ["Calm", "Happy", "Focused", "Anxious", "Tired"];
var MOOD_COLORS = {
  Calm: ["#60a5fa", "#93c5fd"],
  Happy: ["#f59e0b", "#fdba74"],
  Focused: ["#8b5cf6", "#a78bfa"],
  Anxious: ["#f43f5e", "#fb7185"],
  Tired: ["#9ca3af", "#cbd5e1"],
};

var selectedMood = null;
var state = loadState();

todayEl.textContent = new Date().toLocaleString(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

setupMoodChips();
render();

$("#save").addEventListener("click", onSaveEntry);
$("#export").addEventListener("click", onExport);
$("#clear").addEventListener("click", onClearAll);
rangeEl.addEventListener("change", render);
filterMoodEl.addEventListener("change", render);

function setupMoodChips() {
  var chips = $all(".chip");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      selectedMood = chip.getAttribute("data-mood");
      chips.forEach(function (c) {
        if (c === chip) {
          c.setAttribute("data-active", "true");
          c.setAttribute("aria-checked", "true");
        } else {
          c.removeAttribute("data-active");
          c.setAttribute("aria-checked", "false");
        }
      });
    });
  });
}

function onSaveEntry() {
  if (!selectedMood) {
    alert("Please choose a mood first.");
    return;
  }

  var noteText = (noteEl.value || "").trim();
  var now = new Date();

  var entry = {
    id: String(Date.now()),
    ts: now.toISOString(),
    mood: selectedMood,
    note: noteText,
  };

  state.entries.unshift(entry);
  saveState();
  noteEl.value = "";
  render();
}

function render() {
  var rangeValue = rangeEl.value;
  var daysWindow = rangeValue === "all" ? null : parseInt(rangeValue, 10);
  var moodFilter = filterMoodEl.value || "";

  var cutoff = null;
  if (daysWindow !== null) {
    cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysWindow);
  }

  var filtered = state.entries.filter(function (e) {
    var inRange = true;
    if (cutoff) {
      inRange = new Date(e.ts) >= cutoff;
    }
    var moodOk = !moodFilter || e.mood === moodFilter;
    return inRange && moodOk;
  });

  renderEntries(filtered);
  renderWeeklySummary();
}

function renderEntries(list) {
  if (!list.length) {
    entriesEl.innerHTML =
      '<div class="muted">No entries yet. Log a mood above to get started.</div>';
    return;
  }

  var html = "";
  list.forEach(function (e) {
    var dateLabel = new Date(e.ts).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    html +=
      '<div class="entry" data-id="' +
      e.id +
      '">' +
      '  <div class="entry-head">' +
      '    <span class="tag"><span class="swatch ' +
      e.mood.toLowerCase() +
      '"></span>' +
      e.mood +
      "</span>" +
      '    <div class="muted" style="font-size:12px">' +
      dateLabel +
      "</div>" +
      "  </div>" +
      "  <div>" +
      (e.note ? escapeHTML(e.note) : '<span class="muted">No note</span>') +
      "</div>" +
      '  <div class="tools">' +
      '    <button class="tool-btn" data-act="copy">Copy</button>' +
      '    <button class="tool-btn" data-act="delete">Delete</button>' +
      "  </div>" +
      "</div>";
  });

  entriesEl.innerHTML = html;

  $all(".entry").forEach(function (row) {
    var id = row.getAttribute("data-id");
    var copyBtn = row.querySelector('[data-act="copy"]');
    var delBtn = row.querySelector('[data-act="delete"]');

    copyBtn.addEventListener("click", function () {
      var entry = state.entries.find(function (x) {
        return x.id === id;
      });
      if (!entry) return;

      var dateLabel = new Date(entry.ts).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      var text = entry.mood + " — " + dateLabel + "\n" + (entry.note || "");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        window.prompt("Copy to clipboard:", text);
      }
    });

    delBtn.addEventListener("click", function () {
      if (!confirm("Delete this entry?")) return;
      state.entries = state.entries.filter(function (x) {
        return x.id !== id;
      });
      saveState();
      render();
    });
  });
}

function renderWeeklySummary() {
  var end = new Date();
  end.setHours(23, 59, 59, 999);
  var start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  var counts = { Calm: 0, Happy: 0, Focused: 0, Anxious: 0, Tired: 0 };

  state.entries.forEach(function (e) {
    var t = new Date(e.ts);
    if (t >= start && t <= end) {
      counts[e.mood]++;
    }
  });

  var summaryText = "No entries this week yet";
  var pairs = Object.keys(counts).map(function (k) {
    return [k, counts[k]];
  });
  pairs.sort(function (a, b) {
    return b[1] - a[1];
  });
  if (pairs[0][1] > 0) {
    summaryText = pairs[0][0] + " most logged · " + pairs[0][1] + "x this week";
  }
  $("#summary").textContent = summaryText;

  drawBarChart(counts);
}

function drawBarChart(counts) {
  var labels = MOODS.slice();
  var values = labels.map(function (m) {
    return counts[m];
  });
  var max = Math.max.apply(null, values.concat([1]));

  var W = barCanvas.width;
  var H = barCanvas.height;
  var P = 24;

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(P, H - P);
  ctx.lineTo(W - P, H - P);
  ctx.stroke();

  var slotWidth = (W - P * 2) / labels.length;
  var barWidth = slotWidth - 12;

  labels.forEach(function (label, i) {
    var value = values[i];
    var barHeight = Math.round((value / max) * (H - P * 2));
    var x = P + i * slotWidth + 6;
    var y = H - P - barHeight;

    var c1 = MOOD_COLORS[label][0];
    var c2 = MOOD_COLORS[label][1];
    var grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.strokeStyle = "#d1d5db";
    ctx.strokeRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#6b7280";
    ctx.font = "12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + barWidth / 2, H - 6);
  });
}

function loadState() {
  try {
    var json = localStorage.getItem(STORAGE_KEY);
    return json ? JSON.parse(json) : { entries: [] };
  } catch (e) {
    return { entries: [] };
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
