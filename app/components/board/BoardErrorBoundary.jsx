"use client";

import { Component } from "react";

/** Keeps the board usable if playhtml/PartyKit init fails. */
export default class BoardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { failed: true, message: error?.message || "Board sync unavailable" };
  }

  componentDidCatch(error) {
    console.warn("[Post/Blog Board] playhtml failed, using local drag fallback:", error);
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback?.(this.state.message) ?? this.props.children;
    }
    return this.props.children;
  }
}
