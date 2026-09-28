# Angel Editor 🎬

A local-first browser video editor starter designed to run from GitHub Pages or any static web host.

## Current working features

- Local video/image/audio import
- Project bin with thumbnails
- Add media to a real timeline
- Multi-clip timeline model
- Video preview
- Play/pause and seek
- Clip selection + inspector
- Trim in/out
- Split at playhead
- Delete clips
- Speed, scale, rotation, opacity, volume controls
- Text overlay
- Basic real-time visual effects
- Transition presets architecture
- Local WebM export using browser MediaRecorder
- Project JSON save
- No watermark

## Run locally

Just open `index.html` in a modern Chromium-based browser.

For best results, serve the folder from a local web server:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## GitHub Pages

Create a GitHub repository, upload all three files/folders, then enable Pages from:

Settings → Pages → Deploy from branch → main → root.

## Important

This is the foundation, not a clone of professional NLEs. Advanced features such as robust frame-accurate rendering, multi-track audio mixing, masks, chroma key, advanced transitions, keyframes, proxy media, and AI editing should be added incrementally.

The code intentionally keeps media local in the browser.
