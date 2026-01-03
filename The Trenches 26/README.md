# The Trenches 2026

**Go back to work. Stay focused. One day at a time.**

The Trenches 2026 is a minimalist Chrome / Brave extension designed to enforce focus, discipline, and consistency throughout the year.

It replaces your New Tab with a clean, silent visual reminder of time passing — and gives you a lightweight To Do system that follows you everywhere, without noise.

---

## Philosophy

No gamification.  
No dopamine.  
No distractions.

Just:
- focus
- daily execution
- long-term discipline

You don’t need motivation.  
You need structure.

---

## Features

### 🗓️ New Tab – Year Overview
- Minimal black background
- 365-day grid (1 square = 1 day)
- Current day subtly highlighted
- Title + day counter
- Zero clutter

### ✅ Always-On To Do Overlay
- Floating To Do bubble available on **all websites**
- Same To Do list shared across:
  - New Tab
  - All open tabs
  - Future tabs (live sync)
- Drag & drop reordering (premium behavior)
- Persistent state (tasks, order, open/close)

### 🎯 Smart & Respectful UX
- Shadow DOM injection (no CSS conflicts)
- Smooth animations, no performance hit
- Bubble can be dragged anywhere on websites
- New Tab position configurable (Top Right / Bottom Right / Bottom Left)

### ⚙️ Settings Popup
- Always-On Display toggle
- New Tab To Do position selector
- Clean, minimal, premium UI

---

## Installation (Dev Mode)

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project folder

The extension is now active.

---

## Project Structure

```txt
/
├─ background/
│  └─ background.js
├─ content/
│  └─ content.js
├─ newtab/
│  ├─ newtab.html
│  └─ newtab.js
├─ popup/
│  ├─ popup.html
│  ├─ popup.css
│  └─ popup.js
├─ styles/
│  └─ style.css
├─ icons/
│  ├─ icon16.png
│  ├─ icon32.png
│  └─ icon128.png
├─ manifest.json
└─ README.md
