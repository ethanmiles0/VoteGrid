import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { Contract } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';

type PollCreatorProps = {
  onCreated: () => void;
};

const utcLocalDateTime = (timestampSeconds: number) => {
  const date = new Date(timestampSeconds * 1000);
  const iso = date.toISOString();
  return iso.slice(0, 16);
};

export function PollCreator({ onCreated }: PollCreatorProps) {
  const { isConnected } = useAccount();
  const signerPromise = useEthersSigner();

  const [name, setName] = useState('New Poll');
  const [options, setOptions] = useState<string[]>(['Option A', 'Option B']);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const start = now + 600;
    const end = start + 3600;
    setStartAt(utcLocalDateTime(start));
    setEndAt(utcLocalDateTime(end));
  }, []);

  const canAddOption = useMemo(() => options.length < 4, [options]);
  const canRemoveOption = useMemo(() => options.length > 2, [options]);

  const updateOption = (idx: number, value: string) => {
    setOptions((prev) => prev.map((opt, i) => (i === idx ? value : opt)));
  };

  const addOption = () => {
    if (!canAddOption) return;
    setOptions((prev) => [...prev, `Option ${String.fromCharCode(65 + prev.length)}`]);
  };

  const removeOption = (idx: number) => {
    if (!canRemoveOption) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isConnected) {
      setError('Connect your wallet to create a poll.');
      return;
    }

    const trimmedOptions = options.map((opt) => opt.trim()).filter(Boolean);
    if (trimmedOptions.length < 2 || trimmedOptions.length > 4) {
      setError('Provide between 2 and 4 options.');
      return;
    }

    const startSeconds = Math.floor(new Date(startAt).getTime() / 1000);
    const endSeconds = Math.floor(new Date(endAt).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);

    if (Number.isNaN(startSeconds) || Number.isNaN(endSeconds)) {
      setError('Invalid start or end time.');
      return;
    }
    if (startSeconds < now) {
      setError('Start time must be in the future.');
      return;
    }
    if (endSeconds <= startSeconds) {
      setError('End time must be after start time.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setError('No signer found.');
      return;
    }

    setIsSubmitting(true);
    try {
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.createPoll(name.trim(), trimmedOptions, BigInt(startSeconds), BigInt(endSeconds));
      await tx.wait();
      onCreated();
      setName('New Poll');
      setOptions(['Option A', 'Option B']);
      const newStart = startSeconds + 600;
      const newEnd = newStart + 3600;
      setStartAt(utcLocalDateTime(newStart));
      setEndAt(utcLocalDateTime(newEnd));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create poll.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="panel panel--form">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Create poll</p>
          <h3 className="panel__title">Encrypt every ballot</h3>
        </div>
      </div>

      <form className="form" onSubmit={handleCreate}>
        <label className="field">
          <span className="field__label">Poll title</span>
          <input
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Choose our next release name"
            required
          />
        </label>

        <div className="field">
          <div className="field__label">Options (2-4)</div>
          <div className="options">
            {options.map((opt, idx) => (
              <div key={idx} className="option-row">
                <input
                  className="field__input"
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  required
                />
                {canRemoveOption && (
                  <button type="button" className="ghost-btn" onClick={() => removeOption(idx)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {canAddOption && (
            <button type="button" className="ghost-btn ghost-btn--inline" onClick={addOption}>
              + Add option
            </button>
          )}
        </div>

        <div className="time-grid">
          <label className="field">
            <span className="field__label">Start time (UTC)</span>
            <input
              className="field__input"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">End time (UTC)</span>
            <input
              className="field__input"
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              required
            />
          </label>
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        <button className="primary-btn" type="submit" disabled={isSubmitting || !isConnected}>
          {isSubmitting ? 'Creating...' : 'Launch encrypted poll'}
        </button>
      </form>
    </div>
  );
}
