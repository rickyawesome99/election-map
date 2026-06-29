"use client";

import { candidateSlug } from "@/lib/candidateSlug";
import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function getCurrentPath() {
  return `${window.location.pathname}${window.location.search}`;
}

function getServerPath() {
  return "";
}

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
  const candidatePath = `/candidates/${candidateSlug(name)}`;
  const from = useSyncExternalStore(subscribe, getCurrentPath, getServerPath);
  const href = from
    ? `${candidatePath}?from=${encodeURIComponent(from)}`
    : candidatePath;

  return (
    <a href={href} className={className} style={style} onClick={onClick}>
      {children ?? name}
    </a>
  );
}
