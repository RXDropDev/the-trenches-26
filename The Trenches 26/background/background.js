// background.js (MV3 service worker)

const SETTINGS_KEY = "trenches_overlay_settings_v1";

const DEFAULT_SETTINGS = {
  enabled: true,           // Always On Display default ON
  position: "top-right",   // top-right | bottom-right | bottom-left
};

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (res) => resolve(res?.[key] ?? null));
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

async function getSettings() {
  const s = (await storageGet(SETTINGS_KEY)) || {};
  return { ...DEFAULT_SETTINGS, ...s };
}

async function setSettings(next) {
  const current = await getSettings();
  const merged = { ...current, ...next };
  await storageSet(SETTINGS_KEY, merged);
  return merged;
}

function broadcastSettings(settings) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab?.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "TRENCHES_SETTINGS", settings }, () => {
        void chrome.runtime.lastError; // ignore
      });
    }
  });
}

// Ensure defaults exist once
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await storageGet(SETTINGS_KEY);
  if (!existing) await storageSet(SETTINGS_KEY, DEFAULT_SETTINGS);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Popup asks current settings
  if (msg?.type === "TRENCHES_GET_SETTINGS") {
    getSettings().then((s) => sendResponse({ settings: s }));
    return true;
  }

  // Popup updates settings -> persist + broadcast to all tabs
  if (msg?.type === "TRENCHES_SET_SETTINGS" && msg.settings) {
    setSettings(msg.settings).then((s) => {
      broadcastSettings(s);
      sendResponse({ ok: true, settings: s });
    });
    return true;
  }
});
