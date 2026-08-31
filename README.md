# Your graphics go here

The two files in this folder are placeholders. Replace them with your own
and the app picks them up — no code changes needed, as long as you keep
the filenames.

| File | Where it shows | Recommended size |
|---|---|---|
| `favicon.svg` | Browser tab, phone home screen | Square, 64×64 or any square SVG |
| `logo.svg` | Top of the sign-in screen | About 260×48, transparent background |

PNG works too. If you swap to PNG, update the two references:

- `index.html` — the `<link rel="icon">` line and the `#brandLogo` image
- `app.html` and `admin.html` — the `<link rel="icon">` line

The logo on the sign-in screen only appears once the file loads, so a
missing file leaves the text wordmark in place rather than a broken icon.

## Changing the colors

Every color lives at the top of `css/neo.css` under `:root`. The two that
matter most:

```css
--signal: #FF7A3D;   /* the network: status bar, admin chrome, accents */
--sent:   #2F6BFF;   /* you: your own message bubbles, primary buttons */
```

Change those two and the whole app shifts with them.

## Changing the carrier name

`js/config.js`, the `CARRIER_NAME` value. It's the text next to the signal
bars at the top of every screen. Anything short works — a corp name, a
faction, whatever fits the setting.

## Adding a carrier logo to the status bar

If you want a small graphic next to the signal bars instead of text, drop
your file here as `carrier.svg` and edit `mountCarrier()` in `js/supa.js` —
swap the `<span class="carrier-name">` line for:

```js
`<img src="assets/carrier.svg" alt="" class="carrier-logo">`
```
