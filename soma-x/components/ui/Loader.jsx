export default function Loader({
  size = 72,
  color = "#ffffff",
  fullScreen = false,
  background = "#203A3A", // SomaBox dark green/teal accent
}) {
  const icon = (
    <svg
      className="sb-loader"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="status"
      aria-label="Loading"
    >
      {/* outer hexagon draws itself */}
      <polygon
        className="sb-hex"
        pathLength="1"
        points="50,6 88,28 88,72 50,94 12,72 12,28"
      />
      {/* stacked layers drop in, bottom to top */}
      <path className="sb-layer" style={{ animationDelay: "0.35s" }} d="M28 60 L50 72 L72 60" />
      <path className="sb-layer" style={{ animationDelay: "0.6s" }} d="M28 50 L50 62 L72 50" />
      <path className="sb-layer" style={{ animationDelay: "0.85s" }} d="M50 24 L72 36 L50 48 L28 36 Z" />

      <style>{`
        .sb-loader { animation: sb-pulse 2.4s ease-in-out infinite; }
        .sb-hex {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: sb-draw 2.4s ease-in-out infinite;
        }
        .sb-layer {
          opacity: 0;
          animation: sb-drop 2.4s ease-in-out infinite backwards;
        }
        @keyframes sb-draw {
          0%   { stroke-dashoffset: 1; }
          40%  { stroke-dashoffset: 0; }
          85%  { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes sb-drop {
          0%   { opacity: 0; transform: translateY(-8px); }
          25%  { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(0); }
        }
        @keyframes sb-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sb-loader, .sb-hex, .sb-layer { animation: none; opacity: 1; stroke-dashoffset: 0; }
        }
      `}</style>
    </svg>
  );

  if (!fullScreen) return icon;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background,
        zIndex: 9999,
      }}
    >
      {icon}
    </div>
  );
}
