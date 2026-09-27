# DL / RC PVC Card Print

A browser tool that crops the front and back of an Indian Driving Licence or RC (from Parivahan, Sarathi or DigiLocker) and prints them on 4 × 6 in paper, two cards per sheet, at card size (8.5 × 5.5 cm).

- Upload a PDF or image; the front and back cards are detected automatically, and you can adjust the crop boxes by hand. Works with PDFs that have both cards on one page (RC) and PDFs with one card per page (Sarathi DL).
- Each page is a 4 × 6 in (10.16 × 15.24 cm) portrait sheet. Page 1 has two fronts and page 2 has two backs, stacked, centred and evenly spaced, so the sheet can be printed double-sided.
- Two different cards on one sheet: load the first file as **Card 1** (top), then click **+ Add card 2** and load the second file (bottom). Page 1 has both fronts and page 2 both backs. With only one file, it prints once at the top and the bottom stays blank.
- Color modes: Color, Grayscale, or Both (color pages followed by grayscale pages).
- Print directly, or download a 300 DPI PDF or JPG files.
- Everything runs in the browser. Files are never uploaded.

## Paper and print sizes

| | Inches | Centimetres | Millimetres |
|---|---|---|---|
| **Paper loaded in the printer (4 × 6)**, width | 4 in | 10.2 cm | 101.6 mm |
| **Paper loaded in the printer (4 × 6)**, height | 6 in | 15.2 cm | 152.4 mm |
| **Printed card**, width | 3.35 in | 8.5 cm | 85 mm |
| **Printed card**, height | 2.17 in | 5.5 cm | 55 mm |

The 4 × 6 paper is also sold as "4R", "10 × 15 cm" or "postcard / photo" size. The tool's pages are 4 × 6 in, portrait, with two cards on each. The card size can be changed in the tool's Card width / Card height fields; the cards stay centred with equal space above, between and below them (about 1.41 cm at 8.5 × 5.5 cm).

## Usage

Open `index.html` in Chrome or Edge. It needs no server or internet connection; the PDF libraries are bundled in `lib/`. Keep `app.js`, `lib/` and `assets/` in the same folder as `index.html`.

1. Click **Choose file** and select the DL or RC PDF or image.
2. Check the red **FRONT** and green **BACK** boxes. Drag or resize them if needed.
3. Choose the color mode (Color, Grayscale or Both).
4. Click **Print**, or download the PDF.

## Printer setup

### Add the 4 × 6 paper size (one time only)

If **4 × 6 in / 10 × 15 cm** isn't in your printer's paper size list, add it to Windows:

1. Open **Start**, search for **Printers & scanners**, and open it.
2. Under Related settings, click **Print server properties**.
3. On the **Forms** tab, tick **Create a new form**.
4. Enter:
   - Form name: `4x6 Photo`
   - Units: **Metric**
   - Width: **10.16 cm**, Height: **15.24 cm**
   - Printer area margins: **0**
5. Click **Save Form**, then close the window and restart the browser.

### Print dialog settings

| Setting | Value |
|---|---|
| Paper size | **4x6 Photo** (10.16 × 15.24 cm) |
| Orientation | **Portrait** |
| Margins | **None** |
| Scale | **100% / Actual size**; don't use "Fit to page" |
| Color | Color, or Black & white |
| Borderless | **Off**: borderless mode enlarges the print slightly |

If the paper size doesn't appear in the browser's list, press **Ctrl+Shift+P** in the print window to open the Windows print dialog. Then open **Preferences** and set a **Custom / User defined** size of 101.6 × 152.4 mm.

### Test print

Print once on plain paper and measure the card with a ruler. It should be exactly **8.5 × 5.5 cm**. If it's bigger or smaller, scale is not set to 100%.

---

Developed by [Code Crafters](https://codecrafters-pi.vercel.app/).
