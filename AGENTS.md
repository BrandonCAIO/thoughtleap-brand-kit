# Agent instructions for the ThoughtLeap brand kits

Use this package for work Brandon authorizes for ThoughtLeap.ai or ThoughtLeap Studios.

- Read the appropriate BRAND-GUIDE.md first. The two brands share custom identity artwork but have different offers and current website implementations.
- Use exact SVG artwork. Do not substitute a font, trace or generate the ThoughtLeap lettering, or distort its proportions. Credit Kayla Griffin for the original lettering.
- Studios: preserve the single-bevel arrow, smooth broad face, rigid orange sphere, production materials and resolved settings. The source contains experimental options; their existence does not approve their use.
- The imported file named double-bevel-dark-stage.json is a dependency, not the active final preset. The live wrapper overrides doubleBevel to false. Use presets/live-studios.json or the unmodified Studios mountObject wrapper.
- Do not apply the Studios companion variant named ai to thoughtleap.ai and call it production. The actual parent website source is separate in this package.
- Do not treat old source comments, early DESIGN-SYSTEM files or stock Remotion defaults as current direction. Consult the guide's scope and production evidence.
- Treat this repository as a distribution snapshot. Make revisions on a branch; retain original bytes and provenance. Publish a new version with refreshed hashes only when source changes are authorized.
- Do not deploy websites, change domains, alter access to working repositories, or publish client material merely because this kit is available.
- For reuse, prefer relative paths within this package. Do not require another agent to locate files on Brandon's Mac.
