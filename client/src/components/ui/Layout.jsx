import Navigation from "./Navigation.jsx";

const Layout = ({ children }) => {
  return (
    <div className="layout-container">
      <Navigation />
      <main className="w-full">{children}</main>
    </div>
  );
};

export default Layout;
