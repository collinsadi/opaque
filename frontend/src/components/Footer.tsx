import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="py-4 px-4 text-center text-slate-600 text-xs">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mb-2">
        <Link
          to="/privacy"
          className="hover:text-slate-400 transition-colors"
        >
          Privacy
        </Link>
        <Link
          to="/terms"
          className="hover:text-slate-400 transition-colors"
        >
          Terms
        </Link>
        <Link
          to="/disclaimer"
          className="hover:text-slate-400 transition-colors"
        >
          Disclaimer
        </Link>
      </nav>
      <p className="font-mono text-slate-600">
        © 2026 Opaque Protocol. Built on EIP-5564.
      </p>
    </footer>
  );
}
