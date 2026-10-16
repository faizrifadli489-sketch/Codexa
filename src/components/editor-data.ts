export const languages = ['HTML', 'JavaScript', 'CSS', 'Python', 'TypeScript', 'Ruby', 'PHP', 'SQL', 'Go', 'Rust', 'Java', 'C++'];
export type FileItem = { name: string; type: string; badge: string; language: string; content: string };
export const files: FileItem[] = [
 { name: 'index.html', type: 'html', badge: '<>', language: 'HTML', content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport"
    content="width=device-width, initial-scale=1.0" />
  <title>Bloom — A little more possibility</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <!-- Something good starts here. -->
  <nav class="navbar">
    <a href="/" class="logo">bloom.</a>
    <a href="#about">Our story</a>
  </nav>

  <main class="hero">
    <span class="eyebrow">A FRESH PERSPECTIVE</span>
    <h1>Make room for<br />better ideas.</h1>
    <p>A little space. A new beginning.
       Something that's entirely yours.</p>
    <button class="btn-primary">
      Let's get started <span>↗</span>
    </button>
  </main>

  <script src="script.js"></script>
</body>
</html>` },
 { name: 'styles.css', type: 'css', badge: '#', language: 'CSS', content: `/* A little breathing room */
:root {
  --accent: #83d8b2;
  --background: #181a1b;
}

body {
  margin: 0;
  font-family: sans-serif;
  background: var(--background);
}

.hero {
  max-width: 960px;
  margin: 0 auto;
  padding: 80px 24px;
}

h1 {
  font-size: 64px;
  line-height: 1.1;
}

@media (max-width: 640px) {
  h1 { font-size: 36px; }
}` },
 { name: 'script.js', type: 'js', badge: 'JS', language: 'JavaScript', content: `// Good things are on the way.
const button = document.querySelector('.btn-primary');

function sayHello(name = 'world') {
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return message;
}

button.addEventListener('click', () => {
  sayHello('Bloom');
});

export default sayHello;` },
 { name: 'main.py', type: 'python', badge: 'Py', language: 'Python', content: `# A fresh start with Python
from datetime import datetime

def greet(name: str) -> str:
    return f"Hello, {name}!"

if __name__ == "__main__":
    print(greet("Bloom"))
    print(datetime.now())` },
 { name: 'README.md', type: 'other', badge: 'M↓', language: 'Markdown', content: `# Bloom

A little space for better ideas.

## Project

- index.html — the starting point
- styles.css — make it yours
- script.js — bring it to life

Made with care, in kode.` },
 { name: 'package.json', type: 'other', badge: '{}', language: 'JSON', content: `{
  "name": "bloom",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "devDependencies": {
    "vite": "^7.0.0"
  }
}` },
];
export const plugins = [
 { name: 'Prettier', author: 'Prettier', description: 'A consistent style for every line of code.', symbol: '≋', downloads: '48.2M', installed: true },
 { name: 'Python', author: 'Microsoft', description: 'IntelliSense, linting, and Python language tools.', symbol: 'Py', downloads: '132M', installed: false },
 { name: 'Live Server', author: 'Ritwick Dey', description: 'A local development server with live reload.', symbol: 'ϟ', downloads: '54.8M', installed: false },
 { name: 'ESLint', author: 'Microsoft', description: 'Find and fix problems in your JavaScript.', symbol: 'ES', downloads: '42.1M', installed: true },
 { name: 'PHP IntelliSense', author: 'Felix Becker', description: 'Smart completions for your PHP projects.', symbol: '<?', downloads: '12.6M', installed: false },
 { name: 'Ruby', author: 'Ruby LSP', description: 'Rich language support for Ruby development.', symbol: '◇', downloads: '9.4M', installed: false },
];

const META: Record<string, [type: string, badge: string, language: string]> = {
 html: ['html', '<>', 'HTML'], css: ['css', '#', 'CSS'], js: ['js', 'JS', 'JavaScript'], mjs: ['js', 'JS', 'JavaScript'],
 ts: ['ts', 'TS', 'TypeScript'], tsx: ['ts', 'TS', 'TypeScript'], py: ['python', 'Py', 'Python'], md: ['other', 'M↓', 'Markdown'],
 json: ['other', '{}', 'JSON'], php: ['other', 'Ph', 'PHP'], rb: ['other', 'Rb', 'Ruby'], sql: ['other', 'Sq', 'SQL'],
 go: ['other', 'Go', 'Go'], rs: ['other', 'Rs', 'Rust'], java: ['other', 'Jv', 'Java'], cpp: ['other', 'C+', 'C++'],
};
export function fileMeta(name: string): Pick<FileItem, 'type' | 'badge' | 'language'> {
 const [type, badge, language] = META[name.split('.').pop()?.toLowerCase() ?? ''] ?? ['other', '≡', 'Text'];
 return { type, badge, language };
}
