# Fonts

IBM Plex Sans (variable, wght 100–700) and IBM Plex Mono (400/500/600), latin subset, as served by
Google Fonts (fonts.gstatic.com, v23 / v20) and loaded through `next/font/local` in `app/layout.tsx`.

Self-hosted so that `next build` never downloads fonts: a Google Fonts fetch that fails on the build
machine fails the whole deploy (v2.84, 2026-10-16, surfaced as `[next]/internal/font/google` module-
not-found errors). Licensed under the SIL Open Font License (LICENSE.txt).
