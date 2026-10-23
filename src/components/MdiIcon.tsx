interface MdiIconProps {
  path: string;
  size?: number;
  className?: string;
  title?: string;
}

export function MdiIcon({
  path,
  size = 15,
  className = '',
  title,
}: MdiIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`mdi-icon ${className}`}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path fill="currentColor" d={path} />
    </svg>
  );
}
