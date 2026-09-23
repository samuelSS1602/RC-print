# DL / RC PVC Card Print

A browser tool that crops the front and back of an Indian Driving Licence or RC (from Parivahan, Sarathi or DigiLocker) and lays them out for printing on 6×4 inch paper.

- Upload a PDF or image; the front and back cards are detected automatically, and you can adjust the crop boxes by hand.
- Page 1 is the front and page 2 is the back. Each card fills the full 6×4 page, edge to edge.
- Color modes: Color, Grayscale, or Both (color pages followed by grayscale pages).
- Print directly, or download a 300 DPI PDF or JPG files.
- Everything runs in the browser. Files are never uploaded.

## Usage

Open `index.html` in Chrome or Edge. It needs no server or internet connection; the PDF libraries are bundled in `lib/`.

In the printer dialog, choose paper size 4×6 in (10×15 cm), set scale to 100% / Actual size, and turn on borderless printing if your printer supports it.

---

Developed by [Code Crafters](https://codecrafters-pi.vercel.app/).
