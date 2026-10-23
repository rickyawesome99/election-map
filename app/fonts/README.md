# Fonts

IBM Plex Sans (variable, wght 100–700) and IBM Plex Mono (400/500/600), latin subset, as served by
Google Fonts (fonts.gstatic.com, v23 / v20) and loaded through `next/font/local` in `app/layout.tsx`.

Self-hosted so that `next build` never downloads fonts: a Google Fonts fetch that fails on the build
machine fails the whole deploy (v2.84, 2026-10-16, surfaced as `[next]/internal/font/google` module-
not-found errors). Licensed under the SIL Open Font License (LICENSE.txt).

`og-Gelasio-Bold.ttf` is for the link-preview card (`lib/shareCard.tsx`), whose renderer reads TTF
but not woff2: Gelasio Bold (google/fonts, OFL), a Georgia-metric stand-in for the site's Georgia
serif, static instance, latin subset via fontTools.
