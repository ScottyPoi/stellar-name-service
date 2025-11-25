"use client";

import React,
{
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  isConnected,
  requestAccess,
  getNetwork,
  signTransaction,
} from "@stellar/freighter-api";

type NetworkName = string | null;

interface WalletContextValue {
  isInstalled: boolean;
  isConnecting: boolean;
  publicKey: string | null;           // Freighter address
  network: NetworkName;               // "PUBLIC" | "TESTNET" | "FUTURENET" | "STANDALONE" | null
  networkPassphrase: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  /**
   * Sign a transaction XDR with Freighter.
   * @param txXdr - unsigned tx XDR
   * @param networkName - optional override ("PUBLIC", "TESTNET", etc.)
   * @returns signed transaction XDR
   */
  signTx: (txXdr: string, networkName?: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkName>(null);
  const [networkPassphrase, setNetworkPassphrase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initial probe for Freighter in the browser
  useEffect(() => {
    const checkFreighter = async () => {
      try {
        const res = await isConnected();
        setIsInstalled(!!res?.isConnected);
      } catch (e) {
        console.error(e);
        setIsInstalled(false);
      }
    };

    if (typeof window !== "undefined") {
      void checkFreighter();
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    try {
      // 1) Ask Freighter for permission + address
      const access = await requestAccess();
      if (access.error) {
        const msg =
          typeof access.error === "string"
            ? access.error
            : (access.error as any)?.message ?? "Freighter access denied";
        throw new Error(msg);
      }

      setPublicKey(access.address);

      // 2) Fetch network info from Freighter (optional but useful)
      const netRes = await getNetwork();
      if (netRes.error) {
        const msg =
          typeof netRes.error === "string"
            ? netRes.error
            : (netRes.error as any)?.message ?? "Failed to read Freighter network";
        console.warn(msg);
        setNetwork(null);
        setNetworkPassphrase(null);
      } else {
        setNetwork(netRes.network);
        setNetworkPassphrase(netRes.networkPassphrase);
      }

      setIsInstalled(true);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to connect Freighter");
    } finally {
      const netRes = await getNetwork();
      console.log("Freighter network:", netRes.network);
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    // Freighter doesn't have a real "disconnect" yet; we just clear local state.
    setPublicKey(null);
    setNetwork(null);
    setNetworkPassphrase(null);
  }, []);

  const signTx = useCallback(
    async (txXdr: string, networkNameOverride?: string) => {
      if (!publicKey) {
        throw new Error("No connected account");
      }

      // Prefer explicit override, then the network from Freighter, then fall back to TESTNET.
      const networkName =
        networkNameOverride ?? network ?? "TESTNET";

      try {
        const res = await signTransaction(txXdr, {
          networkPassphrase: networkPassphrase ?? undefined,
          address: publicKey,
        });

        if (res.error) {
          const msg =
            typeof res.error === "string"
              ? res.error
              : (res.error as any)?.message ?? "Failed to sign transaction";
          throw new Error(msg);
        }

        return res.signedTxXdr;
      } catch (e: any) {
        console.error(e);
        throw new Error(e?.message ?? "Failed to sign transaction");
      }
    },
    [publicKey, network, networkPassphrase]
  );

  const value: WalletContextValue = {
    isInstalled,
    isConnecting,
    publicKey,
    network,
    networkPassphrase,
    error,
    connect,
    disconnect,
    signTx,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
};

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return ctx;
}
