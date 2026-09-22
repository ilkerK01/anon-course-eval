import { type ConnectedAPI, type InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { type NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Binding,
  type FinalizedTransaction,
  Proof,
  SignatureEnabled,
  Transaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { createProofProvider, type ProofProvider, type UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import semver from 'semver';
import type { CourseEvalCircuitKeys, CourseEvalProviders } from '../../api/src/index';
import type { CourseEvalPrivateState } from '../../contract/src/index';
import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider';

export const NETWORK_ID = (import.meta.env.VITE_NETWORK_ID ?? 'preprod') as NetworkId;
const PROOF_SERVER = import.meta.env.VITE_PROOF_SERVER_URL as string | undefined;

export interface WalletSession {
  readonly api: ConnectedAPI;
  readonly walletName: string;
  readonly address: string;
  readonly providers: CourseEvalProviders;
}

const findWallet = (): InitialAPI | undefined =>
  Object.values(window.midnight ?? {}).find(
    (w): w is InitialAPI => !!w && typeof w === 'object' && 'apiVersion' in w && semver.satisfies(w.apiVersion, '4.x'),
  );

const waitForWallet = async (): Promise<InitialAPI> => {
  for (let i = 0; i < 30; i++) {
    const wallet = findWallet();
    if (wallet) return wallet;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Lace wallet not found. Install Lace and enable Midnight (Preprod).');
};

const buildProofProvider = async (
  api: ConnectedAPI,
  zkConfigProvider: FetchZkConfigProvider<CourseEvalCircuitKeys>,
): Promise<ProofProvider> => {
  if (PROOF_SERVER) return httpClientProofProvider(PROOF_SERVER, zkConfigProvider);
  const proving = await api.getProvingProvider({
    getZKIR: (location) => zkConfigProvider.getZKIR(location as CourseEvalCircuitKeys),
    getProverKey: (location) => zkConfigProvider.getProverKey(location as CourseEvalCircuitKeys),
    getVerifierKey: (location) => zkConfigProvider.getVerifierKey(location as CourseEvalCircuitKeys),
  });
  return createProofProvider(proving as any);
};

export const connectWallet = async (): Promise<WalletSession> => {
  setNetworkId(NETWORK_ID);
  const initial = await waitForWallet();
  const api = await initial.connect(NETWORK_ID);
  const config = await api.getConfiguration();
  if (config.networkId !== NETWORK_ID) {
    throw new Error(`Lace is on ${config.networkId}. Switch Midnight to ${NETWORK_ID} in Lace settings.`);
  }
  const shielded = await api.getShieldedAddresses();
  const { unshieldedAddress } = await api.getUnshieldedAddress();
  const zkConfigProvider = new FetchZkConfigProvider<CourseEvalCircuitKeys>(window.location.origin, fetch.bind(window));

  const providers: CourseEvalProviders = {
    privateStateProvider: inMemoryPrivateStateProvider<string, CourseEvalPrivateState>() as any,
    zkConfigProvider,
    proofProvider: await buildProofProvider(api, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const received = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>('signature', 'proof', 'binding', fromHex(received.tx));
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await api.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  } as CourseEvalProviders;

  return { api, walletName: initial.name ?? 'Lace', address: unshieldedAddress, providers };
};

export const readDust = async (session: WalletSession): Promise<{ balance: bigint; cap: bigint }> =>
  session.api.getDustBalance();
