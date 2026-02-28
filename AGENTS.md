# AGENTS.md - Linux Scroll Speed Fix

## Project Overview

This is a Chrome extension (Manifest V3) written in vanilla JavaScript that fixes slow scroll speed on Linux Chrome by emulating Windows scroll behavior.

**Files:**
- `content.js` - Content script injected into web pages to handle scroll events
- `popup.js` - Popup UI logic for extension settings
- `popup.html` / `popup.css` - Extension popup interface
- `manifest.json` - Extension manifest (v3)

---

## Build, Test & Development Commands

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the project directory

### Reloading Changes

After editing any file:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the extension card
3. Refresh any test pages

### Testing (Manual Only)

- Load extension, test scrolling on various websites
- Test URLs: YouTube, www.nexusmods.com, Outlook 365, iFrames
- No automated tests exist

### Linting

No automated linter configured. Manually verify:
- `'use strict';` at top of all JS files
- No console errors in Chrome DevTools
- Valid JSON in manifest.json

### No Build System

Vanilla JavaScript project - no build step required.

---

## Code Style Guidelines

### General Principles

- Use ES6+ features (const/let, arrow functions, async/await)
- Always use `'use strict';` at top of every JS file
- Keep functions focused and single-purpose

### Naming Conventions

- **Variables/functions**: camelCase (`scrollFactor`, `getScrollFactor`)
- **Constants**: descriptive names (`linuxSpeed`, `windowsSpeed`)
- **DOM elements**: match HTML IDs (`scrollFactorInput`, `smoothScrollButton`)
- **Functions**: verb-based (`getSetting`, `setScrollFactor`)

### Async/Await

- Use async/await for Chrome APIs
- Always wrap in try/catch for error handling

```javascript
async function getScrollFactor() {
    let result = await getSetting('scrollFactor');
    return result.scrollFactor;
}
```

### Event Handling

- Use `addEventListener` for event binding
- Use `{passive: false}` for scroll/wheel events when preventDefault is needed

```javascript
const wheelEvent = 'onwheel' in document.createElement('div') ? 'wheel' : 'mousewheel';
el.addEventListener(wheelEvent, wheel, {passive: false});
```

### Chrome Extension APIs

- `chrome.storage.local` for persistent settings
- `chrome.runtime.onMessage` for content script communication
- `chrome.tabs.query` and `chrome.tabs.sendMessage` for tab operations

### Error Handling

- Always wrap Chrome API calls in try/catch
- Log errors with `console.log(err)`

### Strings and Comparisons

- Use strict equality (`===`) not loose equality (`==`)
- Use string literals for known values (`'true'`, `'false'`, `'linux'`, `'win'`)

```javascript
if (disableExtension == 'false') {
    main();
}
```

### Code Organization

1. Constants/variables at top
2. Utility functions
3. Main logic functions
4. Event listeners at bottom
5. Init call at appropriate location

---

## Chrome Extension Specific Guidelines

### Manifest V3

- Use `action.default_popup` for popup
- Use `content_scripts` for page injection
- Specify `run_at: "document_start"` for early script loading

### Content Script Best Practices

- Run at `document_start` to catch early scroll events
- Use MutationObserver for dynamic content changes
- Handle iFrames carefully (same-origin limitations)
- Check modifier keys: `event.ctrlKey`, `event.shiftKey`, `event.altKey`, `event.metaKey`

### Permissions

- Only request necessary permissions (`storage`)
- Minimize content script matches

### Security

- No eval() or new Function()
- Validate user input (e.g., scrollFactor bounds checking)

---

## File Structure

```
linux-scroll-speed-fix/
├── content.js          # Content script (scroll handling)
├── popup.js            # Popup UI logic
├── popup.html          # Popup HTML
├── popup.css           # Popup styles
├── manifest.json       # Extension manifest (v3)
├── icon_*.png          # Extension icons
└── AGENTS.md           # This file
```

---

## Common Tasks

### Adding a New Setting

1. Add HTML input in `popup.html`
2. Add getter/setter in `popup.js`
3. Add storage key handling in `content.js`
4. Update `manifest.json` if new permissions needed

### Modifying Scroll Behavior

1. Edit `wheel()` function in `content.js`
2. Test on various websites
3. Check for conflicts with site-specific handlers

### Debugging

- Use Chrome DevTools console on test pages
- Check `chrome://extensions/` for errors
- Use `console.log()` for debugging (remove in production)
