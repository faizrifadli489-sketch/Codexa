import { createFileRoute } from '@tanstack/react-router';
import { CodeWorkspace } from '@/components/code-workspace';
export const Route = createFileRoute('/')({
 head: () => ({ meta: [
  { title: 'kode. — Your pocket coding workspace' },
  { name: 'description', content: 'A mobile-friendly coding workspace with a colorful editor, terminal, language tools and plugins.' },
  { property: 'og:title', content: 'kode. — Your pocket coding workspace' },
  { property: 'og:description', content: 'A little space for your next big idea. Your coding workspace, wherever you are.' },
  { property: 'og:type', content: 'website' },
  { name: 'twitter:card', content: 'summary_large_image' },
 ] }),
 component: CodeWorkspace,
});
