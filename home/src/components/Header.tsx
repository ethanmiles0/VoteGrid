import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/VoteGrid.css';

export function Header() {
  return (
    <header className="header">
      <div className="header__brand">
        <div className="header__pill">Encrypted voting on Sepolia</div>
        <div>
          <h1 className="header__title">VoteGrid</h1>
          <p className="header__subtitle">Create polls, cast Zama-encrypted votes, and decrypt results only when polls close.</p>
        </div>
      </div>
      <ConnectButton />
    </header>
  );
}
