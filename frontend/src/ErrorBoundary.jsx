import React from "react";

// Catches render/lifecycle errors anywhere below it in the tree. Without this,
// an uncaught error in any component unmounts the whole React tree and leaves
// a blank white page with nothing but a console stack trace — which is
// exactly the failure mode this project was hitting before this fix.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled UI error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const isDev = import.meta.env.DEV;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ECE9E0",
          fontFamily: "Inter, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 28, color: "#1B2A4A", marginBottom: 8 }}>
            Something went wrong.
          </h1>
          <p style={{ color: "#5B5D57", marginBottom: 24, fontSize: 14 }}>
            The page hit an unexpected error instead of loading normally.
            Trying again usually fixes it — if not, head back to the dashboard.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: isDev ? 24 : 0 }}>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                background: "#1B2A4A", color: "#ECE9E0", border: "none",
                borderRadius: 6, padding: "10px 18px", fontSize: 14, cursor: "pointer",
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
              style={{
                background: "transparent", color: "#1B2A4A", border: "1px solid #CFCABB",
                borderRadius: 6, padding: "10px 18px", fontSize: 14, cursor: "pointer",
              }}
            >
              Go to Dashboard
            </button>
          </div>
          {isDev && (
            <pre
              style={{
                textAlign: "left", background: "#F5F3EC", border: "1px solid #CFCABB",
                borderRadius: 6, padding: 12, fontSize: 12, overflow: "auto", maxHeight: 240,
                color: "#A8442F",
              }}
            >
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
