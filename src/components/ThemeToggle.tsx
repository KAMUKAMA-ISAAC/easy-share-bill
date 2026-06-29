import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("splitit:prefs");
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        setIsDark(prefs.theme === "dark");
        document.documentElement.classList.toggle("dark", prefs.theme === "dark");
      } catch {}
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDark(prefersDark);
      document.documentElement.classList.toggle("dark", prefersDark);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    document.documentElement.classList.toggle("dark", newTheme);
    
    try {
      const saved = localStorage.getItem("splitit:prefs");
      const prefs = saved ? JSON.parse(saved) : {};
      prefs.theme = newTheme ? "dark" : "light";
      localStorage.setItem("splitit:prefs", JSON.stringify(prefs));
    } catch {}
  };

  return (
    <button
      onClick={toggleTheme}
      className="relative size-9 rounded-xl bg-muted/50 hover:bg-muted transition-all duration-300 flex items-center justify-center group touch-manipulation"
      aria-label="Toggle theme"
    >
      <div className="relative size-5">
        {/* Sun icon (light mode) */}
        <Sun 
          className={`absolute inset-0 size-5 transition-all duration-500 ${
            isDark 
              ? "opacity-0 rotate-90 scale-0" 
              : "opacity-100 rotate-0 scale-100"
          }`}
        />
        
        {/* Moon icon (dark mode) */}
        <Moon 
          className={`absolute inset-0 size-5 transition-all duration-500 ${
            isDark 
              ? "opacity-100 rotate-0 scale-100" 
              : "opacity-0 -rotate-90 scale-0"
          }`}
        />
      </div>
      
      {/* Glow effect on hover */}
      <span className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
