import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useApp } from './stores/app'
import './styles/globals.css'

// Semilla de pruebas E2E: expone el store para poder dirigir la app en smoke tests.
;(window as unknown as { __teutonStore?: typeof useApp }).__teutonStore = useApp

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
