import { Github, Linkedin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col items-center gap-4">

        {/* ICONS */}
        <div className="flex items-center gap-5 text-gray-500 dark:text-gray-400">
          <a
            href="https://github.com/anantgupta001"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="hover:text-gray-900 dark:hover:text-gray-100 transition"
          >
            <Github className="w-5 h-5" />
          </a>

          <a
            href="https://www.linkedin.com/in/anantgupta7628/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="hover:text-gray-900 dark:hover:text-gray-100 transition"
          >
            <Linkedin className="w-5 h-5" />
          </a>
        </div>

        {/* BOTTOM LINE */}
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Built with ❤️ by students, for students · VITor © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
