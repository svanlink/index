import type { CSSProperties } from "react";

interface BrandMarkProps {
  size?: number;
  style?: CSSProperties;
  className?: string;
}

export function BrandMark({ size = 44, style, className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient id="dpc-shell" x1="10" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#677382" />
          <stop offset="1" stopColor="#2A3441" />
        </linearGradient>
        <linearGradient id="dpc-platter" x1="18" y1="14" x2="47" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F3F5F9" />
          <stop offset="0.55" stopColor="#C4CBD4" />
          <stop offset="1" stopColor="#8E97A3" />
        </linearGradient>
        <linearGradient id="dpc-arm" x1="18" y1="35" x2="37" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DCE3EC" />
          <stop offset="1" stopColor="#A9B3C0" />
        </linearGradient>
        <linearGradient id="dpc-cable" x1="24" y1="43" x2="34" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8A24F" />
          <stop offset="1" stopColor="#A55A19" />
        </linearGradient>
      </defs>
      <rect x="6" y="8" width="52" height="48" rx="11" fill="url(#dpc-shell)" />
      <path
        d="M11 20.5C11 17.4624 13.4624 15 16.5 15H31.5C34.5376 15 37 17.4624 37 20.5V34.5C37 37.5376 34.5376 40 31.5 40H16.5C13.4624 40 11 37.5376 11 34.5V20.5Z"
        fill="#1B2530"
        fillOpacity="0.48"
      />
      <circle cx="35.5" cy="28" r="15.5" fill="url(#dpc-platter)" />
      <circle cx="35.5" cy="28" r="4.8" fill="#AEB6C1" />
      <circle cx="35.5" cy="28" r="2.6" fill="#616C78" />
      <circle cx="35.5" cy="28" r="15.5" stroke="#212B37" strokeOpacity="0.28" />
      <path
        d="M18.2 42.5L21.7 45.8C22.2 46.3 22.9 46.6 23.6 46.6H29.8C30.7 46.6 31.5 46.2 32 45.4L33.6 42.8C34 42.1 34.8 41.6 35.6 41.6H39"
        stroke="url(#dpc-cable)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.8 37.5L22.6 31.2C23.2 30.5 24.2 30.3 25.1 30.5L37.4 33.6C38.6 33.9 39.2 35.2 38.6 36.3L37.8 37.9C37.4 38.6 36.7 39.1 35.9 39.2L24 40.8C23.1 40.9 22.2 40.6 21.6 40L16.8 35.5V37.5Z"
        fill="url(#dpc-arm)"
      />
      <circle cx="20.6" cy="35.7" r="4.4" fill="#D5DCE5" stroke="#4B5562" strokeWidth="1.4" />
      <circle cx="20.6" cy="35.7" r="2.2" fill="#6A7480" />
      <circle cx="35.5" cy="9.5" r="2.5" fill="#202A35" opacity="0.75" />
      <circle cx="50.2" cy="20.4" r="2" fill="#202A35" opacity="0.7" />
      <circle cx="13.6" cy="21.3" r="2" fill="#202A35" opacity="0.7" />
      <circle cx="47.6" cy="48.3" r="2" fill="#202A35" opacity="0.7" />
      <circle cx="16.2" cy="48.8" r="2" fill="#202A35" opacity="0.7" />
    </svg>
  );
}
