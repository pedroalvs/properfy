/**
 * Sydney in line art — the footer band of the signed-out brand pane.
 *
 * Inline SVG rather than an asset in `public/` so the two inks follow the surface:
 * outlines take `currentColor` (set by the caller's text colour) and the accent
 * masses take the coral brand token. Purely decorative; the pane hosting it is
 * `aria-hidden`, so no title or description is declared here.
 *
 * The viewBox is wider than the pane on purpose. The caller overflows it on both
 * sides so the landmarks read large and get cropped by the pane edge and by the
 * form sheet, instead of shrinking to fit a 39.5%-wide column.
 */
export function SkylineArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 900 340"
      className={className}
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      {/* Accent masses, drawn first so the outlines below sit on top of them. */}
      <g fill="var(--color-real-estate)">
        <ellipse cx="112" cy="309" rx="44" ry="7" />
        <ellipse cx="178" cy="309" rx="24" ry="5" />
        <path d="M86 306C88 250 92 208 110 206c18 2 22 44 24 100z" />
        <path d="M94 179q16-16 32 0z" />
        <path d="M168 306q10-64 20 0z" />
        <path d="M150 236l25-18 25 18z" />
        {/*
         * Each opera shell is a fin: it climbs to a point, then falls on a tighter
         * curve. A single symmetric bezier here reads as a hill, not a sail.
         */}
        <path d="M500 300C514 254 536 212 562 196c8 30 8 72 4 104zM552 300c16-54 42-104 74-132c8 38 8 94 4 132z" />
        <path d="M698 138h36v28h-36z" />
      </g>

      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* inspector, cropped by the pane edge */}
        <path d="M86 306C88 250 92 208 110 206c18 2 22 44 24 100" />
        <circle cx="110" cy="184" r="14" />
        <path d="M94 179q16-16 32 0M85 180h50" />
        <path d="M130 234l16 18M92 234l-14 30" />
        <path d="M144 244h30v40h-30zM153 244h12v-7h-12z" />
        {/* second figure */}
        <path d="M168 306q10-64 20 0" />
        <circle cx="178" cy="236" r="10" />
        {/* terrace row */}
        <path d="M100 306v-70l25-18 25 18v70M150 306v-70l25-18 25 18v70M200 306v-70l25-18 25 18v70" />
        <path d="M136 224v-16h9v21M186 224v-16h9v21M236 224v-16h9v21" />
        {/* harbour bridge */}
        <path d="M250 264h210" />
        <path d="M272 264Q360 166 448 264" />
        <path d="M266 264v-32h20v32M430 264v-32h20v32" />
        {/* opera house */}
        <path d="M460 300C472 266 490 234 508 224c8 22 8 50 4 76M500 300C514 254 536 212 562 196c8 30 8 72 4 104M552 300c16-54 42-104 74-132c8 38 8 94 4 132M690 300c-8-24-22-46-42-58c-6 20-6 40-2 58" />
        <path d="M440 300h260" />
        {/* sydney tower */}
        <path d="M710 306V166M722 306V166M698 166h36v-28h-36zM698 152h36M716 138V96" />
        {/* tower block, cropped by the form sheet */}
        <path d="M760 306V212h68v94" />
        <path d="M0 306h900" />
      </g>

      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".62"
      >
        {/* clouds */}
        <path d="M120 74c-4-15 15-22 24-12 6-16 32-14 33 5 13 1 15 17 3 17h-53c-9 0-11-7-7-10z" />
        <path d="M446 52c-3-11 11-16 18-9 4-12 24-11 25 4 10 1 11 13 2 13h-40c-7 0-8-5-5-8z" />
        <path d="M728 86c-3-12 12-18 20-10 5-13 27-12 28 4 11 1 12 14 2 14h-44c-7 0-9-5-6-8z" />
        {/* clipboard ruling */}
        <path d="M150 258h18M150 269h18" />
        <path d="M170 258l-11 19M186 258l11 17" />
        {/* verandahs and doors */}
        <path d="M105 274h40M107 274v32M143 274v32M155 274h40M157 274v32M193 274v32M205 274h40M207 274v32M243 274v32" />
        <path d="M118 306v-24h14v24M168 306v-24h14v24M218 306v-24h14v24" />
        {/* bridge hangers */}
        <path d="M300 264v-26M330 264v-43M360 264v-49M390 264v-43M420 264v-26" />
        {/* shell ribs */}
        <path d="M474 300C482 268 494 240 506 228M684 300c-6-22-16-42-32-52" />
        {/* tower block glazing */}
        <path d="M768 228h52M768 246h52M768 264h52M768 282h52M794 218v88" />
      </g>
    </svg>
  );
}
