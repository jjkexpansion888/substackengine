import Image from "next/image";
import styles from "./BrandLogo.module.css";

export type BrandLogoProps = {
  size?: 24 | 32 | 40 | 48 | 64 | 96;
  showWordmark?: boolean;
  className?: string;
  priority?: boolean;
  label?: string;
};

export function BrandLogo({
  size = 40,
  showWordmark = false,
  className,
  priority = false,
  label = "Substack Engine",
}: BrandLogoProps) {
  return (
    <span
      className={[styles.logo, className].filter(Boolean).join(" ")}
      role="img"
      aria-label={label}
    >
      <Image
        src="/brand/baekho-radar.png"
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        priority={priority}
        className={styles.mark}
        style={{ width: size, height: size }}
      />
      {showWordmark && (
        <span className={styles.wordmark} aria-hidden="true">
          <span className={styles.name}>Substack Engine</span>
          <span className={styles.product}>Publication research</span>
        </span>
      )}
    </span>
  );
}

export default BrandLogo;
