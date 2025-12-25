import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Header } from './Header';
import { PollCreator } from './PollCreator';
import { PollCard } from './PollCard';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import '../styles/VoteGrid.css';

export function VoteGridApp() {
  const { isConnected } = useAccount();
  const [refreshIndex, setRefreshIndex] = useState(0);

  const { data: totalPolls, refetch: refetchTotal, isFetching } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'totalPolls',
    query: {
      refetchInterval: 15000,
    },
  });

  const pollIds = useMemo(() => {
    if (!totalPolls) return [];
    const count = Number(totalPolls);
    return Array.from({ length: count }, (_, idx) => BigInt(idx));
  }, [totalPolls, refreshIndex]);

  const handleRefresh = () => {
    setRefreshIndex((prev) => prev + 1);
    refetchTotal();
  };

  return (
    <div className="layout">
      <div className="layout__glow layout__glow--left" />
      <div className="layout__glow layout__glow--right" />
      <Header />

      <main className="layout__main">
        <section className="hero">
          <div>
            <p className="eyebrow">Private polls</p>
            <h2 className="hero__title">Launch encrypted votes in seconds.</h2>
            <p className="hero__copy">
              Zama FHE keeps every ballot private until the deadline. Once a poll ends, results become public and
              decryptable by anyone.
            </p>
            <div className="hero__stats">
              <div className="stat">
                <span className="stat__label">Active network</span>
                <span className="stat__value">Sepolia</span>
              </div>
              <div className="stat">
                <span className="stat__label">Polls created</span>
                <span className="stat__value">{totalPolls ? Number(totalPolls).toString() : isFetching ? '…' : '0'}</span>
              </div>
              <div className="stat">
                <span className="stat__label">Encryption</span>
                <span className="stat__value">Zama FHE</span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid">
          <div className="grid__col">
            <PollCreator onCreated={handleRefresh} />
          </div>
          <div className="grid__col">
            <div className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Live polls</p>
                  <h3 className="panel__title">Vote and monitor outcomes</h3>
                </div>
              </div>
              {!isConnected && (
                <div className="panel__empty">Connect your wallet to vote or finalize polls on Sepolia.</div>
              )}
              {pollIds.length === 0 && (
                <div className="panel__empty">No polls yet. Create the first encrypted vote above.</div>
              )}
              <div className="polls">
                {pollIds.map((id) => (
                  <PollCard key={id.toString()} pollId={id} onActionComplete={handleRefresh} />
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
