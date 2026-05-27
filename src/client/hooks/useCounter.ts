import { useCallback, useEffect, useState } from 'react';
import type {
  ActionResponse,
  DashboardSnapshot,
  InitResponse,
  RefreshResponse,
} from '../../shared/api';

type HiveState = {
  postId: string | null;
  snapshot: DashboardSnapshot | null;
  username: string | null;
  actionMessage: string | null;
  loading: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseError = async (response: Response): Promise<string> => {
  const fallback = `HTTP ${response.status}`;
  try {
    const parsed = await response.json();
    if (!isRecord(parsed)) {
      return fallback;
    }

    const message = parsed.message;
    return typeof message === 'string' ? message : fallback;
  } catch {
    return fallback;
  }
};

export const useCounter = () => {
  const [state, setState] = useState<HiveState>({
    postId: null,
    snapshot: null,
    username: null,
    actionMessage: null,
    loading: true,
  });

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) {
          throw new Error(await parseError(res));
        }

        const data: InitResponse = await res.json();
        if (data.type !== 'init') {
          throw new Error('Unexpected response');
        }

        setState({
          postId: data.postId,
          snapshot: data.snapshot,
          username: data.username,
          actionMessage: null,
          loading: false,
        });
      } catch (err) {
        console.error('Failed to initialize HiveCatch dashboard', err);
        setState((prev) => ({ ...prev, loading: false }));
      }
    };

    void init();
  }, []);

  const refresh = useCallback(async () => {
    if (!state.postId) {
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/refresh?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(await parseError(res));
      }

      const data: RefreshResponse = await res.json();
      if (data.type !== 'refresh') {
        throw new Error('Unexpected refresh response');
      }

      setState((prev) => ({
        ...prev,
        snapshot: data.snapshot,
        actionMessage: 'Dashboard refreshed from live data.',
        loading: false,
      }));
    } catch (err) {
      console.error('Failed to refresh HiveCatch dashboard', err);
      setState((prev) => ({
        ...prev,
        actionMessage: 'Refresh failed. Please try again.',
        loading: false,
      }));
    }
  }, [state.postId]);

  const banHive = useCallback(
    async (options?: {
      selectedUsers?: string[];
      selectedClusters?: string[];
    }) => {
      if (!state.postId) {
        return;
      }

      setState((prev) => ({ ...prev, loading: true }));
      try {
        const res = await fetch('/api/mod/ban-hive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedUsers: options?.selectedUsers ?? [],
            selectedClusters: options?.selectedClusters ?? [],
          }),
        });

        if (!res.ok) {
          throw new Error(await parseError(res));
        }

        const data: ActionResponse = await res.json();
        if (data.type !== 'action') {
          throw new Error('Unexpected action response');
        }

        setState((prev) => ({
          ...prev,
          actionMessage: data.message,
          loading: false,
        }));

        await refresh();
      } catch (err) {
        console.error('Failed to action detected hive', err);
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [refresh, state.postId]
  );

  const previewBan = useCallback(
    async (options?: {
      selectedUsers?: string[];
      selectedClusters?: string[];
    }) => {
      if (!state.postId) {
        return null;
      }

      setState((prev) => ({ ...prev, loading: true }));
      try {
        const res = await fetch('/api/mod/ban-hive?dryRun=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedUsers: options?.selectedUsers ?? [],
            selectedClusters: options?.selectedClusters ?? [],
          }),
        });

        if (!res.ok) {
          throw new Error(await parseError(res));
        }

        const data: ActionResponse = await res.json();
        if (data.type !== 'action') {
          throw new Error('Unexpected action response');
        }

        setState((prev) => ({
          ...prev,
          actionMessage: data.message,
          loading: false,
        }));

        return data;
      } catch (err) {
        console.error('Failed to preview hive ban', err);
        setState((prev) => ({
          ...prev,
          actionMessage: 'Preview failed. Please try again.',
          loading: false,
        }));
        return null;
      }
    },
    [state.postId]
  );

  const removeCluster = useCallback(
    async (root: string) => {
      if (!state.postId) {
        return;
      }

      setState((prev) => ({ ...prev, loading: true }));
      try {
        const res = await fetch('/api/clusters/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ root }),
        });

        if (!res.ok) {
          throw new Error(await parseError(res));
        }

        const data = await res.json();
        setState((prev) => ({
          ...prev,
          snapshot: data.snapshot ?? prev.snapshot,
          actionMessage: data.message ?? 'Cluster removed.',
          loading: false,
        }));
      } catch (err) {
        console.error('Failed to remove cluster', err);
        setState((prev) => ({
          ...prev,
          actionMessage: 'Cluster removal failed. Please try again.',
          loading: false,
        }));
      }
    },
    [state.postId]
  );

  const deleteSignal = useCallback(
    async (incidentId: string) => {
      if (!state.postId) {
        return;
      }

      setState((prev) => ({ ...prev, loading: true }));
      try {
        const res = await fetch('/api/signals/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incidentId }),
        });

        if (!res.ok) {
          throw new Error(await parseError(res));
        }

        const data = await res.json();
        setState((prev) => ({
          ...prev,
          snapshot: data.snapshot ?? prev.snapshot,
          actionMessage: 'Signal deleted from dashboard.',
          loading: false,
        }));
      } catch (err) {
        console.error('Failed to delete signal', err);
        setState((prev) => ({
          ...prev,
          actionMessage: 'Delete failed. Please try again.',
          loading: false,
        }));
      }
    },
    [state.postId]
  );

  return {
    ...state,
    refresh,
    banHive,
    previewBan,
    deleteSignal,
    removeCluster,
  } as const;
};
