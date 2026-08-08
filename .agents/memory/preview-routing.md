---
name: Preview routing
description: Preview behavior for standalone Python web processes versus registered web artifacts.
---

Standalone Streamlit processes can answer on their local port while still failing to render in the Replit preview pane when they are not registered as an artifact route. For previewable web products, use a registered web artifact with a managed workflow and path-based routing.

**Why:** The local Streamlit health and HTML endpoints were healthy, but the shared preview router did not forward the standalone workflow; the native registered web artifact rendered correctly.

**How to apply:** If a standalone workflow shows a blank preview despite returning HTTP 200 locally, verify route registration before changing application logic or repeatedly restarting the process.