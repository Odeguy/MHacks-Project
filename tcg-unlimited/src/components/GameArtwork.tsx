import { useId } from "react";

type GameArtworkProps = {
  variant?: "orbit" | "citadel" | "rift" | "echo";
  className?: string;
  title?: string;
};

const coordinates = [
  [60, 66],
  [426, 48],
  [442, 284],
  [79, 306],
  [340, 318],
  [142, 31],
];

function EchoLines() {
  return (
    <g fill="none" stroke="#ddd" strokeWidth="0.85">
      {Array.from({ length: 27 }, (_, i) => {
        const n = i * 6.5;
        return (
          <path
            key={i}
            opacity={0.35 + (i % 4) * 0.12}
            d={`M ${76 + n * 0.29} ${165 - n * 0.57}
             C ${92 + n * 0.2} ${20 - n * 0.18}, ${292 + n * 0.34} ${6 + n * 0.65}, ${335 + n * 0.12} ${109 + n * 0.68}
             C ${423 - n * 0.23} ${238 + n * 0.16}, ${249 - n * 0.55} ${360 - n * 0.44}, ${156 - n * 0.14} ${274 - n * 0.32}
             C ${94 - n * 0.05} ${221 - n * 0.27}, ${268 + n * 0.1} ${222 - n * 0.57}, ${289 - n * 0.16} ${161 - n * 0.17}
             C ${313 - n * 0.23} ${92 + n * 0.24}, ${107 + n * 0.48} ${107 + n * 0.22}, ${76 + n * 0.29} ${165 - n * 0.57} Z`}
          />
        );
      })}
    </g>
  );
}

export default function GameArtwork({
  variant = "orbit",
  className,
  title,
}: GameArtworkProps) {
  const id = useId().replace(/:/g, "");
  const ids = {
    title: `${id}-title`,
    background: `${id}-background`,
    metal: `${id}-metal`,
    grid: `${id}-grid`,
    scan: `${id}-scan`,
  };

  return (
    <svg
      className={className}
      viewBox="0 0 500 360"
      preserveAspectRatio="xMidYMid slice"
      role={title ? "img" : undefined}
      aria-labelledby={title ? ids.title : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title id={ids.title}>{title}</title>}
      <defs>
        <radialGradient id={ids.background} cx="37%" cy="33%" r="80%">
          <stop
            stopColor={
              variant === "rift"
                ? "#858585"
                : variant === "citadel"
                  ? "#555"
                  : "#454545"
            }
          />
          <stop offset="0.65" stopColor="#242424" />
          <stop offset="1" stopColor="#101010" />
        </radialGradient>
        <linearGradient id={ids.metal} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#eeeeee" />
          <stop offset="0.32" stopColor="#b8b8b8" />
          <stop offset="0.53" stopColor="#494949" />
          <stop offset="0.75" stopColor="#acacac" />
          <stop offset="1" stopColor="#3c3c3c" />
        </linearGradient>
        <pattern
          id={ids.grid}
          width="30"
          height="30"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 30 0 H 0 V 30"
            fill="none"
            stroke="#dcdcdc"
            strokeWidth="0.5"
            opacity="0.12"
          />
          <circle cx="0" cy="0" r="1" fill="#c7c7c7" opacity="0.25" />
        </pattern>
        <pattern
          id={ids.scan}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <path d="M 0 0 H 4" stroke="#000" strokeWidth="1" opacity="0.2" />
        </pattern>
      </defs>
      <rect width="500" height="360" fill={`url(#${ids.background})`} />
      <rect width="500" height="360" fill={`url(#${ids.grid})`} />

      {variant === "orbit" && (
        <g fill="none" stroke="#eee" strokeWidth="2">
          <path d="M250 48 382 180 250 312 118 180Z" />
          <path d="M250 80 350 180 250 280 150 180Z" opacity=".4" />
          <path
            d="M250 96 283 147 334 180 283 213 250 264 217 213 166 180 217 147Z"
            fill={`url(#${ids.metal})`}
            stroke="none"
          />
          <path d="M250 32V70 M250 290V328 M102 180H140 M360 180H398" />
        </g>
      )}

      {variant === "citadel" && (
        <g>
          <g stroke="#bebebe" strokeWidth="0.8" opacity="0.7">
            {Array.from({ length: 44 }, (_, i) => {
              const angle = (i / 44) * Math.PI * 2;
              const outer = i % 2 === 0 ? 90 : 79;
              return (
                <line
                  key={i}
                  x1={263 + Math.cos(angle) * 56}
                  y1={107 + Math.sin(angle) * 56}
                  x2={263 + Math.cos(angle) * outer}
                  y2={107 + Math.sin(angle) * outer}
                />
              );
            })}
          </g>
          <circle cx="263" cy="107" r="48" fill="#b7b7b7" />
          <circle
            cx="263"
            cy="107"
            r="39"
            fill="none"
            stroke="#3c3c3c"
            strokeWidth="0.5"
          />
          <path
            d="M 88 257 L 246 179 L 417 251 L 254 332 Z"
            fill="#292929"
            stroke="#b6b6b6"
            strokeWidth="0.6"
          />
          <g fill="none" stroke="#747474" strokeWidth="0.45">
            {Array.from({ length: 11 }, (_, i) => (
              <path
                key={i}
                d={`M ${101 + i * 14} ${264 + i * 6.8} L ${259 + i * 14} ${185 + i * 6.6}`}
              />
            ))}
            {Array.from({ length: 11 }, (_, i) => (
              <path
                key={i}
                d={`M ${103 + i * 15.8} ${250 - i * 7.6} L ${268 + i * 14} ${324 - i * 7.5}`}
              />
            ))}
          </g>
          {[
            { x: 161, y: 234, h: 97, w: 43 },
            { x: 251, y: 254, h: 164, w: 48 },
            { x: 344, y: 262, h: 90, w: 42 },
          ].map(({ x, y, h, w }, i) => (
            <g key={i}>
              <path
                d={`M ${x} ${y - h} L ${x + w} ${y - h - w / 2} L ${x + w * 2} ${y - h} L ${x + w} ${y - h + w / 2} Z`}
                fill="#d5d5d5"
                stroke="#eee"
                strokeWidth="0.5"
              />
              <path
                d={`M ${x} ${y - h} L ${x + w} ${y - h + w / 2} V ${y + w / 2} L ${x} ${y} Z`}
                fill={`url(#${ids.metal})`}
              />
              <path
                d={`M ${x + w} ${y - h + w / 2} L ${x + w * 2} ${y - h} V ${y} L ${x + w} ${y + w / 2} Z`}
                fill="#282828"
                stroke="#7e7e7e"
                strokeWidth="0.6"
              />
              {Array.from({ length: 7 }, (_, line) => (
                <path
                  key={line}
                  d={`M ${x + 6} ${y - h + 14 + (line * (h - 22)) / 7} L ${x + w - 6} ${y - h + w / 2 + 8 + (line * (h - 22)) / 7}`}
                  fill="none"
                  stroke="#444"
                  strokeWidth="0.8"
                  opacity="0.6"
                />
              ))}
              <line
                x1={x + w}
                y1={y - h + w / 2}
                x2={x + w}
                y2={y + w / 2}
                stroke="#e1e1e1"
                strokeWidth="0.6"
              />
            </g>
          ))}
          <text
            x="39"
            y="307"
            fill="#c5c5c5"
            fontFamily="monospace"
            fontSize="7"
            letterSpacing="1.5"
          >
            MONUMENT / 03
          </text>
          <path
            d="M 40 290 V 232 H 112"
            fill="none"
            stroke="#9e9e9e"
            strokeWidth="0.6"
          />
        </g>
      )}

      {variant === "rift" && (
        <g>
          <path
            d="M 250 25 V 335 M 63 180 H 437"
            fill="none"
            stroke="#e2e2e2"
            strokeWidth="0.6"
            opacity="0.25"
          />
          <g fill="none" stroke="#b6b6b6" opacity="0.32">
            <path
              d="M 250 37 L 400 180 L 250 323 L 100 180 Z"
              strokeWidth="0.65"
            />
            <path
              d="M 250 60 L 375 180 L 250 300 L 125 180 Z"
              strokeWidth="0.5"
              strokeDasharray="2 5"
            />
          </g>
          <path
            d="M 255 63 L 321 136 L 274 165 L 225 127 Z"
            fill={`url(#${ids.metal})`}
            stroke="#ddd"
            strokeWidth="0.6"
          />
          <path
            d="M 255 63 L 264 133 L 274 165 L 225 127 Z"
            fill="#5f5f5f"
            opacity="0.7"
          />
          <path
            d="M 331 145 L 396 186 L 319 233 L 290 181 Z"
            fill="#d1d1d1"
            stroke="#e4e4e4"
            strokeWidth="0.7"
          />
          <path d="M 331 145 L 326 190 L 319 233 L 290 181 Z" fill="#494949" />
          <path
            d="M 269 213 L 314 247 L 244 314 L 214 239 Z"
            fill={`url(#${ids.metal})`}
            stroke="#dbdbdb"
            strokeWidth="0.6"
          />
          <path
            d="M 269 213 L 244 314 L 246 249 Z"
            fill="#dedede"
            opacity="0.8"
          />
          <path
            d="M 208 151 L 169 216 L 98 176 L 158 120 Z"
            fill={`url(#${ids.metal})`}
            stroke="#e4e4e4"
            strokeWidth="0.6"
          />
          <path d="M 208 151 L 169 216 L 170 164 Z" fill="#2c2c2c" />
          <path
            d="M 227 156 L 271 170 L 260 211 L 219 205 L 200 177 Z"
            fill="#181818"
            stroke="#d6d6d6"
            strokeWidth="0.8"
          />
          <path d="M 227 156 L 245 183 L 219 205 L 200 177 Z" fill="#b4b4b4" />
          <path d="M 245 183 L 271 170 L 260 211 Z" fill="#666666" />
          <path
            d="M 344 76 L 364 115 L 329 108 Z M 129 248 L 163 257 L 139 275 Z M 215 55 L 195 89 L 181 67 Z"
            fill="#c5c5c5"
          />
          <path
            d="M 351 82 L 346 102 L 364 115 Z M 138 254 L 139 275 L 163 257 Z"
            fill="#343434"
          />
          <g fill="none" stroke="#e8e8e8" strokeWidth="0.5" opacity="0.75">
            <path d="M 195 119 L 154 46 H 87 M 324 239 L 378 297 H 430" />
            <circle cx="195" cy="119" r="2" />
            <circle cx="324" cy="239" r="2" />
          </g>
          <text
            x="87"
            y="39"
            fill="#dbdbdb"
            fontFamily="monospace"
            fontSize="7"
            letterSpacing="1.3"
          >
            FRACTURE 02:17
          </text>
          <text
            x="377"
            y="312"
            fill="#aaa"
            fontFamily="monospace"
            fontSize="7"
            letterSpacing="1.3"
          >
            Δ / 0.008
          </text>
        </g>
      )}

      {variant === "echo" && (
        <g>
          <circle
            cx="253"
            cy="179"
            r="133"
            fill="none"
            stroke="#aaa"
            strokeWidth="0.5"
            opacity="0.25"
          />
          <path
            d="M 42 180 H 458 M 250 28 V 332"
            fill="none"
            stroke="#aaa"
            strokeWidth="0.5"
            opacity="0.3"
          />
          <g transform="rotate(-22 250 180)">
            <EchoLines />
          </g>
          <circle
            cx="252"
            cy="170"
            r="17"
            fill="#151515"
            stroke="#d3d3d3"
            strokeWidth="0.6"
          />
          <circle
            cx="252"
            cy="170"
            r="9"
            fill="none"
            stroke="#969696"
            strokeWidth="0.5"
          />
          <path
            d="M 326 282 H 415 V 257"
            fill="none"
            stroke="#bababa"
            strokeWidth="0.7"
          />
          <text
            x="326"
            y="297"
            fill="#bdbdbd"
            fontFamily="monospace"
            fontSize="7"
            letterSpacing="1.3"
          >
            ECHO / FREQUENCY 04
          </text>
        </g>
      )}

      <rect
        width="500"
        height="360"
        fill={`url(#${ids.scan})`}
        opacity="0.35"
      />
      <g stroke="#dadada" strokeWidth="0.55" opacity="0.5">
        {coordinates.map(([x, y], i) => (
          <path
            key={i}
            d={`M ${x - 4} ${y} H ${x + 4} M ${x} ${y - 4} V ${y + 4}`}
          />
        ))}
        <path
          d="M 22 47 V 23 H 46 M 454 23 H 478 V 47 M 22 313 V 337 H 46 M 454 337 H 478 V 313"
          fill="none"
        />
      </g>
      <text
        x="470"
        y="330"
        textAnchor="end"
        fill="#aaa"
        fontFamily="monospace"
        fontSize="6.5"
        letterSpacing="1.7"
      >
        {variant.toUpperCase()} — SPECIMEN
      </text>
    </svg>
  );
}
