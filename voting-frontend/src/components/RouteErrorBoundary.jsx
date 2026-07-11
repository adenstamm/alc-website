import { Component } from "react";

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="route-error" id="main-content" role="alert">
          <span className="sideb-logo" aria-hidden="true"><span /></span>
          <p className="sideb-kicker">Playback interrupted</p>
          <h1>That page slipped off the turntable.</h1>
          <p>Reload the site to try that route again.</p>
          <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}

export default RouteErrorBoundary;
