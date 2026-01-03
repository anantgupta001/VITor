export default function Footer() {
  return (
    <footer className="border-t bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-400">
        
        <p>
          © {new Date().getFullYear()} VITor · Built by students, for students
        </p>

        <div className="flex items-center gap-4">
          <a
            href="https://github.com/anantgupta001/VITor"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            GitHub
          </a>

          <a
            href="https://www.linkedin.com/in/anantgupta7628/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            LinkedIn
          </a>
        </div>

      </div>
    </footer>
  );
}
