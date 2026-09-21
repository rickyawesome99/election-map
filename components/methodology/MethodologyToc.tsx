"use client";

import { useEffect, useState } from "react";

// "On this page": built from the rendered section headings, so it can never drift from the
// content, with the section in view marked.
export default function MethodologyToc({ contentId }: { contentId: string }) {
  const [items, setItems] = useState<{ id: string; title: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const root = document.getElementById(contentId);
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("section[id]"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the list is read from the rendered DOM
    setItems(sections.map((s) => ({ id: s.id, title: s.querySelector("h2")?.textContent ?? s.id })));
    const observer = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) setActive(e.target.id); },
      { rootMargin: "-15% 0px -75% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [contentId]);

  if (items.length === 0) return null;
  return (
    <nav aria-label="On this page" className="text-[13px] leading-snug">
      <div className="pb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", borderBottom: "2px solid var(--app-text-primary)" }}>On this page</div>
      <ol>
        {items.map((it) => (
          <li key={it.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
            <a href={`#${it.id}`} className="block py-2 hover:underline" aria-current={active === it.id ? "true" : undefined}
              style={{ color: active === it.id ? "var(--app-text-primary)" : "var(--app-text-muted)", fontWeight: active === it.id ? 700 : 500 }}>{it.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
