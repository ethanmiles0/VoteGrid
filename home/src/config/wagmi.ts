import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'VoteGrid',
  projectId: '2d6c96c9a3dbabbd9e2b4df1d030e1a5',
  chains: [sepolia],
  ssr: false,
});
