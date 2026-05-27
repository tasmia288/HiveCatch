import './index.css';

import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { navigateTo } from '@devvit/web/client';
import { useCounter } from './hooks/useCounter';
import type { ActionResponse } from '../shared/api';

const toRedditCommentsUrl = (postId: string): string => {
  const cleanId = postId.startsWith('t3_') ? postId.slice(3) : postId;
  return `https://www.reddit.com/comments/${cleanId}`;
};

const ClusterIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-4 w-4 text-red-300"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="6" cy="7" r="2" />
    <circle cx="17" cy="7" r="2" />
    <circle cx="12" cy="17" r="2" />
    <path d="M7.7 8.3l2.6 5.1" />
    <path d="M16.3 8.3l-2.6 5.1" />
    <path d="M8.1 17h7.8" />
  </svg>
);

export const App = () => {
  const {
    username,
    snapshot,
    loading,
    actionMessage,
    refresh,
    banHive,
    previewBan,
    deleteSignal,
    removeCluster,
  } = useCounter();

  const [range, setRange] = useState<'all' | 'day' | 'month' | 'year'>('all');
  const [banPreview, setBanPreview] = useState<ActionResponse | null>(null);
  const [confirmBanOpen, setConfirmBanOpen] = useState(false);
  const [selectedBanUsers, setSelectedBanUsers] = useState<string[]>([]);
  const [selectedBanClusters, setSelectedBanClusters] = useState<string[]>([]);
  const [removeClusterPrompt, setRemoveClusterPrompt] = useState<string | null>(
    null
  );

  const rangeMs = {
    all: Number.POSITIVE_INFINITY,
    day: 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  } as const;

  const visibleIncidents = useMemo(() => {
    const incidents = snapshot?.incidents ?? [];
    if (range === 'all') {
      return incidents;
    }

    const cutoff = Date.now() - rangeMs[range];
    return incidents.filter((incident) => incident.ts >= cutoff);
  }, [range, snapshot?.incidents]);

  const visibleSuspects = useMemo(() => {
    if (range === 'all') {
      return snapshot?.suspects ?? [];
    }

    const visibleSuspectNames = new Set(
      visibleIncidents.map((incident) => incident.suspect)
    );
    return (snapshot?.suspects ?? []).filter((suspect) =>
      visibleSuspectNames.has(suspect.username)
    );
  }, [range, snapshot?.suspects, visibleIncidents]);

  const rangeLabel =
    range === 'all'
      ? 'all time'
      : range === 'day'
        ? 'last 24 hours'
        : range === 'month'
          ? 'last 30 days'
          : 'last 365 days';

  const suspects = visibleSuspects;
  const incidents = visibleIncidents;

  const handleReviewBan = async () => {
    const preview = await previewBan();
    if (preview) {
      setBanPreview(preview);
      setSelectedBanClusters(
        (preview.clusterBreakdown ?? []).map((cluster) => cluster.root)
      );
      setSelectedBanUsers([
        ...new Set(
          (preview.clusterBreakdown ?? []).flatMap((cluster) => cluster.members)
        ),
      ]);
      setConfirmBanOpen(true);
    }
  };

  const handleConfirmBan = async () => {
    await banHive({
      selectedUsers: selectedBanUsers,
      selectedClusters: selectedBanClusters,
    });
    setConfirmBanOpen(false);
    setBanPreview(null);
  };

  const toggleBanUser = (username: string) => {
    setSelectedBanUsers((current) =>
      current.includes(username)
        ? current.filter((entry) => entry !== username)
        : [...current, username]
    );
  };

  const toggleBanCluster = (root: string) => {
    setSelectedBanClusters((current) =>
      current.includes(root)
        ? current.filter((entry) => entry !== root)
        : [...current, root]
    );
  };

  const handleRemoveCluster = async (root: string) => {
    await removeCluster(root);
    setRemoveClusterPrompt(null);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#3d0d11_0%,#1f0407_40%,#09090b_100%)] text-white">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="rounded-2xl border border-red-900/50 bg-black/35 p-4 shadow-[0_0_45px_rgba(239,68,68,0.12)] backdrop-blur-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-red-300">
                HiveCatch Security Monitor
              </p>
              <h1 className="mt-1 text-3xl font-black leading-tight text-red-100 sm:text-4xl">
                Coordinated Abuse Dashboard
              </h1>
              <p className="mt-2 text-sm text-red-100/80">
                {username ? `Operator: u/${username}` : 'Operator unavailable'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={refresh}
                disabled={loading}
              >
                Refresh
              </button>
              <button
                className="rounded-lg border border-red-300/70 bg-[#7f1d1d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#991b1b] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleReviewBan}
                disabled={loading}
              >
                Review Ban
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-red-900/80 bg-red-950/45 p-4">
              <p className="text-xs uppercase tracking-wide text-red-300/90">
                Signals {range === 'all' ? 'All Time' : 'In Range'}
              </p>
              <p className="mt-1 text-3xl font-bold text-red-100">
                {incidents.length}
              </p>
              <p className="mt-2 text-xs text-red-100/60">
                1 signal = 1 report or report-like event.
              </p>
            </div>
            <div className="rounded-xl border border-red-900/80 bg-red-950/45 p-4">
              <p className="text-xs uppercase tracking-wide text-red-300/90">
                Cluster Roots {range === 'all' ? 'All Time' : 'In Range'}
              </p>
              <p className="mt-1 text-3xl font-bold text-red-100">
                {suspects.length}
              </p>
            </div>
            <div className="rounded-xl border border-red-900/80 bg-red-950/45 p-4">
              <p className="text-xs uppercase tracking-wide text-red-300/90">
                Dashboard State
              </p>
              <p className="mt-1 text-2xl font-bold text-red-100">
                Live Monitoring
              </p>
            </div>
          </div>

          {actionMessage ? (
            <div className="mt-4 rounded-lg border border-red-300/30 bg-red-900/30 px-4 py-3 text-sm text-red-100">
              {actionMessage}
            </div>
          ) : null}

          {removeClusterPrompt ? (
            <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-950/35 px-4 py-3 text-sm text-amber-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  Remove cluster u/{removeClusterPrompt} from the dashboard and
                  incident feed?
                </p>
                <div className="flex gap-2">
                  <button
                    className="rounded-md border border-white/15 px-3 py-1 text-xs font-semibold text-amber-50 transition hover:bg-white/10"
                    onClick={() => setRemoveClusterPrompt(null)}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-md border border-amber-300/70 bg-amber-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      void handleRemoveCluster(removeClusterPrompt);
                    }}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {(
              [
                ['all', 'All'],
                ['day', '24h'],
                ['month', '30d'],
                ['year', '365d'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`rounded-full border px-3 py-1 transition ${
                  range === value
                    ? 'border-red-300 bg-red-700/70 text-white'
                    : 'border-white/15 bg-white/5 text-red-100/80 hover:bg-white/10'
                }`}
                onClick={() => setRange(value)}
                disabled={loading}
              >
                {label}
              </button>
            ))}
            <span className="text-xs text-red-100/60">
              Showing {rangeLabel}
            </span>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
              <h2 className="text-lg font-bold text-red-100">
                Cluster Members
              </h2>
              <p className="mt-1 text-xs text-red-100/60">
                These are the accounts linked to the reported item by shared
                thread activity and mention patterns.
              </p>
              <div className="mt-3 space-y-3">
                {suspects.length === 0 ? (
                  <p className="text-sm text-red-100/70">
                    No linked cluster members detected yet.
                  </p>
                ) : (
                  suspects.map((suspect) => (
                    <article
                      key={suspect.username}
                      className="rounded-lg border border-red-900/60 bg-black/25 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-red-100">
                          u/{suspect.username}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold uppercase tracking-wide text-red-300">
                            {suspect.reports} signals
                          </p>
                          <button
                            className="rounded-md border border-red-500/60 px-2 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-700/30"
                            onClick={() =>
                              setRemoveClusterPrompt(suspect.username)
                            }
                            disabled={loading}
                          >
                            Remove cluster
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {suspect.linkedAccounts.length === 0 ? (
                          <span className="rounded-md border border-white/15 px-2 py-1 text-xs text-red-100/70">
                            no linked members
                          </span>
                        ) : (
                          suspect.linkedAccounts.map((link) => (
                            <span
                              key={`${suspect.username}-${link.username}`}
                              className="rounded-md border border-red-500/70 bg-red-700/40 px-2 py-1 text-xs text-red-50"
                            >
                              u/{link.username} - {link.clusterMatchPercent}%
                            </span>
                          ))
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
              <h2 className="text-lg font-bold text-red-100">Incident Feed</h2>
              <p className="mt-1 text-xs text-red-100/60">
                Counts both native Reddit reports and public report phrases like
                !report / !scam / !spam when a suspect is mentioned.
              </p>
              <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
                {incidents.length === 0 ? (
                  <p className="text-sm text-red-100/70">
                    Incident feed is empty for this range.
                  </p>
                ) : (
                  incidents.map((incident) => (
                    <article
                      key={incident.incidentId}
                      className="rounded-lg border border-red-900/60 bg-black/25 p-3 transition hover:border-red-400/70 hover:bg-black/35"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <a
                          className="min-w-0 flex-1 cursor-pointer rounded-md text-left no-underline transition hover:underline"
                          href={toRedditCommentsUrl(incident.postId)}
                          target="_blank"
                          rel="noreferrer noopener"
                          title="Open source post on Reddit in a new tab"
                        >
                          <p className="text-sm font-medium text-red-100">
                            u/{incident.reporter} flagged{' '}
                            {incident.targetLabel ?? `u/${incident.suspect}`}
                          </p>
                          <p className="mt-1 text-xs text-red-200/80">
                            {incident.sourceType.toUpperCase()} -{' '}
                            {incident.postId}
                          </p>
                        </a>
                        <button
                          className="shrink-0 rounded-md border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-100 transition hover:bg-red-700/30"
                          onClick={async (event) => {
                            event.stopPropagation();
                            await deleteSignal(incident.incidentId);
                          }}
                          disabled={loading}
                          title="Delete this signal"
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>

          {confirmBanOpen && banPreview ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
              <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl border border-red-800 bg-[#1a0709] p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-red-100">
                      Confirm ban action
                    </h3>
                    <p className="mt-1 text-sm text-red-100/70">
                      {banPreview.message}
                    </p>
                  </div>
                  <button
                    className="rounded-md border border-white/15 px-3 py-1 text-sm text-red-100"
                    onClick={() => {
                      setConfirmBanOpen(false);
                      setBanPreview(null);
                    }}
                    disabled={loading}
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-red-900/60 bg-black/25 p-4">
                    <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-red-300">
                      <ClusterIcon />
                      Hive clusters to ban
                    </h4>
                    <div className="mt-3 space-y-3">
                      {(banPreview.clusterBreakdown ?? []).map((cluster) => (
                        <div
                          key={cluster.root}
                          className="rounded-lg border border-red-900/50 bg-[#240a0d] p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <label className="flex items-center gap-2 font-semibold text-red-100">
                              <input
                                type="checkbox"
                                checked={selectedBanClusters.includes(
                                  cluster.root
                                )}
                                onChange={() => toggleBanCluster(cluster.root)}
                              />
                              Hive root u/{cluster.root}
                            </label>
                            <p className="text-xs text-red-200/80">
                              {cluster.reportCount} reports
                            </p>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {cluster.members.map((member) => (
                              <label
                                key={`${cluster.root}-${member}`}
                                className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-red-100"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedBanUsers.includes(member)}
                                  onChange={() => toggleBanUser(member)}
                                />
                                u/{member}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-red-900/60 bg-black/25 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-red-300">
                      Users that will be banned
                    </h4>
                    <p className="mt-2 text-sm text-red-100/80">
                      {(banPreview.attemptedUsers ?? [])
                        .filter((user) => selectedBanUsers.includes(user))
                        .map((user) => `u/${user}`)
                        .join(', ')}
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      className="rounded-lg border border-white/15 px-4 py-2 text-sm text-red-100 transition hover:bg-white/10"
                      onClick={() => {
                        setConfirmBanOpen(false);
                        setBanPreview(null);
                      }}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                    <button
                      className="rounded-lg border border-red-300/70 bg-[#7f1d1d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#991b1b] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleConfirmBan}
                      disabled={loading}
                    >
                      Confirm real ban
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <footer className="mt-8 flex flex-wrap gap-3 text-sm text-red-100/70">
            <button
              className="underline-offset-4 transition hover:text-red-50 hover:underline"
              onClick={() => navigateTo('https://developers.reddit.com/docs')}
            >
              Docs
            </button>
            <button
              className="underline-offset-4 transition hover:text-red-50 hover:underline"
              onClick={() => navigateTo('https://www.reddit.com/r/Devvit')}
            >
              r/Devvit
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
