export type IconName =
  | "brand"
  | "shield"
  | "analysis"
  | "document"
  | "check"
  | "alert"
  | "arrowRight"
  | "arrowLeft"
  | "refresh"
  | "wifiOff"
  | "help"
  | "clock"
  | "input";

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * 统一的线性 SVG 图标。图标只作视觉辅助，调用处必须保留可见文字，
 * 因而默认从无障碍树中隐藏。
 */
export function Icon({ name, size = 24, strokeWidth = 1.8, className }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
    focusable: false,
  };

  switch (name) {
    case "brand":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 3.3v11.1c0 1.7.7 2.3 2.4 3 2.4.9 2.8 2.1.8 3.1-1.4.7-3.9.9-5.8 1.7" />
          <path d="M12 5.2c-1.1 1.4-2.4 2.2-4.2 2.8M12 5.2c1.1 1.4 2.4 2.2 4.2 2.8" />
          <path d="M12 8.1c-1.5 1.7-3.3 2.8-5.7 3.4M12 8.1c1.5 1.7 3.3 2.8 5.7 3.4" />
          <path d="M12 11.2c-1.7 1.7-3.8 2.8-6.4 3.3M12 11.2c1.7 1.7 3.8 2.8 6.4 3.3" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 19 6v5c0 4.6-2.8 8.1-7 10-4.2-1.9-7-5.4-7-10V6l7-3Z" />
          <path d="m9.2 12 1.8 1.8 3.9-4" />
        </svg>
      );
    case "analysis":
      return (
        <svg {...common}>
          <path d="M4 4h11a2 2 0 0 1 2 2v5" />
          <path d="M7 8h7M7 12h4M7 16h3" />
          <circle cx="16.5" cy="16.5" r="3.5" />
          <path d="m19 19 2 2" />
        </svg>
      );
    case "document":
      return (
        <svg {...common}>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v5h5M9 12h6M9 16h6" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12.5 4 4L19 7" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M12 3 2.8 20h18.4L12 3Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      );
    case "arrowRight":
      return (
        <svg {...common}>
          <path d="M5 12h14M14 7l5 5-5 5" />
        </svg>
      );
    case "arrowLeft":
      return (
        <svg {...common}>
          <path d="M19 12H5M10 7l-5 5 5 5" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 7v5h-5" />
          <path d="M18.5 16a8 8 0 1 1 .8-8.8L20 12" />
        </svg>
      );
    case "wifiOff":
      return (
        <svg {...common}>
          <path d="m3 3 18 18" />
          <path d="M8.5 8.5A12.7 12.7 0 0 1 12 8c3.5 0 6.6 1.4 8.8 3.7" />
          <path d="M5.2 11.7c.6-.6 1.3-1.1 2-1.6M8.7 15.2A5.2 5.2 0 0 1 12 14c1.1 0 2.1.3 3 .9" />
          <path d="M12 19h.01M3.2 11.7A12.4 12.4 0 0 1 5 10.2" />
        </svg>
      );
    case "help":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.8 9a2.3 2.3 0 1 1 3.8 1.8c-1 .8-1.6 1.2-1.6 2.7M12 17h.01" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "input":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h10M4 18h7" />
          <path d="m15 15 3 3 3-3" />
        </svg>
      );
  }
}
