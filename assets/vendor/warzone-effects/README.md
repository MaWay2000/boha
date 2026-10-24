# Warzone 2100 flame effect texture

`page-21-fx.png` is an unmodified original Warzone 2100 effect atlas from
[`Warzone2100/data-texpages`](https://github.com/Warzone2100/data-texpages/blob/009ec2f652a6230d8315cc3db4eadb5690f18fbd/page-21-fx.png),
revision `009ec2f652a6230d8315cc3db4eadb5690f18fbd` (retrieved 2026-10-24).

SHA-256: `20e3aa2a9ade8448e87c26edcb96e04d7dc3196d080544e3414119253cffc4d1`.

Original game source/data copyright: Pumpkin Studios / Eidos Interactive and
Warzone 2100 contributors. This asset is GPL-2.0-or-later; see the accompanying
unmodified `COPYING` and `COPYING.README`. This asset is not covered by the
website's MIT license.

The bundled `mapmaker/pies/components/weapons/weapons.json` associates
`Flame1Mk1` with `GNLFLMR.PIE`, `TRLFLMR.PIE` and `FXLThrow.PIE`.
`mapmaker/pies/fxlthrow.pie` defines a crossed-plane flame projectile with seven
9×26 atlas frames beginning at (168, 28) on this 256×256 texture. The web effect
uses those same sprite frames, with additive-style screen blending and 66ms
frame timing from the [official effect definition](https://github.com/Warzone2100/warzone2100/blob/master/data/base/effects/fxlthrow.pie).

The browser stream uses layered screen-facing sprite particles rather than a
new WebGL context. It recreates the game artwork/animation, not the complete
engine projectile simulation. Mini-game damage and the existing hit cone are
unchanged.
