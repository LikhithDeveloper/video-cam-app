import { useState } from 'react';

const CODE_LENGTH = 6;
const NAME_STORAGE_KEY = 'bubblecall:name';

/**
 * Landing screen: enter your name, then either start a new call
 * (you get a code to share) or join a friend's call with their code.
 */
export default function Home({ onStart, initialError }) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_STORAGE_KEY) ?? '');
  const [isJoining, setIsJoining] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(initialError ?? '');

  const trimmedName = name.trim();

  function validateName() {
    if (!trimmedName) {
      setError('Please enter your name first.');
      return false;
    }
    localStorage.setItem(NAME_STORAGE_KEY, trimmedName);
    return true;
  }

  function handleCreate() {
    if (validateName()) onStart({ name: trimmedName, mode: 'create' });
  }

  function handleJoin(event) {
    event.preventDefault();
    if (!validateName()) return;
    if (code.length !== CODE_LENGTH) {
      setError(`The code has ${CODE_LENGTH} characters.`);
      return;
    }
    onStart({ name: trimmedName, mode: 'join', code });
  }

  return (
    <main className="home">
      <div className="card glass">
        <div className="logo">
          <span className="logo-bubble" />
          <h1>BubbleCall</h1>
        </div>
        <p className="tagline">Crystal-clear, real-time video calls. Just share a code.</p>

        <label className="field">
          <span>Your name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="e.g. Alex"
            maxLength={30}
            autoFocus
          />
        </label>

        {!isJoining ? (
          <div className="actions">
            <button className="btn btn-primary" onClick={handleCreate}>
              Create a call
            </button>
            <button className="btn btn-ghost" onClick={() => setIsJoining(true)}>
              Join with a code
            </button>
          </div>
        ) : (
          <form className="actions" onSubmit={handleJoin}>
            <label className="field">
              <span>Call code</span>
              <input
                className="code-input"
                type="text"
                value={code}
                onChange={(e) => {
                  // Keep only letters/numbers, uppercase, max 6 characters.
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH));
                  setError('');
                }}
                placeholder="ABC123"
                autoComplete="off"
                autoFocus
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Join call
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setIsJoining(false)}>
              Back
            </button>
          </form>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
