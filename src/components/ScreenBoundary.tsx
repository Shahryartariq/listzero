import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * Catches a screen that failed to load or crashed, so the sidebar and the rest of the app stay usable.
 * Shell gives it a new key on every address, so moving to another screen clears it.
 */
export class ScreenBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="view">
        <div className="empty" style={{ paddingTop: 0 }} role="alert">
          <h1 className="empty__title">This screen did not load.</h1>
          <p>Your tasks are safe. If you are offline, it will open once you are back online.</p>
          <div className="empty__actions">
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
