import { useCallback, useEffect, useState } from 'react';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { CourseEval } from '../../contract/src/index';
import { deriveState, type CourseState } from '../../api/src/index';

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL ?? 'https://indexer.preprod.midnight.network/api/v4/graphql';

const QUERY = `
  query ContractState($address: HexEncoded!) {
    contractAction(address: $address) {
      state
    }
  }
`;

const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(hex.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));

export const isContractAddress = (value: string): boolean => /^[0-9a-fA-F]{64}$/.test(value);

export function useCourseState(address: string | null, refreshMs = 10_000) {
  const [state, setState] = useState<CourseState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address || !isContractAddress(address)) {
      setState(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(INDEXER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { address } }),
      });
      const body = await res.json();
      if (body.errors) throw new Error(body.errors[0]?.message ?? 'Indexer query failed');
      const hex = body.data?.contractAction?.state;
      if (!hex) throw new Error('No course found at this address yet');
      const contractState = ContractState.deserialize(hexToBytes(hex));
      setState(deriveState(CourseEval.ledger(contractState.data)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void refresh();
    if (!address) return;
    const id = setInterval(() => void refresh(), refreshMs);
    return () => clearInterval(id);
  }, [address, refresh, refreshMs]);

  return { state, error, loading, refresh };
}
