export type ConnectionSummary = {
  username: string;
  weight: number;
  clusterMatchPercent: number;
};

export type SuspectSummary = {
  username: string;
  reports: number;
  linkedAccounts: ConnectionSummary[];
};

export type IncidentSummary = {
  incidentId: string;
  ts: number;
  postId: string;
  sourceId: string;
  sourceType: 'post' | 'comment';
  reporter: string;
  suspect: string;
  reason: string;
  targetLabel?: string;
};

export type HiveClusterSummary = {
  root: string;
  members: string[];
  reportCount: number;
};

export type DashboardSnapshot = {
  totalReports: number;
  clusterRoots: number;
  suspects: SuspectSummary[];
  incidents: IncidentSummary[];
};

export type InitResponse = {
  type: 'init';
  postId: string;
  username: string;
  snapshot: DashboardSnapshot;
};

export type RefreshResponse = {
  type: 'refresh';
  postId: string;
  snapshot: DashboardSnapshot;
};

export type ActionResponse = {
  type: 'action';
  postId: string;
  attemptedUsers: string[];
  bannedUsers: string[];
  threadLocked: boolean;
  reportSubmitted: boolean;
  message: string;
  dryRun?: boolean;
  clusterBreakdown?: HiveClusterSummary[];
};

export type CleanupResponse = {
  status: 'success' | 'error';
  message: string;
  snapshot?: DashboardSnapshot;
};
