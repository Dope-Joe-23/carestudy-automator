export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/nursuit-logo.png"
      alt=""
      className={`block aspect-square shrink-0 rounded-full object-contain ${className}`}
    />
  );
}
