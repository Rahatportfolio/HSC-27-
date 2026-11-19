/* Standalone ES5 recovery. No app modules, storage writes, resets or network. */
(function () {
  'use strict';
  var area = document.getElementById('recovery-json');
  var status = document.getElementById('recovery-status');
  var copy = document.getElementById('recovery-copy');
  var download = document.getElementById('recovery-download');
  var current = null;
  var name = 'prostuti-recovered-raw.json';
  function message(text) { status.textContent = text; }
  function show(key, filename) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw === null || raw === '') {
        message('এখানে এই কপি পাওয়া যায়নি; অন্য অ্যাপ/ডিভাইসের তথ্য নয়। / No saved JSON found for this snapshot in this app/browser profile.');
        return;
      }
      current = raw;
      name = filename;
      area.value = raw;
      copy.disabled = false;
      download.disabled = false;
      message('অপরিবর্তিত স্থানীয় JSON দেখানো হয়েছে; পূর্ণ/যাচাই করা backup নয়। / Raw local JSON shown, not validated and not a full-media backup.');
    } catch (error) {
      message('স্টোরেজ পড়ার অনুমতি নেই; তথ্য নেই বলা হচ্ছে না। / Cannot read local storage: access denied or unavailable. Keep this app/device; do not reset it.');
    }
  }
  function manualCopy() {
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    var copied = false;
    try { copied = !!document.execCommand('copy'); } catch (error) { /* Leave text selectable. */ }
    message(copied ? 'কপি হয়েছে—আলাদা নিরাপদ ফাইলে রাখো। / Copied. Save and verify a separate file.' : 'অটো কপি হয়নি; উপরের লেখা বেছে কপি করো। / Please select and copy the JSON manually; automatic copying is unavailable.');
  }
  document.getElementById('recovery-profile').onclick = function () { show('hsc27-prostuti-v1', 'prostuti-recovered-raw.json'); };
  document.getElementById('recovery-old').onclick = function () { show('hsc27-prostuti-v1-recovery', 'prostuti-old-recovery-raw.json'); };
  copy.onclick = function () {
    if (current === null) return;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        navigator.clipboard.writeText(current).then(function () {
          message('কপি হয়েছে—আলাদা নিরাপদ ফাইলে রাখো। / Copied. Save and verify a separate file.');
        }, manualCopy);
        return;
      } catch (error) { /* Older or restricted WebView: use selected text. */ }
    }
    manualCopy();
  };
  download.onclick = function () {
    if (current === null) return;
    try {
      var url = URL.createObjectURL(new Blob([current], { type: 'application/json;charset=utf-8' }));
      var link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      message('ডাউনলোড চাওয়া হয়েছে; ফাইল খুলে মিলিয়ে নাও। না হলে লেখা কপি করো। / Download requested, not verified. Check the file; copy the text if downloads are unsupported.');
    } catch (error) {
      message('ডাউনলোড হয়নি—উপরের লেখা বেছে কপি করো। / Download unavailable. Please select and copy the JSON manually.');
    }
  };
}());
