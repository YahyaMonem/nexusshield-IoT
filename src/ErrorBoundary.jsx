import { Component } from 'react'

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error, info) {
        console.error('Application render error:', error, info)
    }

    render() {
        if (this.state.error) {
            return (
                <div className="app-error-state">
                    <div className="app-error-card">
                        <h1>Something went wrong</h1>
                        <p>{this.state.error.message}</p>
                        <button className="btn btn-primary" onClick={() => window.location.reload()}>
                            Reload app
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
