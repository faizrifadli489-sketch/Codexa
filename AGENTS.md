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

- Keep the workspace shell in a browser-safe React component and sample editor data in a separate module; workspace logic (file ops, virtual terminal, preview/run) lives in `workspace-logic.ts`. Run user code only inside a sandboxed iframe or Web Worker, never in the app window; plugins are still UI-only.
- Define workspace styling and syntax colors in the global semantic design system; shared controls use the existing Button component for consistent interaction states.
