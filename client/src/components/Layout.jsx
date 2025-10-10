import Navigation from "./Navigation.jsx";

const Layout = ({ children }) => {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <Navigation />
      <main>{children}</main>
    </div>
  );
};

export default Layout;
