import React from "react";
import { createRoot } from "react-dom/client";
import { TideCloakContextProvider } from "@tidecloak/react";
import App from "./App.jsx";
import "./style.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: "600px", margin: "40px auto", background: "#fff", borderRadius: "12px", border: "1px solid #e0e0e0", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
          <h2 style={{ color: "#d9381e", marginTop: 0 }}>Application Notice</h2>
          <p style={{ color: "#555", fontSize: "14px", lineHeight: "1.6" }}>
            An unexpected error occurred:
          </p>
          <pre style={{ background: "#f8f9fa", padding: "12px", borderRadius: "8px", fontSize: "12px", overflowX: "auto", color: "#333" }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: "16px", padding: "10px 18px", borderRadius: "8px", background: "#185e51", color: "#fff", border: "none", cursor: "pointer", fontWeight: "600" }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <TideCloakContextProvider configUrl="/tidecloak.json">
      <App />
    </TideCloakContextProvider>
  </ErrorBoundary>,
);
