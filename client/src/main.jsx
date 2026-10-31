import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Note: <StrictMode> is intentionally not used. In development it mounts every
// component twice, which would open the camera and create a call room twice.
createRoot(document.getElementById('root')).render(<App />);
