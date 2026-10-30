# macOS Photo Booth

A browser-based camera app inspired by macOS Photo Booth, built with HTML, CSS, and vanilla JavaScript. It features a silver window frame, macOS-style window controls, an edge-to-edge camera preview, and a centered red shutter button.

## Features

- Live webcam preview with camera selection and mirror controls.
- Single-photo and four-photo collage modes with a countdown.
- Nine effects: Normal, Black & White, Sepia, Thermal, X-Ray, Pop Art, Vivid, Faded, and Noir.
- Photo gallery with preview, navigation, deletion, and JPEG downloads.
- Demo scene and uploaded-image sources, including drag and drop.
- Close, minimize, restore, and fullscreen controls within the browser page.
- Responsive window sizing that fits the viewport without vertical scrolling.

## Getting started

No build step or package installation is required.

From the project directory, start a local server using Python:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open [localhost:8000](http://localhost:8000) in a modern browser and allow camera access when prompted. Stop the server with `Ctrl+C`.

Camera access requires browser permission and a secure context, such as localhost or HTTPS. If the webcam is unavailable, you can use the demo scene or choose a photo instead.

## Usage

1. Choose a camera, the demo scene, or an image from the source menu.
2. Choose single-photo or four-photo mode using the buttons at the bottom left.
3. Click **Effects** to select an effect.
4. Click the red shutter button or press `Space` to start the countdown. Activate the shutter again to cancel an ongoing capture.
5. Click a captured thumbnail to preview it, then use **Save** to download the JPEG or **Delete** to remove it.

While viewing a photo, use the left and right arrow keys to navigate and `Escape` to close the viewer.

The red window button closes the camera window and stops its camera stream. The yellow button minimizes the window. Use **Open Camera** or **Restore Camera** to bring it back. The green button toggles fullscreen, with an expanded-window fallback when browser fullscreen is unavailable.

## Project structure

```text
macos-photo-booth/
├── index.html   # Page structure and controls
├── style.css    # Desktop theme and responsive layout
├── scripts.js   # Camera, effects, capture, gallery, and window behavior
└── README.md
```

## Photo storage

Photos are processed in the browser and kept in memory for the current page session. The gallery retains up to 40 photos; older photos are removed when that limit is exceeded. Download photos you want to keep before refreshing or closing the page.

The app has no backend or photo-upload service. The page requests the Inter font from Google Fonts and falls back to system fonts when unavailable.

## Development

Edit the HTML, CSS, or JavaScript files and refresh the browser to see changes. Check JavaScript syntax with Node.js:

```sh
node --check scripts.js
```

This is an independent web project inspired by macOS Photo Booth and is not affiliated with Apple.
