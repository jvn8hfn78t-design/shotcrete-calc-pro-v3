<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->


## Guía de diseño para agentes de programación

- Leer `DESIGN.md` antes de rediseñar Calculadora, Fotogrametría o estilos globales.
- El contexto es una PWA técnica, offline y mobile-first para labores subterráneas; no una landing page.
- Aplicar criterios de `design-taste-frontend` cuando la skill esté instalada; preservar tokens, textos técnicos y funciones existentes.
- Usar `awesome-design-md` como biblioteca de referencias, no como dependencia de producción.
- Verificar en navegador con `playwright-cli` cuando esté disponible. Instrucciones en `docs/SETUP-DESIGN-TOOLS.md`.
- Nunca confundir el visor 3D calculado con un levantamiento 3D fotogramétrico validado.
- No modificar fórmulas de shotcrete, PDF, almacenamiento local u operaciones offline durante una mejora meramente visual.
