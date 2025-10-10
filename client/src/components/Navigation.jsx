import { useTheme } from "../themes/useTheme.js";

const Navigation = ({ currentPage = "Home" }) => {
  const { changeTheme, availableThemes, currentTheme } = useTheme();

  const navItems = [
    { name: "Home", path: "/" },
    { name: "Scenes", path: "/scenes" },
    { name: "Performers", path: "/performers" },
    { name: "Studios", path: "/studios" },
    { name: "Tags", path: "/tags" },
  ];

  return (
    <nav
      className="container-fluid py-4"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          {/* Logo/Brand */}
          <div className="flex items-center gap-2">
            <div className="text-2xl">🎬</div>
            <span
              className="text-xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              MediaLib
            </span>
          </div>

          {/* Navigation Links */}
          <ul className="flex items-center gap-6">
            {navItems.map((item) => (
              <li key={item.name}>
                <a
                  href={item.path}
                  className={`text-base font-medium transition-colors duration-200 ${
                    currentPage === item.name ? "text-accent" : ""
                  }`}
                  style={{
                    color:
                      currentPage === item.name
                        ? "var(--accent-primary)"
                        : "var(--text-secondary)",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.color = "var(--accent-primary)";
                  }}
                  onMouseLeave={(e) => {
                    if (currentPage !== item.name) {
                      e.target.style.color = "var(--text-secondary)";
                    }
                  }}
                >
                  {item.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Theme selector */}
        <div className="flex items-center gap-4">
          <label
            className="text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Theme:
          </label>
          <select
            value={currentTheme}
            onChange={(e) => changeTheme(e.target.value)}
            className="form-input"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
              minWidth: "120px",
            }}
          >
            {availableThemes.map((theme) => (
              <option key={theme.key} value={theme.key}>
                {theme.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
