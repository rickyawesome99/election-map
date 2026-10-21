import Link from "next/link";
import { candidateSlug } from "@/lib/candidateSlug";

export default function CandidateLink({
  name,
  state,
  className,
  style,
  onClick,
  children,
}: {
  name: string;
  /** The race's state: tells apart two candidates who share a name (lib/candidateSlug.ts). */
  state?: string | null;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  children?: React.ReactNode;
}) {
  const href = `/candidates/${candidateSlug(name, state)}`;

  return (
    <Link prefetch={false} href={href} className={className} style={style} onClick={onClick}>
      {children ?? name}
    </Link>
  );
}
