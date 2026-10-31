import { useCallback, useState } from 'react';
import Bubbles from './components/Bubbles.jsx';
import Home from './components/Home.jsx';
import CallRoom from './components/CallRoom.jsx';

/**
 * Two screens:
 *  - Home:     enter name, create or join a call
 *  - CallRoom: the video call itself
 */
export default function App() {
  const [call, setCall] = useState(null); // { name, mode, code } while in a call
  const [homeError, setHomeError] = useState('');

  const startCall = useCallback((details) => {
    setHomeError('');
    setCall(details);
  }, []);

  const leaveCall = useCallback((errorMessage = '') => {
    setHomeError(errorMessage);
    setCall(null);
  }, []);

  return (
    <>
      <Bubbles />
      {call ? (
        <CallRoom {...call} onLeave={leaveCall} />
      ) : (
        <Home onStart={startCall} initialError={homeError} />
      )}
    </>
  );
}
