import { candidateSlug } from "@/lib/candidateSlug";

export default function CandidateLink({
  name,
  className,
  style,
  onClick,
  children,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  children?: React.ReactNode;
}) {
  const href = `/candidates/${candidateSlug(name)}`;

  return (
    <a href={href} className={className} style={style} onClick={onClick}>
      {children ?? name}
    </a>
  );
}
