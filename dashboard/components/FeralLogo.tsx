"use client"

interface FeralLogoProps {
  size?: number
  className?: string
}

export function FeralLogo({ size = 36, className = "" }: FeralLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background rounded square */}
      <rect width="36" height="36" rx="9" fill="#0284c7" />

      {/* Stylised F mark — two horizontal bars + vertical spine */}
      {/* Vertical spine */}
      <rect x="10" y="9" width="3.5" height="18" rx="1.5" fill="white" />
      {/* Top horizontal bar — full width */}
      <rect x="10" y="9" width="16" height="3.5" rx="1.5" fill="white" />
      {/* Mid horizontal bar — three-quarter width, with a slight gap suggesting motion/speed */}
      <rect x="10" y="16.25" width="11" height="3" rx="1.5" fill="white" />

      {/* Right-side accent tick — suggests a checkmark / enforcement mark */}
      <path
        d="M23 19.5 L26 16 L27.5 17.5 L23.5 22 L21 19.5 L22.5 18z"
        fill="white"
        opacity="0.9"
      />
    </svg>
  )
}
