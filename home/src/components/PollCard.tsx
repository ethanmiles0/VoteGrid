import { useEffect, useMemo, useState } from 'react';
import { Contract } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';

type PollCardProps = {
  pollId: bigint;
  onActionComplete: () => void;
};

type Metadata = {
  name: string;
  start: number;
  end: number;
  finalized: boolean;
  creator: string;
  optionCount: number;
};

export function PollCard({ pollId, onActionComplete }: PollCardProps) {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading } = useZamaInstance();

  const [choice, setChoice] = useState<number | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [clearResults, setClearResults] = useState<number[] | null>(null);
  const [alert, setAlert] = useState('');

  const { data: rawMetadata, refetch: refetchMetadata } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getPollMetadata',
    args: [pollId],
    query: {
      refetchInterval: 12000,
    },
  });

  const metadata: Metadata | null = useMemo(() => {
    if (!rawMetadata) return null;
    return {
      name: rawMetadata[0] as string,
      start: Number(rawMetadata[1]),
      end: Number(rawMetadata[2]),
      finalized: rawMetadata[3] as boolean,
      creator: rawMetadata[4] as string,
      optionCount: Number(rawMetadata[5]),
    };
  }, [rawMetadata]);

  const { data: options } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getOptions',
    args: [pollId],
    query: { enabled: !!metadata },
  });

  const { data: hasVoted, refetch: refetchHasVoted } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'hasAddressVoted',
    args: address ? [pollId, address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 12000,
    },
  });

  const { data: encryptedResults, refetch: refetchEncryptedResults } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getEncryptedResults',
    args: [pollId],
    query: {
      enabled: Boolean(metadata?.finalized),
    },
  });

  const status = useMemo(() => {
    if (!metadata) return 'Loading';
    const now = Math.floor(Date.now() / 1000);
    if (metadata.finalized) return 'Finalized';
    if (now < metadata.start) return 'Scheduled';
    if (now >= metadata.start && now < metadata.end) return 'Active';
    return 'Ended';
  }, [metadata]);

  useEffect(() => {
    setClearResults(null);
  }, [pollId, metadata?.finalized]);

  const vote = async () => {
    setAlert('');
    if (!metadata || !options) {
      setAlert('Poll not ready.');
      return;
    }
    if (choice === null) {
      setAlert('Select an option before voting.');
      return;
    }
    if (!isConnected) {
      setAlert('Connect your wallet to vote.');
      return;
    }
    if (!instance) {
      setAlert('Zama encryption is still loading.');
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now < metadata.start) {
      setAlert('Voting has not started yet.');
      return;
    }
    if (now >= metadata.end) {
      setAlert('Voting window has closed.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setAlert('No signer available.');
      return;
    }

    setIsVoting(true);
    try {
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.add32(choice);
      const encrypted = await input.encrypt();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.castVote(pollId, encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      setChoice(null);
      refetchHasVoted();
      refetchMetadata();
      onActionComplete();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Vote failed';
      setAlert(message);
    } finally {
      setIsVoting(false);
    }
  };

  const finalize = async () => {
    setAlert('');
    const signer = await signerPromise;
    if (!signer) {
      setAlert('No signer available.');
      return;
    }
    setIsFinalizing(true);
    try {
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.finalizePoll(pollId);
      await tx.wait();
      refetchMetadata();
      refetchEncryptedResults();
      onActionComplete();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Finalize failed';
      setAlert(message);
    } finally {
      setIsFinalizing(false);
    }
  };

  const decrypt = async () => {
    setAlert('');
    if (!instance) {
      setAlert('Zama instance still loading.');
      return;
    }
    if (!encryptedResults || encryptedResults.length === 0) {
      setAlert('No encrypted results available.');
      return;
    }

    setIsDecrypting(true);
    try {
      const handles = encryptedResults.map((h) => h as string);
      const { clearValues } = await instance.publicDecrypt(handles);
      const totals = handles.map((handle) => {
        const value = clearValues[handle];
        if (typeof value === 'bigint') return Number(value);
        if (typeof value === 'number') return value;
        return parseInt(value as string, 10);
      });
      setClearResults(totals);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Decryption failed';
      setAlert(message);
    } finally {
      setIsDecrypting(false);
    }
  };

  if (!metadata) {
    return <div className="poll-card poll-card--loading">Loading poll...</div>;
  }

  const startDate = new Date(metadata.start * 1000).toLocaleString();
  const endDate = new Date(metadata.end * 1000).toLocaleString();

  return (
    <article className="poll-card">
      <div className="poll-card__header">
        <div>
          <p className="eyebrow">Poll #{pollId.toString()}</p>
          <h4 className="poll-card__title">{metadata.name}</h4>
        </div>
        <span className={`status status--${status.toLowerCase()}`}>{status}</span>
      </div>

      <div className="poll-card__meta">
        <div>
          <p className="meta__label">Opens</p>
          <p className="meta__value">{startDate}</p>
        </div>
        <div>
          <p className="meta__label">Closes</p>
          <p className="meta__value">{endDate}</p>
        </div>
        <div>
          <p className="meta__label">Creator</p>
          <p className="meta__value meta__value--mono">{metadata.creator}</p>
        </div>
      </div>

      <div className="options-grid">
        {options?.map((opt, idx) => (
          <button
            key={idx}
            type="button"
            className={`option ${choice === idx ? 'option--active' : ''}`}
            onClick={() => setChoice(idx)}
            disabled={!isConnected || hasVoted === true || status !== 'Active'}
          >
            <div className="option__name">{opt as string}</div>
            {clearResults && clearResults[idx] !== undefined && (
              <div className="option__count">{clearResults[idx]}</div>
            )}
          </button>
        ))}
      </div>

      {alert && <div className="alert alert--error">{alert}</div>}

      <div className="poll-card__actions">
        <button
          className="primary-btn"
          onClick={vote}
          disabled={
            !isConnected ||
            hasVoted === true ||
            choice === null ||
            isVoting ||
            status !== 'Active' ||
            zamaLoading
          }
        >
          {hasVoted ? 'You already voted' : isVoting ? 'Submitting...' : 'Cast encrypted vote'}
        </button>
        <button
          className="ghost-btn"
          onClick={finalize}
          disabled={isFinalizing || status !== 'Ended'}
        >
          {isFinalizing ? 'Finalizing...' : 'Finalize poll'}
        </button>
        <button
          className="ghost-btn"
          onClick={decrypt}
          disabled={!metadata.finalized || isDecrypting || !encryptedResults}
        >
          {isDecrypting ? 'Decrypting...' : 'Decrypt results'}
        </button>
      </div>
    </article>
  );
}
