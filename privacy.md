# Privacy Policy

HiveCatch is a moderation dashboard for Reddit communities. It processes subreddit activity so moderators can identify coordinated abuse patterns and review signals in real time.

## Information We Process

HiveCatch may process and store the following information:

- Reddit usernames that appear in reports, comments, posts, or cluster activity
- post IDs, comment IDs, and incident timestamps
- incident reasons and report text
- raw moderation payloads for debugging and verification
- derived cluster relationships based on thread activity and report patterns

## How the Data Is Used

The data is used only to:

- display the dashboard
- compute clusters and incident counts
- help moderators review and action suspicious behavior
- debug trigger and report handling

## Storage

HiveCatch uses Redis as application storage for live dashboard data and incident history. Data is kept only for the purpose of operating the app and supporting moderation workflows.

## Sharing

HiveCatch does not sell user data. Data is not shared with third parties except as required to operate on Reddit's platform or to support moderator actions within the target subreddit.

## Retention

Data remains available while the app is installed and the stored records exist in Redis. Moderators can delete signals or remove clusters from the dashboard when they no longer want them displayed.

## Security

Access to the dashboard is intended for subreddit moderators. The app is designed to minimize unnecessary data collection and focuses on moderation-related metadata.

## Contact

If you have questions about how HiveCatch handles data, contact the subreddit moderation team or the app maintainer.
