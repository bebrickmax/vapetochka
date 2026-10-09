import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07070c",
        }}
      >
        <svg width="140" height="140" viewBox="0 0 64 64">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff3d9a" />
              <stop offset="0.55" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#2ee6ff" />
            </linearGradient>
          </defs>
          <path
            d="M17 18l15 30 15-30"
            fill="none"
            stroke="url(#g)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="32" cy="14" r="3.5" fill="#3dff9e" />
        </svg>
      </div>
    ),
    size,
  );
}
