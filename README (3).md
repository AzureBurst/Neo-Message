# Chat font

The message stream is set in **Inpin HongMengTi** (印品鸿蒙体).

Font files are not included here — licensing varies, so download it
yourself and drop it in this folder named exactly:

    InpinHongMengTi.woff2     (preferred)
    InpinHongMengTi.woff      (optional fallback)
    InpinHongMengTi.ttf       (optional fallback)

Any one of the three is enough. If you only have a `.ttf` or `.otf`,
convert it at a tool like transfonter.org or cloudconvert — woff2 is
roughly a third of the size, which matters on a phone at the table.

Until a file is present the app falls back through HarmonyOS Sans SC,
Noto Sans SC, PingFang SC and Microsoft YaHei, so it stays readable
either way. Change the order in the `--font-chat` variable at the top
of `css/neo.css`.
