/**
 * Design tokens (B1).
 *
 * `theme.extend` was empty, so every colour, radius and shadow in the app was a
 * literal picked at the call site. That is why an audit found ten different
 * card treatments and six body-cell paddings.
 *
 * The chart palette is NOT a free choice: it is the validated eight-slot
 * categorical set, checked with the data-viz validator for lightness band,
 * chroma floor, colour-vision separation and contrast. Do not add a ninth
 * series colour — see src/domain/managerColors.ts for why, and what to do
 * instead when a chart has more than eight things in it.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces and ink. Neutrals carry a slight cool bias so they sit with
        // the blue accent rather than looking like unconsidered grey.
        surface: {
          DEFAULT: "#ffffff",
          sunk: "#f5f6f9",
          raised: "#ffffff",
        },
        ink: {
          DEFAULT: "#151922",
          muted: "#69738a",
          faint: "#98a0b3",
        },
        line: {
          DEFAULT: "#dce0e9",
          strong: "#c6ccda",
        },

        // Result semantics. Reserved — never reuse these as a series colour.
        result: {
          win: "#2a6344",
          loss: "#a8241c",
          tie: "#69738a",
        },

        // Fantasy position colours, previously hardcoded in constants/fantasy.ts.
        position: {
          qb: "#fde8e8",
          rb: "#e3f5ea",
          wr: "#e4eefb",
          te: "#fdeee0",
          k: "#efe9fb",
          def: "#f0e7dc",
        },

        // The validated categorical palette. Assign in this fixed order and
        // never cycle it.
        series: {
          1: "#2a78d6", // blue
          2: "#eb6834", // orange
          3: "#1baf7a", // aqua
          4: "#eda100", // yellow
          5: "#e87ba4", // magenta
          6: "#008300", // green
          7: "#4a3aa7", // violet
          8: "#e34948", // red
        },
      },
      fontFamily: {
        // Digits that line up in a column. Reach for `font-numeric` on any
        // table cell holding a score, a record or a percentage.
        numeric: ["Inter", "system-ui", "sans-serif"],
      },
      fontVariantNumeric: {
        tabular: "tabular-nums",
      },
      borderRadius: {
        card: "0.625rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(21,25,34,.05), 0 8px 24px -12px rgba(21,25,34,.18)",
        "card-hover":
          "0 1px 2px rgba(21,25,34,.06), 0 12px 28px -12px rgba(21,25,34,.24)",
      },
    },
  },
  plugins: [],
};
