/**
 * CSInterface bridge — wraps Adobe's CSInterface.js for TrimTake.
 * Falls back to a mock when running outside of Premiere Pro.
 */

(function () {
  "use strict";

  var BACKEND_URL = "http://localhost:3333";

  // Detect if running inside CEP
  var isInCEP = (typeof CSInterface !== "undefined");

  var csInterface = null;
  if (isInCEP) {
    try {
      csInterface = new CSInterface();
    } catch (e) {
      console.warn("CSInterface not available:", e);
    }
  }

  /**
   * Evaluate an ExtendScript expression in Premiere Pro.
   * Returns a Promise that resolves with the result string.
   */
  function evalScript(script) {
    return new Promise(function (resolve, reject) {
      if (csInterface) {
        csInterface.evalScript(script, function (result) {
          if (result === "EvalScript error.") {
            reject(new Error("ExtendScript error: " + script));
          } else {
            resolve(result);
          }
        });
      } else {
        console.log("[Mock ExtendScript]", script);
        resolve("mock_result");
      }
    });
  }

  /**
   * Call backend API.
   */
  function apiCall(method, path, body) {
    var opts = {
      method: method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) {
      opts.body = JSON.stringify(body);
    }
    return fetch(BACKEND_URL + path, opts).then(function (r) {
      if (!r.ok) throw new Error("API " + r.status + ": " + r.statusText);
      return r.json();
    });
  }

  /**
   * Upload a file to the backend.
   */
  function uploadFile(path, file) {
    var formData = new FormData();
    formData.append("audio", file);
    return fetch(BACKEND_URL + path, {
      method: "POST",
      body: formData,
    }).then(function (r) {
      if (!r.ok) throw new Error("Upload " + r.status + ": " + r.statusText);
      return r.json();
    });
  }

  // Export
  window.TrimTakeBridge = {
    evalScript: evalScript,
    apiCall: apiCall,
    uploadFile: uploadFile,
    isInCEP: isInCEP,
    BACKEND_URL: BACKEND_URL,
  };
})();
