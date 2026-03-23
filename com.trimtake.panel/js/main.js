/**
 * TrimTake — Panel logic
 */

(function () {
  "use strict";

  // --- Mock usage data (change values to test different states) ---
  var MOCK_USAGE = {
    plan: "free", // "free" | "creator" | "pro"
    minutesUsed: 24,
    minutesLimit: 30,
    resetDate: "April 1, 2026"
  };

  var bridge = window.TrimTakeBridge;

  // DOM refs
  var statusDot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var settingsToggle = document.getElementById("settingsToggle");
  var settingsPanel = document.getElementById("settingsPanel");
  var sensitivity = document.getElementById("sensitivity");
  var sensitivityValue = document.getElementById("sensitivityValue");
  var paddingBefore = document.getElementById("paddingBefore");
  var paddingAfter = document.getElementById("paddingAfter");
  var fillerWords = document.getElementById("fillerWords");
  var apiKeyInput = document.getElementById("apiKeyInput");
  var apiKeyStatus = document.getElementById("apiKeyStatus");
  var btnSaveApiKey = document.getElementById("btnSaveApiKey");
  var btnAnalyzeSequence = document.getElementById("btnAnalyzeSequence");
  var btnUploadAudio = document.getElementById("btnUploadAudio");
  var audioFileInput = document.getElementById("audioFileInput");
  var progressContainer = document.getElementById("progressContainer");
  var progressBar = document.getElementById("progressBar");
  var progressLabel = document.getElementById("progressLabel");
  var resultsSection = document.getElementById("resultsSection");
  var resultsContainer = document.getElementById("resultsContainer");
  var selectAll = document.getElementById("selectAll");
  var resultCount = document.getElementById("resultCount");
  var totalCount = document.getElementById("totalCount");
  var selectedCount = document.getElementById("selectedCount");
  var totalDuration = document.getElementById("totalDuration");
  var btnApplyCuts = document.getElementById("btnApplyCuts");
  var btnExportMarkers = document.getElementById("btnExportMarkers");
  var btnExportCSV = document.getElementById("btnExportCSV");
  var btnExportJSON = document.getElementById("btnExportJSON");
  var emptyState = document.getElementById("emptyState");
  var toastContainer = document.getElementById("toastContainer");
  var planBadge = document.getElementById("planBadge");
  var usageFill = document.getElementById("usageFill");
  var usageText = document.getElementById("usageText");
  var usagePlanInfo = document.getElementById("usagePlanInfo");
  var upgradeBanner = document.getElementById("upgradeBanner");
  var upgradeBannerText = document.getElementById("upgradeBannerText");
  var btnUpgrade = document.getElementById("btnUpgrade");
  var upgradeFooter = document.getElementById("upgradeFooter");
  var btnUpgradeLink = document.getElementById("btnUpgradeLink");

  var detectedFillers = [];
  var isAnalyzing = false;
  var backendConnected = false;

  // --- Toast notifications ---
  function toast(message, type) {
    type = type || "info";
    var el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(function () {
      el.classList.add("hiding");
      setTimeout(function () { el.remove(); }, 200);
    }, 3000);
  }

  // --- Confirmation dialog ---
  function confirm(title, message) {
    return new Promise(function (resolve) {
      var overlay = document.createElement("div");
      overlay.className = "confirm-overlay";
      overlay.innerHTML =
        '<div class="confirm-dialog">' +
          '<h3>' + escapeHtml(title) + '</h3>' +
          '<p>' + escapeHtml(message) + '</p>' +
          '<div class="btn-row">' +
            '<button class="btn btn-secondary" data-action="cancel">Cancel</button>' +
            '<button class="btn btn-primary" data-action="confirm">Confirm</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      overlay.addEventListener("click", function (e) {
        var action = e.target.getAttribute("data-action");
        if (action === "confirm") { overlay.remove(); resolve(true); }
        else if (action === "cancel") { overlay.remove(); resolve(false); }
      });
    });
  }

  // --- API Key ---
  function loadApiKey() {
    var key = localStorage.getItem("trimtake_api_key") || "";
    if (key) {
      apiKeyInput.value = key;
      apiKeyStatus.textContent = "configured";
      apiKeyStatus.className = "api-key-status set";
    }
  }

  function saveApiKey() {
    var key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem("trimtake_api_key", key);
      apiKeyStatus.textContent = "saved";
      apiKeyStatus.className = "api-key-status set";
      toast("API key saved", "success");
      // Send to backend
      bridge.apiCall("POST", "/config", { apiKey: key }).catch(function () {});
    } else {
      localStorage.removeItem("trimtake_api_key");
      apiKeyStatus.textContent = "not set";
      apiKeyStatus.className = "api-key-status";
      toast("API key removed", "warning");
    }
  }

  btnSaveApiKey.addEventListener("click", saveApiKey);
  apiKeyInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") saveApiKey();
  });

  // --- Settings persistence ---
  function loadSettings() {
    try {
      var saved = JSON.parse(localStorage.getItem("trimtake_settings") || "{}");
      if (saved.sensitivity !== undefined) {
        sensitivity.value = saved.sensitivity;
        sensitivityValue.textContent = saved.sensitivity + "%";
      }
      if (saved.paddingBefore !== undefined) paddingBefore.value = saved.paddingBefore;
      if (saved.paddingAfter !== undefined) paddingAfter.value = saved.paddingAfter;
      if (saved.fillerWords) fillerWords.value = saved.fillerWords;
    } catch (e) { /* ignore */ }
  }

  function saveSettings() {
    localStorage.setItem("trimtake_settings", JSON.stringify({
      sensitivity: parseInt(sensitivity.value, 10),
      paddingBefore: parseInt(paddingBefore.value, 10),
      paddingAfter: parseInt(paddingAfter.value, 10),
      fillerWords: fillerWords.value,
    }));
  }

  // Auto-save settings on change
  sensitivity.addEventListener("input", function () {
    sensitivityValue.textContent = sensitivity.value + "%";
    saveSettings();
  });
  paddingBefore.addEventListener("change", saveSettings);
  paddingAfter.addEventListener("change", saveSettings);
  fillerWords.addEventListener("change", saveSettings);

  // --- Health check ---
  function checkBackend() {
    bridge.apiCall("GET", "/health")
      .then(function (data) {
        if (!backendConnected) {
          backendConnected = true;
          toast("Backend connected", "success");
        }
        statusDot.className = "status-dot connected";
        statusText.textContent = "Backend connected" + (data.version ? " (v" + data.version + ")" : "");
      })
      .catch(function () {
        if (backendConnected) {
          toast("Backend connection lost", "error");
        }
        backendConnected = false;
        statusDot.className = "status-dot";
        statusText.textContent = "Backend offline \u2014 start the server";
      });
  }

  // --- Settings toggle ---
  settingsToggle.addEventListener("click", function () {
    settingsPanel.classList.toggle("active");
    settingsToggle.classList.toggle("active");
  });

  function getSettings() {
    return {
      sensitivity: parseInt(sensitivity.value, 10) / 100,
      paddingBefore: parseInt(paddingBefore.value, 10),
      paddingAfter: parseInt(paddingAfter.value, 10),
      fillerWords: fillerWords.value.split(",").map(function (w) { return w.trim(); }).filter(Boolean),
    };
  }

  // --- Progress ---
  function showProgress(label, pct) {
    progressContainer.classList.add("active");
    progressLabel.textContent = label;
    if (pct === -1) {
      progressBar.classList.add("indeterminate");
    } else {
      progressBar.classList.remove("indeterminate");
      progressBar.style.width = pct + "%";
    }
  }

  function hideProgress() {
    progressContainer.classList.remove("active");
    progressBar.classList.remove("indeterminate");
    progressBar.style.width = "0%";
  }

  // --- Summary update ---
  function updateSummary() {
    var checks = resultsContainer.querySelectorAll('input[type="checkbox"]');
    var sel = 0;
    var dur = 0;
    checks.forEach(function (cb) {
      if (cb.checked) {
        sel++;
        var f = detectedFillers[parseInt(cb.dataset.index, 10)];
        if (f) dur += (f.end - f.start);
      }
    });
    selectedCount.textContent = sel;
    btnApplyCuts.disabled = sel === 0;
  }

  // --- Results ---
  function renderResults(fillers) {
    detectedFillers = fillers;
    resultsContainer.innerHTML = "";

    if (!fillers.length) {
      resultsSection.style.display = "none";
      emptyState.style.display = "block";
      emptyState.querySelector("p").textContent = "No filler words detected!";
      emptyState.querySelector(".subtitle").textContent = "Try lowering the sensitivity or analyzing a different clip.";
      return;
    }

    emptyState.style.display = "none";
    resultsSection.style.display = "block";
    resultCount.textContent = fillers.length + " item" + (fillers.length === 1 ? "" : "s");
    totalCount.textContent = fillers.length;

    var totalDur = 0;
    fillers.forEach(function (f) { totalDur += (f.end - f.start); });
    totalDuration.textContent = totalDur.toFixed(1);

    fillers.forEach(function (f, i) {
      var item = document.createElement("div");
      item.className = "result-item";

      var confPct = Math.round(f.confidence * 100);
      var confClass = f.confidence >= 0.8 ? "high" : (f.confidence >= 0.5 ? "medium" : "low");

      item.innerHTML =
        '<input type="checkbox" data-index="' + i + '" checked>' +
        '<span class="result-word">' + escapeHtml(f.word) + '</span>' +
        '<span class="result-time">' + formatTime(f.start) + ' \u2192 ' + formatTime(f.end) + '</span>' +
        '<span class="result-confidence ' + confClass + '">' + confPct + '%</span>';

      item.querySelector('input').addEventListener("change", updateSummary);
      resultsContainer.appendChild(item);
    });

    selectAll.checked = true;
    updateSummary();
  }

  function getSelectedFillers() {
    var checks = resultsContainer.querySelectorAll('input[type="checkbox"]');
    var selected = [];
    checks.forEach(function (cb) {
      if (cb.checked) {
        selected.push(detectedFillers[parseInt(cb.dataset.index, 10)]);
      }
    });
    return selected;
  }

  // --- Select all ---
  selectAll.addEventListener("change", function () {
    var checks = resultsContainer.querySelectorAll('input[type="checkbox"]');
    checks.forEach(function (cb) { cb.checked = selectAll.checked; });
    updateSummary();
  });

  // --- Analyze current sequence ---
  btnAnalyzeSequence.addEventListener("click", function () {
    if (isAnalyzing) return;
    if (!backendConnected) {
      toast("Backend is offline. Start the server first.", "error");
      return;
    }

    isAnalyzing = true;
    btnAnalyzeSequence.disabled = true;
    showProgress("Getting sequence info...", 10);

    bridge.evalScript("trimtake_getSequenceInfo()")
      .then(function (result) {
        var seqInfo;
        try {
          seqInfo = JSON.parse(result);
          if (seqInfo.error) {
            toast(seqInfo.error, "error");
            hideProgress();
            isAnalyzing = false;
            btnAnalyzeSequence.disabled = false;
            return Promise.reject({ handled: true });
          }
        } catch (e) {
          seqInfo = { name: "Current Sequence", path: "" };
        }

        showProgress("Analyzing audio for fillers...", -1);

        var settings = getSettings();
        return bridge.apiCall("POST", "/analyze", {
          sequenceName: seqInfo.name,
          videoPath: seqInfo.path,
          settings: settings,
        });
      })
      .then(function (data) {
        if (!data) return;
        showProgress("Complete!", 100);
        toast("Found " + (data.fillers || []).length + " filler words", "success");
        setTimeout(hideProgress, 800);
        renderResults(data.fillers || []);
      })
      .catch(function (err) {
        if (err && err.handled) return;
        hideProgress();
        toast("Analysis failed: " + (err.message || "Unknown error"), "error");
      })
      .finally(function () {
        isAnalyzing = false;
        btnAnalyzeSequence.disabled = false;
      });
  });

  // --- Upload audio ---
  btnUploadAudio.addEventListener("click", function () {
    audioFileInput.click();
  });

  audioFileInput.addEventListener("change", function () {
    var file = audioFileInput.files[0];
    if (!file) return;

    if (!backendConnected) {
      toast("Backend is offline. Start the server first.", "error");
      audioFileInput.value = "";
      return;
    }

    var maxSize = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSize) {
      toast("File too large (max 500MB)", "error");
      audioFileInput.value = "";
      return;
    }

    isAnalyzing = true;
    showProgress("Uploading " + file.name + "...", -1);

    bridge.uploadFile("/analyze", file)
      .then(function (data) {
        showProgress("Complete!", 100);
        toast("Found " + (data.fillers || []).length + " filler words", "success");
        setTimeout(hideProgress, 800);
        renderResults(data.fillers || []);
      })
      .catch(function (err) {
        hideProgress();
        toast("Upload failed: " + (err.message || "Unknown error"), "error");
      })
      .finally(function () {
        isAnalyzing = false;
      });

    audioFileInput.value = "";
  });

  // --- Apply cuts ---
  btnApplyCuts.addEventListener("click", function () {
    var selected = getSelectedFillers();
    if (!selected.length) {
      toast("No filler words selected", "warning");
      return;
    }

    confirm(
      "Apply " + selected.length + " cuts?",
      "This will razor-cut and ripple-delete " + selected.length + " filler segments from your sequence. This cannot be easily undone."
    ).then(function (ok) {
      if (!ok) return;

      var settings = getSettings();
      showProgress("Applying " + selected.length + " cuts...", -1);

      bridge.apiCall("POST", "/apply", {
        cuts: selected,
        paddingBefore: settings.paddingBefore,
        paddingAfter: settings.paddingAfter,
      })
        .then(function (data) {
          if (data.script) {
            return bridge.evalScript(data.script);
          }
          return Promise.resolve();
        })
        .then(function () {
          showProgress("Done!", 100);
          toast("Applied " + selected.length + " cuts successfully", "success");
          setTimeout(hideProgress, 1000);
        })
        .catch(function (err) {
          hideProgress();
          toast("Failed to apply cuts: " + (err.message || "Unknown error"), "error");
        });
    });
  });

  // --- Export markers ---
  btnExportMarkers.addEventListener("click", function () {
    var selected = getSelectedFillers();
    if (!selected.length) {
      toast("No filler words selected", "warning");
      return;
    }

    var markerScript = "trimtake_addMarkers(" + JSON.stringify(selected) + ")";
    bridge.evalScript(markerScript)
      .then(function () {
        toast("Added " + selected.length + " markers to sequence", "success");
      })
      .catch(function (err) {
        toast("Failed to add markers: " + (err.message || "Unknown error"), "error");
      });
  });

  // --- Export CSV ---
  btnExportCSV.addEventListener("click", function () {
    var selected = getSelectedFillers();
    if (!selected.length) { toast("No items selected", "warning"); return; }

    var csv = "word,start,end,duration,confidence\n";
    selected.forEach(function (f) {
      csv += '"' + f.word + '",' + f.start.toFixed(3) + ',' + f.end.toFixed(3) + ',' +
        (f.end - f.start).toFixed(3) + ',' + f.confidence.toFixed(2) + '\n';
    });
    downloadText(csv, "trimtake-fillers.csv", "text/csv");
    toast("CSV exported", "success");
  });

  // --- Export JSON ---
  btnExportJSON.addEventListener("click", function () {
    var selected = getSelectedFillers();
    if (!selected.length) { toast("No items selected", "warning"); return; }

    var json = JSON.stringify({ fillers: selected, exportedAt: new Date().toISOString() }, null, 2);
    downloadText(json, "trimtake-fillers.json", "application/json");
    toast("JSON exported", "success");
  });

  function downloadText(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Keyboard shortcuts ---
  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if (e.key === "a" || e.key === "A") {
      e.preventDefault();
      btnAnalyzeSequence.click();
    } else if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      settingsToggle.click();
    } else if (e.key === "Escape") {
      if (settingsPanel.classList.contains("active")) {
        settingsPanel.classList.remove("active");
        settingsToggle.classList.remove("active");
      }
    }
  });

  // --- Utilities ---
  function formatTime(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    var f = Math.round((seconds % 1) * 30);
    return pad(h) + ":" + pad(m) + ":" + pad(s) + ":" + pad(f);
  }

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Usage tracking UI ---
  function openUpgrade() {
    // Open upgrade URL — in CEP, use bridge if available, otherwise window.open
    try {
      if (bridge && bridge.openUrl) {
        bridge.openUrl("https://trimtake.io/upgrade");
      } else {
        window.open("https://trimtake.io/upgrade", "_blank");
      }
    } catch (e) {
      window.open("https://trimtake.io/upgrade", "_blank");
    }
  }

  btnUpgrade.addEventListener("click", openUpgrade);
  btnUpgradeLink.addEventListener("click", function (e) {
    e.preventDefault();
    openUpgrade();
  });

  function renderUsage(usage) {
    var pct = usage.minutesLimit > 0 ? Math.round((usage.minutesUsed / usage.minutesLimit) * 100) : 0;
    if (pct > 100) pct = 100;

    // Usage bar fill
    usageFill.style.width = pct + "%";
    usageFill.className = "usage-fill";
    if (pct > 85) {
      usageFill.classList.add("red");
      if (pct > 90) usageFill.classList.add("pulse");
    } else if (pct > 60) {
      usageFill.classList.add("yellow");
    }

    // Usage text
    usageText.textContent = usage.minutesUsed + " of " + usage.minutesLimit + " min used this month";

    // Plan info line
    var planLabel = usage.plan.charAt(0).toUpperCase() + usage.plan.slice(1);
    if (usage.plan === "free") {
      // Calculate days until reset
      var now = new Date();
      var reset = new Date(usage.resetDate);
      var days = Math.max(0, Math.ceil((reset - now) / (1000 * 60 * 60 * 24)));
      usagePlanInfo.textContent = "Free Plan \u00B7 resets in " + days + " day" + (days !== 1 ? "s" : "");
    } else {
      usagePlanInfo.textContent = planLabel + " Plan \u00B7 resets " + usage.resetDate;
    }

    // Plan badge
    planBadge.textContent = usage.plan.toUpperCase();
    planBadge.className = "plan-badge";
    if (usage.plan === "creator") planBadge.classList.add("creator");
    else if (usage.plan === "pro") planBadge.classList.add("pro");

    // Upgrade banner logic
    if (pct >= 100) {
      upgradeBanner.style.display = "flex";
      upgradeBanner.className = "upgrade-banner limit";
      upgradeBannerText.textContent = "Monthly limit reached \u2014 Upgrade to continue";
      btnUpgrade.className = "btn-upgrade big";
      btnUpgrade.textContent = "Upgrade Now";
      upgradeFooter.classList.add("hidden");
    } else if (pct > 70) {
      upgradeBanner.style.display = "flex";
      upgradeBanner.className = "upgrade-banner warn";
      var planSuggestion = usage.plan === "free" ? "Creator for 500 min/mo \u2192 $12" : "Pro for unlimited";
      upgradeBannerText.textContent = "Running low on minutes \u2014 Upgrade to " + planSuggestion;
      btnUpgrade.className = "btn-upgrade";
      btnUpgrade.textContent = "Upgrade";
      upgradeFooter.classList.add("hidden");
    } else {
      upgradeBanner.style.display = "none";
      upgradeFooter.classList.remove("hidden");
    }
  }

  function fetchUsage() {
    bridge.apiCall("GET", "/usage")
      .then(function (data) {
        renderUsage(data);
      })
      .catch(function () {
        // Fallback to mock data if backend unavailable
        renderUsage(MOCK_USAGE);
      });
  }

  // --- Init ---
  loadApiKey();
  loadSettings();
  checkBackend();
  setInterval(checkBackend, 10000);
  fetchUsage();
  setInterval(fetchUsage, 60000);
})();
