"use client";

import type { AnchorHTMLAttributes } from "react";
import { useRouter } from "next/navigation";

// A link that swaps the current history entry instead of pushing a new one. Used for
// sibling toggles (a seat's other election years) so Back leaves the toggle group
// entirely rather than stepping through every year the reader clicked.
export default function ReplaceLink({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const router = useRouter();
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        // Leave modified clicks (new tab/window) to the browser.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        router.replace(href);
      }}
      {...rest}
    />
  );
}
