import { Component } from 'react'

// App-wide safety net: if any page throws during render, show a friendly
// fallback (with a reload button) instead of a blank white screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    try { console.error('UI error caught by ErrorBoundary:', error, info) } catch {}
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center bg-white">
          <div className="max-w-sm">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-lg">R</span>
            </div>
            <h1 className="text-xl font-bold text-gray-800">Something went wrong</h1>
            <p className="text-gray-500 mt-2 text-sm">Please reload the page. If it keeps happening, contact support.</p>
            <button
              onClick={() => { try { window.location.reload() } catch {} }}
              className="mt-5 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors">
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
